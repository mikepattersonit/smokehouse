import json, os, boto3
from boto3.dynamodb.conditions import Attr
from decimal import Decimal

DDB = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("SESSIONS_TABLE", "sessions")

def _cors():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "OPTIONS,GET",
    }

def _to_native(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, list):
        return [_to_native(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _to_native(v) for k, v in obj.items()}
    return obj

def lambda_handler(event, context):
    # CORS preflight
    method = (event.get("requestContext", {}).get("http", {}).get("method") or
              event.get("httpMethod", "GET")).upper()
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": _cors()}

    qs = event.get("queryStringParameters") or {}
    try:
        limit = min(int(qs.get("limit", 50)), 100)
    except (ValueError, TypeError):
        limit = 50

    table = DDB.Table(TABLE_NAME)

    # Scan and sort descending by session_id (YYYYMMDDHHMMSS sorts lexicographically)
    resp = table.scan(
        ProjectionExpression="session_id, #s, started_at, last_seen, seen_count",
        ExpressionAttributeNames={"#s": "status"},
    )
    items = resp.get("Items", [])

    # Handle pagination if table is large
    while "LastEvaluatedKey" in resp and len(items) < limit:
        resp = table.scan(
            ProjectionExpression="session_id, #s, started_at, last_seen, seen_count",
            ExpressionAttributeNames={"#s": "status"},
            ExclusiveStartKey=resp["LastEvaluatedKey"],
        )
        items.extend(resp.get("Items", []))

    # Sort newest-first by session_id string (format YYYYMMDDHHMMSS)
    items.sort(key=lambda x: str(x.get("session_id", "")), reverse=True)
    items = items[:limit]

    return {
        "statusCode": 200,
        "headers": _cors(),
        "body": json.dumps(_to_native(items)),
    }
