import json, os, base64
import boto3

DDB = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("ASSIGNMENTS_TABLE", "probe_assignments")

def _cors():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    }

def _parse_event(event):
    """
    Accepts:
      - API Gateway HTTP API v2 proxy ({ body, isBase64Encoded, routeKey, ... })
      - API Gateway REST proxy ({ body, isBase64Encoded, httpMethod, ... })
      - Direct Lambda invokes (event is already the JSON dict)
      - Raw JSON string
    Returns a dict payload.
    """
    try:
        if isinstance(event, str):
            return json.loads(event)
        if not isinstance(event, dict):
            return {}

        # Preflight
        if str(event.get("routeKey", "")).startswith("OPTIONS") or \
           (event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS"):
            return {"__preflight__": True}

        body = event.get("body", None)
        if body is None:
            # Some integrations or tests send the JSON directly
            return event

        if event.get("isBase64Encoded"):
            body = base64.b64decode(body).decode("utf-8", "ignore")

        return json.loads(body) if isinstance(body, str) else body
    except Exception:
        return {}

def lambda_handler(event, context):
    payload = _parse_event(event)

    # Respond to CORS preflight (204)
    if payload.get("__preflight__"):
        return {"statusCode": 204, "headers": _cors()}

    # Accept multiple field casings
    probe_id   = payload.get("probeId")   or payload.get("probe_id")
    session_id = payload.get("sessionId") or payload.get("session_id")
    item_type  = payload.get("itemType")  or payload.get("meat_type") or ""
    item_weight = payload.get("itemWeight") or payload.get("weight") or ""
    min_alert  = payload.get("minAlert")  or payload.get("min_alert")
    max_alert  = payload.get("maxAlert")  or payload.get("max_alert")
    mobile     = payload.get("mobileNumber") or payload.get("mobile_number")

    if not (probe_id and session_id):
        return {
            "statusCode": 400,
            "headers": _cors(),
            "body": json.dumps({"error":"probeId and sessionId are required","received": payload})
        }

    # Optional: persist to DynamoDB if table exists
    saved, err = False, None
    try:
        table = DDB.Table(TABLE_NAME)
        # Normalize numeric fields if provided (ignore blanks)
        def _num(v):
            if v in (None, "", "null"): return None
            try: return float(v)
            except: return None

        item = {
            "session_id": str(session_id),
            "probe_id":   str(probe_id),
            "item_type":  str(item_type),
            "item_weight": str(item_weight) if item_weight != "" else None,
            "min_alert":  _num(min_alert),
            "max_alert":  _num(max_alert),
            "mobile_number": str(mobile) if mobile else None,
        }
        table.put_item(Item=item)
        saved = True
    except Exception as e:
        # Don’t fail the request just because persistence is missing/misconfigured
        err = str(e)

    return {
        "statusCode": 200,
        "headers": _cors(),
        "body": json.dumps({"ok": True, "saved": saved, "table": TABLE_NAME, "error": err})
    }
