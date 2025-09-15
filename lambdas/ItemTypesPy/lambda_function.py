import os, json, boto3
from decimal import Decimal

ddb = boto3.resource('dynamodb')
TABLE = os.environ.get('ITEM_TYPES_TABLE', 'meat_types')
table = ddb.Table(TABLE)

def _to_native(x):
    if isinstance(x, Decimal):
        return int(x) if x % 1 == 0 else float(x)
    if isinstance(x, list):
        return [_to_native(v) for v in x]
    if isinstance(x, dict):
        return {k: _to_native(v) for k, v in x.items()}
    return x

def _resp(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        },
        "body": json.dumps(body)
    }

def lambda_handler(event, context):
    try:
        # Basic scan (small reference table)
        res = table.scan()
        items = _to_native(res.get("Items", []))
        # Normalize field name for UI: prefer 'name'
        for it in items:
            if "name" not in it:
                if "item_type" in it: it["name"] = it["item_type"]
            # keep original fields too; UI uses 'name'
        return _resp(200, items)
    except Exception as e:
        return _resp(500, {"error": str(e), "table": TABLE})
