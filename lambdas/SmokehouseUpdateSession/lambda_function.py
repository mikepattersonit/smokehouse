import boto3
import time
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')
sessions_table = dynamodb.Table('sessions')

SESSION_TIMEOUT = 45 * 60  # 45 minutes in seconds


def parse_last_seen(ts):
    """Convert last_seen string to epoch int. Handles multiple formats."""
    if ts is None:
        return None
    try:
        s = str(ts)
        # "20251225T184651Z" (firmware format)
        if len(s) == 16 and 'T' in s and s.endswith('Z'):
            dt = datetime.strptime(s, "%Y%m%dT%H%M%SZ")
            return int(dt.replace(tzinfo=timezone.utc).timestamp())
        # ISO 8601 "2025-12-25T18:46:51Z"
        if 'T' in s and '-' in s:
            dt = datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")
            return int(dt.replace(tzinfo=timezone.utc).timestamp())
        # Plain epoch int string
        return int(float(s))
    except Exception:
        return None


def lambda_handler(event, context):
    now = int(time.time())
    ended = []
    errors = []

    # Scan sessions table for active sessions only
    resp = sessions_table.scan(
        FilterExpression=boto3.dynamodb.conditions.Attr('status').eq('active'),
        ProjectionExpression='session_id, last_seen',
    )
    active_sessions = resp.get('Items', [])

    for session in active_sessions:
        session_id = session.get('session_id')
        last_seen = session.get('last_seen')
        last_epoch = parse_last_seen(last_seen)

        if last_epoch is None:
            print(f"Could not parse last_seen for {session_id}: {last_seen!r}")
            continue

        age = now - last_epoch
        if age > SESSION_TIMEOUT:
            try:
                sessions_table.update_item(
                    Key={'session_id': session_id},
                    UpdateExpression='SET #s = :ended, end_time = :et',
                    ExpressionAttributeNames={'#s': 'status'},
                    ExpressionAttributeValues={
                        ':ended': 'ended',
                        ':et': datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                    },
                )
                ended.append(session_id)
                print(f"Ended session {session_id} (last seen {age // 60}m ago)")
            except Exception as e:
                errors.append(str(e))
                print(f"Error ending session {session_id}: {e}")

    print(f"Done — ended {len(ended)} session(s), {len(errors)} error(s)")
    return {'ended': ended, 'errors': errors}
