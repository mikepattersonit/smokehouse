import json, os, base64, boto3
from decimal import Decimal

DDB          = boto3.resource("dynamodb")
TABLE_NAME   = os.environ.get("SESSIONS_TABLE", "sessions")

# Fields the caller is allowed to update
ALLOWED_FIELDS = {"target_pit_temp_f"}

def _cors():
    return {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "OPTIONS,POST",
    }

def _parse_event(event):
    if isinstance(event, str):      return json.loads(event)
    if not isinstance(event, dict): return {}
    body = event.get("body")
    if body is None:                return event
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8", "ignore")
    return json.loads(body) if isinstance(body, str) else body

def lambda_handler(event, context):
    method = (event.get("requestContext", {}).get("http", {}).get("method") or
              event.get("httpMethod", "POST")).upper()
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": _cors()}

    payload    = _parse_event(event)
    session_id = payload.get("session_id")

    if not session_id:
        return {"statusCode": 400, "headers": _cors(),
                "body": json.dumps({"error": "session_id is required"})}

    updates = {k: v for k, v in payload.items() if k in ALLOWED_FIELDS and v is not None}
    if not updates:
        return {"statusCode": 400, "headers": _cors(),
                "body": json.dumps({"error": f"No valid fields to update. Allowed: {ALLOWED_FIELDS}"})}

    # Convert numeric strings to Decimal for DynamoDB
    def _coerce(v):
        try:    return Decimal(str(v))
        except: return str(v)

    expr_parts = [f"#{k} = :{k}" for k in updates]
    expr_names = {f"#{k}": k for k in updates}
    expr_vals  = {f":{k}": _coerce(v) for k, v in updates.items()}

    table = DDB.Table(TABLE_NAME)
    table.update_item(
        Key={"session_id": session_id},
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_vals,
    )

    return {"statusCode": 200, "headers": _cors(),
            "body": json.dumps({"ok": True, "updated": list(updates.keys())})}
