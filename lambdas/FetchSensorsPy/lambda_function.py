import os, json, boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal

DDB = boto3.resource("dynamodb")
TABLE = DDB.Table(os.environ.get("SENSORS_TABLE", "sensor_data"))
GSI   = os.environ.get("SENSORS_GSI", "by_session_timestamp")

def _to_native(x):
    if isinstance(x, Decimal):
        return int(x) if x % 1 == 0 else float(x)
    if isinstance(x, list):
        return [_to_native(v) for v in x]
    if isinstance(x, dict):
        return {k:_to_native(v) for k,v in x.items()}
    return x

def lambda_handler(event, context):
    # API Gateway HTTP API event: queryStringParameters
    qs = (event or {}).get("queryStringParameters") or {}
    session_id = (qs.get("session_id") or "").strip()
    limit = int(qs.get("limit") or 100)
    if not session_id:
        return {"statusCode": 400, "headers":{"Content-Type":"application/json"},
                "body": json.dumps({"error":"missing session_id"})}

    # Query newest-first by session + timestamp
    resp = TABLE.query(
        IndexName=GSI,
        KeyConditionExpression=Key("session_id").eq(session_id),
        ScanIndexForward=False,
        Limit=limit
    )
    items = _to_native(resp.get("Items", []))
    return {"statusCode": 200, "headers":{"Content-Type":"application/json"},
            "body": json.dumps(items)}
