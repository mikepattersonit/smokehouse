# Lambda function to watch DynamoDB and send alerts via SNS
import boto3
import os
import json
from decimal import Decimal

# Initialize DynamoDB and SNS clients
dynamodb = boto3.resource('dynamodb', region_name='us-east-2')
sns_client = boto3.client('sns', region_name='us-east-2')

# Environment variables for SNS topic and table names
PROBE_ASSIGNMENT_TABLE = os.getenv('PROBE_ASSIGNMENT_TABLE', 'ProbeAssignments')
SNS_TOPIC_ARN = os.getenv('SNS_TOPIC_ARN', 'arn:aws:sns:us-east-2:123456789012:SmokehouseAlerts')

# Helper function to convert DynamoDB Decimal to Python float
def convert_decimal(obj):
    if isinstance(obj, list):
        return [convert_decimal(x) for x in obj]
    if isinstance(obj, dict):
        return {k: convert_decimal(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        return float(obj)
    return obj

def lambda_handler(event, context):
    # Loop through each record in the DynamoDB stream
    for record in event['Records']:
        if record['eventName'] == 'INSERT' or record['eventName'] == 'MODIFY':
            # Extract the new image from the record
            new_image = record['dynamodb']['NewImage']
            session_id = new_image['session_id']['N']
            probe_values = convert_decimal(new_image)

            # Fetch the probe assignment for this session
            try:
                probe_table = dynamodb.Table(PROBE_ASSIGNMENT_TABLE)
                response = probe_table.query(
                    KeyConditionExpression=boto3.dynamodb.conditions.Key('session_id').eq(session_id)
                )
                assignments = response.get('Items', [])
                if not assignments:
                    print(f'No probe assignments found for session_id: {session_id}')
                    continue

                # Iterate through the assigned probes and compare values
                for assignment in assignments:
                    probe_id = assignment['probe_id']
                    min_alert = assignment.get('minAlert')
                    max_alert = assignment.get('maxAlert')
                    mobile_number = assignment.get('mobileNumber')

                    # Extract the current probe reading from the sensor data
                    probe_value = probe_values.get(probe_id)
                    if probe_value is None:
                        continue

                    # Check if the reading exceeds the threshold
                    alert_message = None
                    if min_alert is not None and probe_value < min_alert:
                        alert_message = f'Alert for Probe {probe_id}: Temperature {probe_value} is below the minimum threshold of {min_alert}.'
                    elif max_alert is not None and probe_value > max_alert:
                        alert_message = f'Alert for Probe {probe_id}: Temperature {probe_value} exceeds the maximum threshold of {max_alert}.'

                    # Send alert via SNS if needed
                    if alert_message and mobile_number:
                        try:
                            sns_client.publish(
                                PhoneNumber=mobile_number,
                                Message=alert_message,
                                TopicArn=SNS_TOPIC_ARN
                            )
                            print(f'Alert sent for probe {probe_id}: {alert_message}')
                        except Exception as e:
                            print(f'Error sending alert for probe {probe_id}: {str(e)}')

            except Exception as e:
                print(f'Error querying probe assignment table: {str(e)}')

    return {
        'statusCode': 200,
        'body': json.dumps('Alert processing complete')
    }
