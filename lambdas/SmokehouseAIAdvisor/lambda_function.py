import os
import json
from decimal import Decimal
from typing import Any, Dict, List, Union

import boto3
from boto3.dynamodb.conditions import Key
from openai import OpenAI

# ---------- Config / Environment ----------
REGION = os.getenv("AWS_REGION", "us-east-2")

# OpenAI model selection (override in Lambda env if needed)
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5")

# SSM param name for OpenAI API key
SSM_PARAM_NAME = os.environ.get("OPENAI_API_KEY_PARAM", "/smokehouse/openai/api_key")

# DynamoDB tables
PROBE_ASSIGNMENT_TABLE = os.getenv("PROBE_ASSIGNMENT_TABLE", "ProbeAssignments")
SENSOR_DATA_TABLE = os.getenv("SENSOR_DATA_TABLE", "sensor_data")

# ---------- AWS Clients ----------
_ssm = boto3.client("ssm", region_name=REGION)
dynamodb = boto3.resource("dynamodb", region_name=REGION)

def _get_openai_key() -> str:
    resp = _ssm.get_parameter(Name=SSM_PARAM_NAME, WithDecryption=True)
    return resp["Parameter"]["Value"]

# ---------- OpenAI Client ----------
client = OpenAI(api_key=_get_openai_key())

# ---------- Helpers ----------
def convert_decimal(obj: Any) -> Any:
    """
    Recursively convert DynamoDB Decimal to native Python floats.
    """
    if isinstance(obj, list):
        return [convert_decimal(x) for x in obj]
    if isinstance(obj, dict):
        return {k: convert_decimal(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        return float(obj)
    return obj

def _safe_float(x: Any) -> Union[float, None]:
    try:
        if x is None:
            return None
        return float(x)
    except Exception:
        return None

def _summarize_temps(temp_history: List[Union[float, int, None]]) -> Dict[str, Any]:
    vals = [v for v in temp_history if isinstance(v, (int, float)) and v is not None]
    if not vals:
        return {
            "count": 0,
            "current_temp": None,
            "min_temp": None,
            "max_temp": None,
            "avg_temp": None,
        }
    return {
        "count": len(vals),
        "current_temp": vals[-1],
        "min_temp": min(vals),
        "max_temp": max(vals),
        "avg_temp": sum(vals) / len(vals),
    }

def _build_messages(meat_type: str, meat_weight: Union[str, float, int], temp_history: List[Any]) -> List[Dict[str, str]]:
    """
    Create a strong instruction set for the model and request structured JSON output.
    """
    summary = _summarize_temps([_safe_float(v) for v in temp_history])

    system_msg = (
        "You are a professional BBQ and smoked-meat coach. "
        "Given meat type, weight, and recent probe temperatures, estimate time-to-finish and provide clear, "
        "practical guidance. If the data is insufficient, say so and explain what additional data would help. "
        "Assume Fahrenheit. Prefer short, actionable tips."
    )

    user_msg = (
        f"Meat type: {meat_type}\n"
        f"Weight (lb): {meat_weight}\n"
        f"Probe temperature history (most recent last): {temp_history}\n"
        f"Summary: {summary}\n\n"
        "Please return strict JSON with this schema:\n"
        "{\n"
        '  "eta_hours": number | null,           // estimated hours remaining (may be fractional)\n'
        '  "doneness_percent": number | null,    // 0-100 estimate\n'
        '  "stall_detected": boolean,            // true if a stall seems likely/in progress\n'
        '  "target_internal_temp_f": number | null,\n'
        '  "recommended_pit_temp_f": number | null,\n'
        '  "rest_time_minutes": number | null,\n'
        '  "notes": string                       // concise practical advice\n'
        "}\n"
        "Return JSON only—no extra text."
    )

    return [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ]

def _chat_analyze(meat_type: str, meat_weight: Any, temp_history: List[Any]) -> Dict[str, Any]:
    """
    Call OpenAI Chat Completions and parse JSON response with a safe fallback.
    """
    messages = _build_messages(meat_type, meat_weight, temp_history)

    try:
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
            temperature=0.3,
            timeout=20,  # seconds
        )
        content = resp.choices[0].message.content if resp.choices else ""
    except Exception as e:
        # Bubble up a structured error for the Lambda caller
        raise RuntimeError(f"OpenAI call failed: {e}")

    # Try to parse JSON strictly
    try:
        data = json.loads(content)
        if isinstance(data, dict):
            return data
        return {"notes": str(data)}
    except Exception:
        # Fallback: return as plain text under "notes"
        return {"notes": content or "No content returned from model."}

# ---------- Lambda Handler ----------
def lambda_handler(event, context):
    """
    Expected `event` JSON:
    {
      "session_id": "<id>",
      "probe_id": "<id>"
    }
    """
    # Validate input
    session_id = event.get("session_id") if isinstance(event, dict) else None
    probe_id = event.get("probe_id") if isinstance(event, dict) else None

    if not session_id or not probe_id:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Missing session_id or probe_id in the request"}),
        }

    # Fetch probe assignment (for meat metadata)
    try:
        probe_table = dynamodb.Table(PROBE_ASSIGNMENT_TABLE)
        probe_response = probe_table.query(
            KeyConditionExpression=Key("session_id").eq(session_id) & Key("probe_id").eq(probe_id)
        )
        items = probe_response.get("Items", [])
        if not items:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Probe assignment not found"}),
            }
        probe_data = convert_decimal(items[0])
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Error fetching probe assignment: {str(e)}"}),
        }

    # Fetch session sensor data (history)
    try:
        sensor_table = dynamodb.Table(SENSOR_DATA_TABLE)
        sensor_response = sensor_table.query(
            KeyConditionExpression=Key("session_id").eq(session_id)
        )
        sensor_items = [convert_decimal(item) for item in sensor_response.get("Items", [])]
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Error fetching sensor data: {str(e)}"}),
        }

    # Prepare model inputs
    meat_type = probe_data.get("meat_type", "unknown")
    meat_weight = probe_data.get("weight", "unknown")

    # Extract a simple probe-centric series from the session records
    # (Assumes each record may contain a {probe_id: temp} entry among other fields.)
    temp_history = [item.get(probe_id) for item in sensor_items if isinstance(item, dict) and (probe_id in item)]

    # Call OpenAI for analysis/advice
    try:
        result = _chat_analyze(meat_type, meat_weight, temp_history)
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }

    # Successful response
    return {
        "statusCode": 200,
        "body": json.dumps({"advice": result}),
    }
