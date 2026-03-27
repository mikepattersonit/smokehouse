import os
import json
import base64
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from openai import OpenAI

# ---------- Config ----------
REGION               = os.getenv("AWS_REGION", "us-east-2")
OPENAI_MODEL         = os.getenv("OPENAI_MODEL", "gpt-4o")
SSM_PARAM_NAME       = os.environ.get("OPENAI_API_KEY_PARAM", "/smokehouse/openai/api_key")
PROBE_ASSIGNMENT_TABLE = os.getenv("PROBE_ASSIGNMENT_TABLE", "probe_assignments")
SENSOR_DATA_TABLE    = os.getenv("SENSOR_DATA_TABLE", "sensor_data")
SENSOR_LIMIT         = int(os.getenv("SENSOR_LIMIT", "100"))   # cap history sent to model

# ---------- AWS clients ----------
_ssm      = boto3.client("ssm", region_name=REGION)
_dynamodb = boto3.resource("dynamodb", region_name=REGION)

# Lazy OpenAI client — initialized once per container after first successful SSM fetch
_openai_client = None

def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        key = _ssm.get_parameter(Name=SSM_PARAM_NAME, WithDecryption=True)["Parameter"]["Value"]
        _openai_client = OpenAI(api_key=key)
    return _openai_client

# ---------- Helpers ----------
def _to_native(obj):
    if isinstance(obj, list):  return [_to_native(v) for v in obj]
    if isinstance(obj, dict):  return {k: _to_native(v) for k, v in obj.items()}
    if isinstance(obj, Decimal): return float(obj)
    return obj

def _safe_float(x):
    try:
        return None if x is None else float(x)
    except Exception:
        return None

def _summarize(temps):
    vals = [v for v in temps if isinstance(v, (int, float)) and v != -999]
    if not vals:
        return {"count": 0, "current": None, "min": None, "max": None, "avg": None}
    return {
        "count":   len(vals),
        "current": vals[-1],
        "min":     min(vals),
        "max":     max(vals),
        "avg":     round(sum(vals) / len(vals), 1),
    }

def _parse_event(event):
    """Accept API Gateway (v1/v2), direct invoke, or raw JSON string."""
    if isinstance(event, str):
        return json.loads(event)
    if not isinstance(event, dict):
        return {}
    body = event.get("body")
    if body is None:
        return event   # direct invoke — fields are top-level
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8", "ignore")
    return json.loads(body) if isinstance(body, str) else body

def _cors():
    return {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "OPTIONS,POST",
    }

def _resp(status, body_dict):
    return {"statusCode": status, "headers": _cors(), "body": json.dumps(body_dict)}

# ---------- OpenAI ----------
def _build_messages(meat_type, meat_weight, temp_history):
    summary = _summarize([_safe_float(v) for v in temp_history])
    system_msg = (
        "You are a professional BBQ and smoked-meat coach. "
        "Given meat type, weight, and recent probe temperatures, estimate time-to-finish "
        "and provide clear, practical guidance. Assume Fahrenheit. Be concise and actionable."
    )
    user_msg = (
        f"Meat type: {meat_type}\n"
        f"Weight (lb): {meat_weight}\n"
        f"Probe temperature history (oldest first, last {len(temp_history)} readings): {temp_history}\n"
        f"Summary: {summary}\n\n"
        "Return strict JSON only — no extra text:\n"
        "{\n"
        '  "eta_hours": number | null,\n'
        '  "doneness_percent": number | null,\n'
        '  "stall_detected": boolean,\n'
        '  "target_internal_temp_f": number | null,\n'
        '  "recommended_pit_temp_f": number | null,\n'
        '  "rest_time_minutes": number | null,\n'
        '  "notes": string\n'
        "}"
    )
    return [
        {"role": "system", "content": system_msg},
        {"role": "user",   "content": user_msg},
    ]

def _chat_analyze(meat_type, meat_weight, temp_history):
    messages = _build_messages(meat_type, meat_weight, temp_history)
    openai   = _get_openai_client()
    resp     = openai.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        timeout=25,
    )
    content = resp.choices[0].message.content if resp.choices else ""
    try:
        data = json.loads(content)
        return data if isinstance(data, dict) else {"notes": str(data)}
    except Exception:
        return {"notes": content or "No content returned from model."}

# ---------- Handler ----------
def lambda_handler(event, context):
    # CORS preflight
    method = (event.get("requestContext", {}).get("http", {}).get("method") or
              event.get("httpMethod", "POST")).upper()
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": _cors()}

    payload    = _parse_event(event)
    session_id = payload.get("session_id")
    probe_id   = payload.get("probe_id")

    if not session_id or not probe_id:
        return _resp(400, {"error": "session_id and probe_id are required"})

    # Fetch probe assignment (meat type, weight)
    try:
        probe_table = _dynamodb.Table(PROBE_ASSIGNMENT_TABLE)
        result      = probe_table.query(
            KeyConditionExpression=Key("session_id").eq(session_id) & Key("probe_id").eq(probe_id)
        )
        items = result.get("Items", [])
        if not items:
            return _resp(404, {"error": f"No probe assignment found for {probe_id} in session {session_id}"})
        probe_data = _to_native(items[0])
    except Exception as e:
        return _resp(500, {"error": f"Error fetching probe assignment: {e}"})

    # Fetch recent sensor data (capped to avoid huge payloads)
    try:
        sensor_table  = _dynamodb.Table(SENSOR_DATA_TABLE)
        sensor_result = sensor_table.query(
            KeyConditionExpression=Key("session_id").eq(session_id),
            ScanIndexForward=False,
            Limit=SENSOR_LIMIT,
        )
        sensor_items = [_to_native(i) for i in sensor_result.get("Items", [])]
        sensor_items.reverse()   # oldest-first for the model
    except Exception as e:
        return _resp(500, {"error": f"Error fetching sensor data: {e}"})

    meat_type   = probe_data.get("item_type") or probe_data.get("meat_type") or "unknown"
    meat_weight = probe_data.get("item_weight") or probe_data.get("weight") or "unknown"
    temp_history = [
        item.get(probe_id)
        for item in sensor_items
        if isinstance(item, dict) and probe_id in item and item[probe_id] != -999
    ]

    # Call OpenAI
    try:
        result = _chat_analyze(meat_type, meat_weight, temp_history)
    except Exception as e:
        return _resp(500, {"error": f"OpenAI call failed: {e}"})

    return _resp(200, {"advice": result})
