import os
import json
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from openai import OpenAI

# ---------------------------
# Configuration / Constants
# ---------------------------
REGION = os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-east-2"))

# SSM parameter that holds your OpenAI API key (SecureString)
SSM_PARAM_NAME = os.environ.get("OPENAI_API_KEY_PARAM", "/smokehouse/openai/api_key")

# Model & prompting (override via Lambda env vars)
ADVISOR_MODEL = os.getenv("ADVISOR_MODEL", "gpt-4o-mini")
ADVISOR_TEMPERATURE = float(os.getenv("ADVISOR_TEMPERATURE", "0.4"))
ADVISOR_MAX_TOKENS = int(os.getenv("ADVISOR_MAX_TOKENS", "400"))
ADVISOR_SYSTEM_PROMPT = os.getenv(
    "ADVISOR_SYSTEM_PROMPT",
    (
        "You are the Smokehouse AI Advisor. You provide concise, practical BBQ and smoking advice "
        "using thermodynamics and food-safety best practices. You consider probe temp history, "
        "ambient/smoker temps, rise rate, meat cut, and approximate weight. Always call out any "
        "food-safety risks and give time-left estimates as ranges with assumptions."
    ),
)

# DynamoDB
dynamodb = boto3.resource("dynamodb", region_name=REGION)
PROBE_ASSIGNMENT_TABLE = os.getenv("PROBE_ASSIGNMENT_TABLE", "ProbeAssignments")
SENSOR_DATA_TABLE = os.getenv("SENSOR_DATA_TABLE", "sensor_data")

# SSM
_ssm = boto3.client("ssm", region_name=REGION)


def _get_openai_key() -> str:
    """Fetch OpenAI API key from SSM (decrypted). Cache via Lambda execution env reuse."""
    resp = _ssm.get_parameter(Name=SSM_PARAM_NAME, WithDecryption=True)
    return resp["Parameter"]["Value"]


# Initialize OpenAI client once per execution environment (speeds warm invocations)
_OPENAI_CLIENT = None

def _client() -> OpenAI:
    global _OPENAI_CLIENT
    if _OPENAI_CLIENT is None:
        _OPENAI_CLIENT = OpenAI(api_key=_get_openai_key())
    return _OPENAI_CLIENT


# ---------------------------
# Utilities
# ---------------------------

def convert_decimal(obj):
    if isinstance(obj, list):
        return [convert_decimal(x) for x in obj]
    if isinstance(obj, dict):
        return {k: convert_decimal(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        return float(obj)
    return obj


def _extract_payload(event: dict) -> dict:
    """Support both direct invocation and API Gateway/Lambda proxy events."""
    if isinstance(event, dict) and "body" in event:
        body = event.get("body")
        if isinstance(body, str):
            try:
                return json.loads(body)
            except Exception:
                return {}
        elif isinstance(body, dict):
            return body
    # fall back to event as-is
    return event if isinstance(event, dict) else {}


# ---------------------------
# Lambda handler
# ---------------------------

def lambda_handler(event, context):
    payload = _extract_payload(event)

    session_id = payload.get("session_id")
    probe_id = payload.get("probe_id")

    if not session_id or not probe_id:
        return {
            "statusCode": 400,
            "body": json.dumps({
                "error": "Missing session_id or probe_id",
                "example": {"session_id": "2025-09-14T12:00Z", "probe_id": "probe_1"},
            }),
        }

    # ---------------------------
    # Probe assignment lookup
    # ---------------------------
    try:
        probe_table = dynamodb.Table(PROBE_ASSIGNMENT_TABLE)
        probe_resp = probe_table.query(
            KeyConditionExpression=Key("session_id").eq(session_id) & Key("probe_id").eq(probe_id)
        )
        if not probe_resp.get("Items"):
            return {"statusCode": 404, "body": json.dumps({"error": "Probe assignment not found"})}
        probe_data = probe_resp["Items"][0]
    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": f"Probe assignment fetch failed: {e}"})}

    # ---------------------------
    # Sensor data lookup for the session
    # ---------------------------
    try:
        sensor_table = dynamodb.Table(SENSOR_DATA_TABLE)
        sensor_resp = sensor_table.query(KeyConditionExpression=Key("session_id").eq(session_id))
        sensor_items = [convert_decimal(i) for i in sensor_resp.get("Items", [])]
    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": f"Sensor data fetch failed: {e}"})}

    # Extract the probe's temp series (list of floats if present)
    temp_history = []
    for item in sensor_items:
        if probe_id in item:
            v = item.get(probe_id)
            # accept numeric or dict {"temp": x}
            if isinstance(v, (int, float)):
                temp_history.append(float(v))
            elif isinstance(v, dict) and "temp" in v and isinstance(v["temp"], (int, float)):
                temp_history.append(float(v["temp"]))

    meat_type = probe_data.get("meat_type", "unknown")
    meat_weight = probe_data.get("weight", "unknown")

    # ---------------------------
    # Build Chat Completions request (OpenAI SDK v1)
    # ---------------------------
    user_prompt = (
        "You will estimate remaining cook time for smoked meat and provide actionable steps.\n"
        "Inputs you have:\n"
        f"- Meat type: {meat_type}\n"
        f"- Approx weight (lbs): {meat_weight}\n"
        f"- Probe temp history (°F, ordered oldest→newest): {temp_history}\n"
        "Assume typical backyard smoker conditions unless ambient/smoker temps are embedded in the series.\n"
        "Respond with: (1) estimated time remaining as a range with assumptions, (2) target internal temp, "
        "(3) stall expectations if applicable, (4) concrete adjustments (vents, wrap, rest), (5) food-safety cautions."
    )

    try:
        client = _client()
        resp = client.chat.completions.create(
            model=ADVISOR_MODEL,
            messages=[
                {"role": "system", "content": ADVISOR_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=ADVISOR_TEMPERATURE,
            max_tokens=ADVISOR_MAX_TOKENS,
        )
        advice = (resp.choices[0].message.content or "").strip()
    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": f"OpenAI call failed: {e}"})}

    return {"statusCode": 200, "body": json.dumps({"advice": advice})}
