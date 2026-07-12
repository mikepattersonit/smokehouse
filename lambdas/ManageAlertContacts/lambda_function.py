import json
import os
import re
import time
import boto3
from decimal import Decimal

DDB = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("CONTACTS_TABLE", "alert_contacts")
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
            "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
        "body": json.dumps(body or {}),
    }

def _normalize_phone(raw):
    """Normalize to E.164 +1XXXXXXXXXX for a 10/11-digit US number; pass
    through anything already in +<countrycode><number> form. None if it
    doesn't look like a valid number."""
    if not raw:
        return None
    raw = str(raw).strip()
    if raw.startswith("+") and re.fullmatch(r"\+\d{8,15}", raw):
        return raw
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return None

def lambda_handler(event, context):
    method = (event.get("requestContext", {}).get("http", {}).get("method")
              or event.get("httpMethod") or "GET").upper()

    if method == "OPTIONS":
        return _response(204, {})

    if method == "GET":
        try:
            resp = TABLE.scan()
            items = _to_native(resp.get("Items", []))
            items.sort(key=lambda x: x.get("created_at", 0))
            return _response(200, {"ok": True, "items": items})
        except Exception as e:
            return _response(500, {"ok": False, "error": str(e)})

    if method == "POST":
        # Handles both "add a new contact" and "update name/enabled" for an
        # existing one -- a toggle-enabled call only needs to send
        # {phoneNumber, enabled}, it won't touch the stored name.
        try:
            data = json.loads(event.get("body") or "{}")
        except Exception:
            return _response(400, {"ok": False, "error": "Invalid JSON body"})

        phone = _normalize_phone(data.get("phoneNumber") or data.get("phone_number"))
        if not phone:
            return _response(400, {"ok": False, "error": "A valid phone number is required"})

        name = data.get("name")
        enabled = data.get("enabled")

        set_parts = ["created_at = if_not_exists(created_at, :now)"]
        values = {":now": int(time.time())}
        expr_names = {}

        if name is not None:
            set_parts.append("#n = :name")
            expr_names["#n"] = "name"
            values[":name"] = str(name)

        if enabled is not None:
            set_parts.append("enabled = :enabled")
            values[":enabled"] = bool(enabled)
        else:
            set_parts.append("enabled = if_not_exists(enabled, :true)")
            values[":true"] = True

        update_kwargs = {
            "Key": {"phone_number": phone},
            "UpdateExpression": "SET " + ", ".join(set_parts),
            "ExpressionAttributeValues": values,
        }
        if expr_names:
            update_kwargs["ExpressionAttributeNames"] = expr_names

        try:
            TABLE.update_item(**update_kwargs)
            item = TABLE.get_item(Key={"phone_number": phone}).get("Item")
            return _response(200, {"ok": True, "item": _to_native(item)})
        except Exception as e:
            return _response(500, {"ok": False, "error": str(e)})

    if method == "DELETE":
        qs = event.get("queryStringParameters") or {}
        try:
            data = json.loads(event.get("body") or "{}")
        except Exception:
            data = {}
        raw_phone = (qs.get("phone_number") or qs.get("phoneNumber")
                     or data.get("phoneNumber") or data.get("phone_number"))
        phone = _normalize_phone(raw_phone)
        if not phone:
            return _response(400, {"ok": False, "error": "A valid phone number is required"})
        try:
            TABLE.delete_item(Key={"phone_number": phone})
            return _response(200, {"ok": True})
        except Exception as e:
            return _response(500, {"ok": False, "error": str(e)})

    return _response(405, {"ok": False, "error": f"Method {method} not allowed"})
