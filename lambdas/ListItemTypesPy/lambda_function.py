import os, json, boto3
from decimal import Decimal

DDB   = boto3.resource('dynamodb')
TABLE = os.environ.get('ITEM_TYPES_TABLE', 'meat_types')
table = DDB.Table(TABLE)

CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
}

def _to_native(x):
    if isinstance(x, Decimal):
        return int(x) if x % 1 == 0 else float(x)
    if isinstance(x, list):
        return [_to_native(v) for v in x]
    if isinstance(x, dict):
        return {k: _to_native(v) for k, v in x.items()}
    return x

def lambda_handler(event, context):
    method = (event.get("requestContext", {}).get("http", {}).get("method") or
              event.get("httpMethod", "GET")).upper()
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": CORS}

    resp  = table.scan()
    raw   = _to_native(resp.get("Items", []))

    # Sort alphabetically by name for consistent dropdown ordering
    raw.sort(key=lambda x: x.get("name", ""))

    # Normalise field names so the frontend always gets the same shape
    items = []
    for r in raw:
        items.append({
            "name":                  r.get("name", ""),
            "description":           r.get("description", ""),
            "smoke_type":            r.get("smoke_type", "hot"),
            "target_internal_temp_f": r.get("target_internal_temp_f"),   # None for cold smoke
            "max_safe_temp_f":       r.get("max_safe_temp_f"),           # None for hot smoke
        })

    return {
        "statusCode": 200,
        "headers":    {**CORS, "Content-Type": "application/json"},
        "body":       json.dumps(items),
    }
