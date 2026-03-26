import os, json, time, boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key, Attr

dynamodb = boto3.resource('dynamodb')
ssm = boto3.client('ssm')

SESSIONS_TABLE = os.environ.get('SESSIONS_TABLE', 'sessions')
SENSORS_TABLE  = os.environ.get('SENSORS_TABLE', 'sensor_data')
t_sessions = dynamodb.Table(SESSIONS_TABLE)
t_sensors  = dynamodb.Table(SENSORS_TABLE)

def to_native(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, list):
        return [to_native(v) for v in obj]
    if isinstance(obj, dict):
        return {k: to_native(v) for k, v in obj.items()}
    return obj

def pick_latest(items):
    def to_int(v):
        try: return int(v)
        except Exception: return 0
    return sorted(items, key=lambda x: (to_int(x.get('started_at')), to_int(x.get('created_at'))), reverse=True)[0] if items else None

def get_gap_minutes():
    try:
        p = ssm.get_parameter(Name="/smokehouse/session_gap_mins", WithDecryption=False)
        return int(p['Parameter']['Value'])
    except Exception:
        return 30

def parse_ts_to_epoch(ts):
    if ts is None:
        return None
    try:
        if isinstance(ts, (int, float, Decimal)):
            return int(ts)
        s = str(ts)
        if len(s) == 6 and s.isdigit():  # HHMMSS (same-day heuristic)
            h, m, sec = int(s[0:2]), int(s[2:4]), int(s[4:6])
            now = time.localtime()
            return int(time.mktime((now.tm_year, now.tm_mon, now.tm_mday, h, m, sec, 0, 0, -1)))
        return int(s)  # epoch-like string
    except Exception:
        return None

def get_last_sensor_ts(session_id):
    # Try a Query assuming SK 'timestamp'; if not present, fallback to Scan
    try:
        resp = t_sensors.query(
            KeyConditionExpression=Key('session_id').eq(session_id),
            ProjectionExpression='#ts',
            ExpressionAttributeNames={'#ts': 'timestamp'},
            ScanIndexForward=False,
            Limit=1
        )
        items = resp.get('Items', [])
        if items:
            return items[0].get('timestamp')
    except Exception:
        pass
    # Fallback: Scan (slower)
    try:
        resp = t_sensors.scan(
            FilterExpression=Attr('session_id').eq(session_id),
            ProjectionExpression='timestamp'
        )
        items = [i for i in resp.get('Items', []) if 'timestamp' in i]
        items.sort(key=lambda x: str(x['timestamp']), reverse=True)
        return items[0]['timestamp'] if items else None
    except Exception:
        return None

def response(status_code, body):
    return {'statusCode': status_code, 'headers': {'Content-Type':'application/json'}, 'body': json.dumps(body)}

def lambda_handler(event, context):
    # Latest session (scan for now; we’ll index later)
    resp = t_sessions.scan(
        ProjectionExpression='session_id, started_at, created_at, #s',
        ExpressionAttributeNames={'#s': 'status'}
    )
    latest = pick_latest(resp.get('Items', []))
    if not latest:
        return response(404, {'error':'no sessions'})

    session_id = str(latest.get('session_id'))

    last_ts    = get_last_sensor_ts(session_id)
    last_epoch = parse_ts_to_epoch(last_ts)
    now        = int(time.time())
    age_secs   = None if last_epoch is None else max(0, now - last_epoch)
    gap_secs   = get_gap_minutes() * 60
    status     = 'active' if (age_secs is not None and age_secs <= gap_secs) else 'stale'

    body = to_native({
        'session_id': session_id,
        'started_at': latest.get('started_at'),
        'status': status,
        'last_sample_ts': last_ts,
        'age_secs': age_secs,
        'gap_secs': gap_secs
    })
    return response(200, body)
