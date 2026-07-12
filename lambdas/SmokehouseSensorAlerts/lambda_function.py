# Watches the sensor_data DynamoDB stream and texts household contacts via
# SNS when a probe crosses its configured min/max threshold.
import os
import json
import time
import boto3
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeDeserializer

dynamodb = boto3.resource('dynamodb', region_name='us-east-2')
sns_client = boto3.client('sns', region_name='us-east-2')

PROBE_ASSIGNMENT_TABLE = os.getenv('PROBE_ASSIGNMENT_TABLE', 'probe_assignments')
CONTACTS_TABLE = os.getenv('CONTACTS_TABLE', 'alert_contacts')
ANALYTICS_TABLE = os.getenv('ANALYTICS_TABLE', 'session_analytics')

deser = TypeDeserializer()

def _from_ddb_image(img):
    return {k: deser.deserialize(v) for k, v in img.items()}

def _get_alert_state(session_id, probe_id):
    try:
        table = dynamodb.Table(ANALYTICS_TABLE)
        result = table.get_item(Key={"session_id": session_id, "metric": f"alert_state_{probe_id}"})
        item = result.get("Item")
        return item.get("state") if item else None
    except Exception as e:
        print(f'Error reading alert state for {probe_id}: {str(e)}')
        return None

def _put_alert_state(session_id, probe_id, state):
    try:
        table = dynamodb.Table(ANALYTICS_TABLE)
        table.put_item(Item={
            "session_id": session_id,
            "metric": f"alert_state_{probe_id}",
            "state": state,
            "computed_at": int(time.time()),
        })
    except Exception as e:
        print(f'Error writing alert state for {probe_id}: {str(e)}')

def _enabled_contacts():
    try:
        table = dynamodb.Table(CONTACTS_TABLE)
        resp = table.scan()
        return [c for c in resp.get('Items', []) if c.get('enabled', True)]
    except Exception as e:
        print(f'Error reading alert_contacts: {str(e)}')
        return []

def lambda_handler(event, context):
    for record in event.get('Records', []):
        if record.get('eventName') not in ('INSERT', 'MODIFY'):
            continue

        new_image_raw = record.get('dynamodb', {}).get('NewImage')
        if not new_image_raw:
            continue
        row = _from_ddb_image(new_image_raw)
        session_id = str(row.get('session_id') or '')
        if not session_id:
            continue

        try:
            probe_table = dynamodb.Table(PROBE_ASSIGNMENT_TABLE)
            response = probe_table.query(
                KeyConditionExpression=Key('session_id').eq(session_id)
            )
            assignments = response.get('Items', [])
        except Exception as e:
            print(f'Error querying probe assignment table: {str(e)}')
            continue

        if not assignments:
            continue

        for assignment in assignments:
            probe_id = assignment['probe_id']
            min_alert = assignment.get('min_alert')
            max_alert = assignment.get('max_alert')
            if min_alert is None and max_alert is None:
                continue

            probe_value = row.get(probe_id)
            if probe_value is None or float(probe_value) == -999:
                continue
            probe_value = float(probe_value)

            breach = None
            if min_alert is not None and probe_value < float(min_alert):
                breach = 'low'
            elif max_alert is not None and probe_value > float(max_alert):
                breach = 'high'

            # Only text on the transition into a breach state, not on every
            # single row for as long as the breach persists.
            prev_state = _get_alert_state(session_id, probe_id)
            if breach == prev_state:
                continue
            _put_alert_state(session_id, probe_id, breach)
            if breach is None:
                continue

            if breach == 'low':
                message = f'Smokehouse alert: {probe_id} is {probe_value}°F, below the minimum threshold of {min_alert}°F.'
            else:
                message = f'Smokehouse alert: {probe_id} is {probe_value}°F, above the maximum threshold of {max_alert}°F.'

            contacts = _enabled_contacts()
            if not contacts:
                print(f'No enabled contacts to notify for {probe_id}: {message}')
                continue

            for contact in contacts:
                phone = contact.get('phone_number')
                if not phone:
                    continue
                try:
                    sns_client.publish(
                        PhoneNumber=phone,
                        Message=message,
                        MessageAttributes={
                            'AWS.SNS.SMS.SMSType': {
                                'DataType': 'String',
                                'StringValue': 'Transactional'
                            }
                        }
                    )
                    print(f'Alert sent to {phone} for {probe_id}: {message}')
                except Exception as e:
                    print(f'Error sending alert to {phone} for {probe_id}: {str(e)}')

    return {
        'statusCode': 200,
        'body': json.dumps('Alert processing complete')
    }
