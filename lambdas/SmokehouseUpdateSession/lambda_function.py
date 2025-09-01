import boto3
import time
from datetime import datetime

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name='us-east-2')

# Table names
SENSOR_TABLE = 'sensor_data'
SESSIONS_TABLE = 'sessions'

# Constants
SESSION_TIMEOUT = 45 * 60  # 45 minutes in seconds

# DynamoDB table references
sensor_table = dynamodb.Table(SENSOR_TABLE)
sessions_table = dynamodb.Table(SESSIONS_TABLE)

def lambda_handler(event, context):
    now = int(time.time())
    
    try:
        # Step 1: Scan the sensor data table to get recent session IDs
        response = sensor_table.scan(
            ProjectionExpression='session_id, timestamp'
        )
        items = response.get('Items', [])
        
        # Create a dictionary of latest timestamps for each session
        sessions = {}
        for item in items:
            session_id = item.get('session_id')
            timestamp = item.get('timestamp')
            if session_id not in sessions or timestamp > sessions[session_id]:
                sessions[session_id] = timestamp
        
        # Step 2: Update the sessions table
        for session_id, latest_timestamp in sessions.items():
            # Get existing session details from sessions table
            response = sessions_table.get_item(
                Key={'SessionID': session_id}
            )
            session_item = response.get('Item')

            # If the session does not exist, create it
            if not session_item:
                sessions_table.put_item(
                    Item={
                        'SessionID': session_id,
                        'StartTime': datetime.utcfromtimestamp(latest_timestamp).isoformat(),
                        'Status': 'active',
                    }
                )
                print(f"New session started: {session_id}")

            # If the session exists and is still active, check if it needs to be ended
            elif session_item['Status'] == 'active':
                if now - int(latest_timestamp) > SESSION_TIMEOUT:
                    # End the session
                    sessions_table.update_item(
                        Key={'SessionID': session_id},
                        UpdateExpression='SET #s = :ended, EndTime = :end_time',
                        ExpressionAttributeNames={'#s': 'Status'},
                        ExpressionAttributeValues={
                            ':ended': 'ended',
                            ':end_time': datetime.utcfromtimestamp(now).isoformat()
                        }
                    )
                    print(f"Session ended: {session_id}")

    except Exception as e:
        print(f"Error managing sessions: {str(e)}")

