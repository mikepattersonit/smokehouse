import boto3
import openai
import os
import json
from decimal import Decimal
from boto3.dynamodb.conditions import Key

SSM_PARAM_NAME = os.environ.get("OPENAI_API_KEY_PARAM", "/smokehouse/openai/api_key")
_ssm = boto3.client("ssm")

def _get_openai_key():
    resp = _ssm.get_parameter(Name=SSM_PARAM_NAME, WithDecryption=True)
    return resp["Parameter"]["Value"]


# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name='us-east-2')

# Initialize OpenAI API

SSM_PARAM_NAME = os.environ.get("OPENAI_API_KEY_PARAM", "/smokehouse/openai/api_key")
_ssm = boto3.client("ssm")

def _get_openai_key():
    resp = _ssm.get_parameter(Name=SSM_PARAM_NAME, WithDecryption=True)
    return resp["Parameter"]["Value"]

#openai.api_key = _get_openai_key()
openai.api_key = _get_openai_key()


# Environment variables for table names
PROBE_ASSIGNMENT_TABLE = os.getenv('PROBE_ASSIGNMENT_TABLE', 'ProbeAssignments')
SENSOR_DATA_TABLE = os.getenv('SENSOR_DATA_TABLE', 'sensor_data')

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
    # Extract session_id and probe_id from the request
    session_id = event.get('session_id')
    probe_id = event.get('probe_id')
    
    # Validate input
    if not session_id or not probe_id:
        return {
            'statusCode': 400,
            'body': json.dumps('Missing session_id or probe_id in the request')
        }
    
    # Get probe assignment details
    try:
        probe_table = dynamodb.Table(PROBE_ASSIGNMENT_TABLE)
        probe_response = probe_table.query(
            KeyConditionExpression=Key('session_id').eq(session_id) & Key('probe_id').eq(probe_id)
        )
        if not probe_response.get('Items'):
            return {
                'statusCode': 404,
                'body': json.dumps('Probe assignment not found')
            }
        probe_data = probe_response['Items'][0]
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error fetching probe assignment: {str(e)}')
        }

    # Get sensor data for the current session
    try:
        sensor_table = dynamodb.Table(SENSOR_DATA_TABLE)
        sensor_response = sensor_table.query(
            KeyConditionExpression=Key('session_id').eq(session_id)
        )
        sensor_data = [convert_decimal(item) for item in sensor_response.get('Items', [])]
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error fetching sensor data: {str(e)}')
        }

    # Prepare data to send to ChatGPT
    meat_type = probe_data.get('meat_type', 'unknown')
    meat_weight = probe_data.get('weight', 'unknown')
    temp_history = [item.get(probe_id) for item in sensor_data if probe_id in item]

    prompt = f"""
    You are a cooking expert. I am smoking {meat_weight} lbs of {meat_type}.
    The temperature readings for the probe are as follows: {temp_history}.
    Based on this history, provide me with the estimated time left for cooking, and any suggestions for optimizing the cooking process.
    """

    # Call OpenAI's ChatGPT
    try:
        response = openai.Completion.create(
            engine="text-davinci-003",
            prompt=prompt,
            max_tokens=150
        )
        advice = response['choices'][0]['text'].strip()
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error calling OpenAI API: {str(e)}')
        }

    # Return AI advice
    return {
        'statusCode': 200,
        'body': json.dumps({'advice': advice})
    }
