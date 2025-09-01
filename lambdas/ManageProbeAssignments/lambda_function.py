import json
import boto3
import os
from boto3.dynamodb.conditions import Key

# Initialize the DynamoDB resource
dynamodb = boto3.resource('dynamodb', region_name='us-east-2')
table_name = os.getenv('PROBE_ASSIGNMENT_TABLE', 'ProbeAssignments')

def lambda_handler(event, context):
    try:
        # Parse the request body
        body = json.loads(event['body'])
        session_id = body['session_id']
        probe_id = body['probe_id']
        meat_type = body.get('meat_type')
        weight = body.get('weight')
        min_alert = body.get('min_alert')
        max_alert = body.get('max_alert')
        mobile_number = body.get('mobile_number')

        # Access the table
        table = dynamodb.Table(table_name)

        # Prepare UpdateExpression and ExpressionAttributeValues
        update_expression_parts = []
        expression_attribute_values = {}

        if meat_type is not None:
            update_expression_parts.append("meat_type = :mt")
            expression_attribute_values[":mt"] = meat_type

        if weight is not None:
            update_expression_parts.append("weight = :wt")
            expression_attribute_values[":wt"] = weight

        if min_alert is not None:
            update_expression_parts.append("min_alert = :min")
            expression_attribute_values[":min"] = Decimal(str(min_alert))

        if max_alert is not None:
            update_expression_parts.append("max_alert = :max")
            expression_attribute_values[":max"] = Decimal(str(max_alert))

        if mobile_number is not None:
            update_expression_parts.append("mobile_number = :mob")
            expression_attribute_values[":mob"] = mobile_number

        # Construct UpdateExpression
        if not update_expression_parts:
            raise ValueError("No valid fields to update.")

        update_expression = "SET " + ", ".join(update_expression_parts)

        # Update the probe assignment for the session
        response = table.update_item(
            Key={
                'session_id': session_id,
                'probe_id': probe_id
            },
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values,
            ReturnValues="UPDATED_NEW"
        )

        # Return success response
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Probe assignment updated successfully',
                'updated_attributes': response.get('Attributes', {})
            })
        }

    except Exception as e:
        print(f"Error updating probe assignment: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f"Could not update probe assignment: {str(e)}"
            })
        }
