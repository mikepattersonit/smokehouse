import json
import os
import boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key

DDB = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("ASSIGN_TABLE", "probe_assignments")
TABLE = DDB.Table(TABLE_NAME)

def _to_native(x):
    if isinstance(x, Decimal):
        return int(x) if x % 1 == 0 else float(x)
    if isinstance(x, list):
        return [_to_native(v) for v in x]
    if isinstance(x, dict):
        return {k: _to_native(v) for k, v in x.items()}
    return x

def _response(status, body=None):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
        "body": json.dumps(body or {}),
    }

def lambda_handler(event, context):
    method = (event.get("requestContext", {}).get("http", {}).get("method")
              or event.get("httpMethod") or "GET").upper()

    if method == "OPTIONS":
        return _response(204, {})  # CORS preflight

    if method == "GET":
        # Expect query param: session_id
        qs = event.get("queryStringParameters") or {}
        session_id = qs.get("session_id") or qs.get("sessionId")
        if not session_id:
            return _response(400, {"ok": False, "error": "session_id is required"})
        try:
            resp = TABLE.query(
                KeyConditionExpression=Key("session_id").eq(session_id)
            )
            items = _to_native(resp.get("Items", []))
            return _response(200, {"ok": True, "items": items})
        except Exception as e:
            return _response(500, {"ok": False, "error": str(e)})

    if method == "POST":
        try:
            body_raw = event.get("body") or "{}"
            data = json.loads(body_raw)
        except Exception:
            return _response(400, {"ok": False, "error": "Invalid JSON body"})

        session_id  = str(data.get("sessionId") or data.get("session_id") or "").strip()
        probe_id    = str(data.get("probeId") or data.get("probe_id") or "").strip()
        item_type   = (data.get("itemType") or data.get("item_type") or "").strip()
        item_weight = data.get("itemWeight") or data.get("weight")  # may be str/num
        min_alert   = data.get("minAlert")
        max_alert   = data.get("maxAlert")
        mobile      = data.get("mobileNumber") or data.get("mobile_number")

        if not session_id or not probe_id:
            return _response(400, {"ok": False, "error": "sessionId and probeId are required"})

        item = {
            "session_id": session_id,
            "probe_id": probe_id,
            "item_type": item_type,
            "item_weight": item_weight if item_weight not in ("", None) else None,
            "min_alert": min_alert if min_alert not in ("", None) else None,
            "max_alert": max_alert if max_alert not in ("", None) else None,
            "mobile_number": mobile if mobile not in ("", None) else None,
        }

        try:
            TABLE.put_item(Item=item)
            return _response(200, {"ok": True, "saved": True, "item": _to_native(item)})
        except Exception as e:
            return _response(500, {"ok": False, "saved": False, "error": str(e)})

    # Fallback
    return _response(405, {"ok": False, "error": f"Method {method} not allowed"})
