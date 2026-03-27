import os
import json
import base64
import time
from datetime import datetime, timedelta
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from openai import OpenAI

# ---------- Config ----------
REGION                 = os.getenv("AWS_REGION", "us-east-2")
OPENAI_MODEL           = os.getenv("OPENAI_MODEL", "gpt-4o")
SSM_PARAM_NAME         = os.environ.get("OPENAI_API_KEY_PARAM", "/smokehouse/openai/api_key")
PROBE_TABLE            = os.getenv("PROBE_ASSIGNMENT_TABLE", "probe_assignments")
SENSOR_TABLE           = os.getenv("SENSOR_DATA_TABLE", "sensor_data")
SESSIONS_TABLE         = os.getenv("SESSIONS_TABLE", "sessions")
ANALYTICS_TABLE        = os.getenv("ANALYTICS_TABLE", "session_analytics")
ADVICE_CACHE_MINUTES   = int(os.getenv("ADVICE_CACHE_MINUTES", "15"))
SENSOR_FETCH_LIMIT     = 2000   # max raw rows to pull before bucketing
WARMUP_READINGS        = 30     # always keep first N readings (warmup curve)
RECENT_READINGS        = 30     # always keep last N readings (current trajectory)

# ---------- Cook profiles → bucket interval in minutes ----------
COOK_PROFILES = {
    "sausage": "quick",  "quail": "quick",  "salmon": "quick", "trout": "quick",
    "chicken": "medium", "duck": "medium",  "pheasant": "medium",
    "ribs": "medium",    "pork belly": "medium",
    "brisket": "long",   "pork shoulder": "long", "lamb shoulder": "long",
    "venison": "long",   "turkey": "long",  "ham": "long",
}
BUCKET_MINUTES = {"quick": 2, "medium": 5, "long": 15, "unknown": 5}

# ---------- AWS clients ----------
_ssm      = boto3.client("ssm", region_name=REGION)
_ddb      = boto3.resource("dynamodb", region_name=REGION)
_openai   = None

def _get_openai():
    global _openai
    if _openai is None:
        key = _ssm.get_parameter(Name=SSM_PARAM_NAME, WithDecryption=True)["Parameter"]["Value"]
        _openai = OpenAI(api_key=key)
    return _openai

# ---------- Helpers ----------
def _to_native(obj):
    if isinstance(obj, list):    return [_to_native(v) for v in obj]
    if isinstance(obj, dict):    return {k: _to_native(v) for k, v in obj.items()}
    if isinstance(obj, Decimal): return float(obj)
    return obj

def _pit_avg(row):
    """Average of available pit temps in a sensor row, ignoring -999."""
    vals = [row.get(k) for k in ("top_temp", "middle_temp", "bottom_temp")]
    vals = [float(v) for v in vals if v is not None and float(v) != -999]
    return sum(vals) / len(vals) if vals else None

def _parse_event(event):
    if isinstance(event, str):   return json.loads(event)
    if not isinstance(event, dict): return {}
    body = event.get("body")
    if body is None:             return event
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

# ---------- Timestamp → elapsed minutes ----------
def _elapsed_minutes(session_id, timestamp):
    """Convert a sensor timestamp to minutes elapsed since session start."""
    try:
        s = str(session_id)
        start = datetime(int(s[0:4]), int(s[4:6]), int(s[6:8]),
                         int(s[8:10]), int(s[10:12]), int(s[12:14]))
        ts = str(timestamp).strip()
        if len(ts) == 6 and ts.isdigit():
            reading = start.replace(hour=int(ts[0:2]), minute=int(ts[2:4]), second=int(ts[4:6]))
            if reading < start:
                reading += timedelta(days=1)
        elif "T" in ts:
            reading = datetime.strptime(ts[:15], "%Y%m%dT%H%M%S")
        else:
            return None
        return max(0, int((reading - start).total_seconds() / 60))
    except Exception:
        return None

# ---------- Bucketing ----------
def _bucket_readings(rows, session_id, bucket_minutes):
    """
    Always keep first WARMUP_READINGS and last RECENT_READINGS rows.
    Bucket the middle into N-minute averages to reduce token count.
    """
    if len(rows) <= WARMUP_READINGS + RECENT_READINGS:
        return rows

    warmup = rows[:WARMUP_READINGS]
    recent = rows[-RECENT_READINGS:]
    middle = rows[WARMUP_READINGS:-RECENT_READINGS]

    bucketed, bucket, bucket_start = [], [], None
    for row in middle:
        elapsed = _elapsed_minutes(session_id, row.get("timestamp")) or 0
        if bucket_start is None:
            bucket_start = elapsed
        if elapsed - bucket_start < bucket_minutes:
            bucket.append(row)
        else:
            if bucket:
                bucketed.append(_avg_bucket(bucket, bucket_start))
            bucket, bucket_start = [row], elapsed
    if bucket:
        bucketed.append(_avg_bucket(bucket, bucket_start))

    return warmup + bucketed + recent

def _avg_bucket(rows, elapsed_start):
    """Collapse a bucket of rows into a single averaged row."""
    keys = ("top_temp", "middle_temp", "bottom_temp", "outside_temp",
            "humidity", "smoke_ppm", "probe1_temp", "probe2_temp", "probe3_temp")
    averaged = {"elapsed_min": elapsed_start}
    for k in keys:
        vals = [float(r[k]) for r in rows if r.get(k) is not None and float(r.get(k, -999)) != -999]
        averaged[k] = round(sum(vals) / len(vals), 1) if vals else None
    return averaged

def _format_row(row, session_id):
    """Format a sensor row for the prompt, adding elapsed_min."""
    elapsed = _elapsed_minutes(session_id, row.get("timestamp"))
    out = {"elapsed_min": elapsed}
    for k in ("top_temp", "middle_temp", "bottom_temp", "outside_temp",
              "humidity", "smoke_ppm", "probe1_temp", "probe2_temp", "probe3_temp"):
        v = row.get(k)
        if v is not None and float(v) != -999:
            out[k] = round(float(v), 1)
    return out

# ---------- Metrics computation ----------
def _compute_rate_of_rise(temps, window=10):
    """°F per hour over the last `window` readings."""
    vals = [(i, t) for i, t in enumerate(temps) if t is not None and t != -999]
    if len(vals) < 2:
        return None
    recent = vals[-min(window, len(vals)):]
    delta_temp = recent[-1][1] - recent[0][1]
    delta_readings = recent[-1][0] - recent[0][0]
    if delta_readings == 0:
        return None
    # Assume ~1 min per reading → convert to per-hour
    return round(delta_temp / delta_readings * 60, 2)

def _detect_stall(temps, window=10, threshold=2):
    """True if probe temp changed less than threshold°F over last `window` readings."""
    vals = [t for t in temps if t is not None and t != -999]
    if len(vals) < window:
        return False
    recent = vals[-window:]
    return (max(recent) - min(recent)) < threshold

def _compute_warmup(rows, session_id, target_pit_temp_f, hold_readings=5):
    """
    Returns minutes until pit first reached target_pit_temp_f and held
    for `hold_readings` consecutive readings.
    """
    if not target_pit_temp_f:
        return None
    above = []
    for row in rows:
        avg = _pit_avg(row)
        elapsed = _elapsed_minutes(session_id, row.get("timestamp"))
        if avg is not None and elapsed is not None:
            above.append((elapsed, avg >= float(target_pit_temp_f)))

    for i in range(len(above) - hold_readings):
        if all(a for _, a in above[i:i + hold_readings]):
            return above[i][0]
    return None

# ---------- Session analytics cache ----------
def _get_analytics(session_id, metric):
    try:
        table = _ddb.Table(ANALYTICS_TABLE)
        result = table.get_item(Key={"session_id": session_id, "metric": metric})
        return _to_native(result.get("Item")) if result.get("Item") else None
    except Exception:
        return None

def _put_analytics(session_id, metric, fields):
    try:
        table = _ddb.Table(ANALYTICS_TABLE)
        item = {"session_id": session_id, "metric": metric, "computed_at": int(time.time())}
        item.update(fields)
        table.put_item(Item=item)
    except Exception:
        pass

# ---------- Fetch target pit temp from sessions table ----------
def _get_target_pit_temp(session_id):
    try:
        table = _ddb.Table(SESSIONS_TABLE)
        result = table.get_item(
            Key={"session_id": session_id},
            ProjectionExpression="target_pit_temp_f"
        )
        item = result.get("Item")
        if item and item.get("target_pit_temp_f"):
            return float(item["target_pit_temp_f"])
    except Exception:
        pass
    return None

# ---------- OpenAI prompt ----------
def _build_prompt(probe_id, meat_type, meat_weight, target_pit_temp_f,
                  warmup_minutes, outside_temp_at_start, avg_pit_temp,
                  rate_of_rise, stall_detected, elapsed_minutes, sampled_rows, session_id):

    session_data = [_format_row(r, session_id) for r in sampled_rows]

    context = {
        "meat_type": meat_type,
        "weight_lbs": meat_weight,
        "target_pit_temp_f": target_pit_temp_f,
        "outside_temp_at_start_f": outside_temp_at_start,
        "warmup_minutes": warmup_minutes,
        "avg_pit_temp_f": avg_pit_temp,
        "total_elapsed_minutes": elapsed_minutes,
        "probe_id": probe_id,
        "rate_of_rise_f_per_hr": rate_of_rise,
        "stall_detected": stall_detected,
    }

    system_msg = (
        "You are an expert BBQ pitmaster coach. Analyze the smokehouse session data and "
        "provide precise, actionable guidance. All temperatures are Fahrenheit. "
        "Use the warmup time and outside temp to understand how the pit performs in current conditions. "
        "Use the temperature history to identify trends, stalls, and whether the cook is on track. "
        "Be concise and specific — no generic advice."
    )

    user_msg = (
        f"Session context:\n{json.dumps(context, indent=2)}\n\n"
        f"Temperature history ({len(session_data)} readings, elapsed_min is minutes since session start):\n"
        f"{json.dumps(session_data)}\n\n"
        "Return strict JSON only:\n"
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

# ---------- Handler ----------
def lambda_handler(event, context):
    method = (event.get("requestContext", {}).get("http", {}).get("method") or
              event.get("httpMethod", "POST")).upper()
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": _cors()}

    payload    = _parse_event(event)
    session_id = payload.get("session_id")
    probe_id   = payload.get("probe_id")

    if not session_id or not probe_id:
        return _resp(400, {"error": "session_id and probe_id are required"})

    # 1. Fetch probe assignment
    try:
        probe_result = _ddb.Table(PROBE_TABLE).query(
            KeyConditionExpression=Key("session_id").eq(session_id) & Key("probe_id").eq(probe_id)
        )
        items = probe_result.get("Items", [])
        if not items:
            return _resp(404, {"error": f"No probe assignment found for {probe_id}"})
        probe_data = _to_native(items[0])
    except Exception as e:
        return _resp(500, {"error": f"Error fetching probe assignment: {e}"})

    meat_type   = probe_data.get("item_type") or probe_data.get("meat_type") or "unknown"
    meat_weight = probe_data.get("item_weight") or probe_data.get("weight") or "unknown"

    # 2. Check advice cache
    now = int(time.time())
    cached_probe = _get_analytics(session_id, probe_id)
    if cached_probe and cached_probe.get("last_advice_at"):
        age_minutes = (now - int(cached_probe["last_advice_at"])) / 60
        if age_minutes < ADVICE_CACHE_MINUTES and cached_probe.get("last_advice"):
            return _resp(200, {"advice": cached_probe["last_advice"], "cached": True})

    # 3. Fetch sensor data (newest-first, then reverse for chronological order)
    try:
        sensor_result = _ddb.Table(SENSOR_TABLE).query(
            KeyConditionExpression=Key("session_id").eq(session_id),
            ScanIndexForward=False,
            Limit=SENSOR_FETCH_LIMIT,
        )
        rows = [_to_native(i) for i in sensor_result.get("Items", [])]
        rows.reverse()  # oldest-first
    except Exception as e:
        return _resp(500, {"error": f"Error fetching sensor data: {e}"})

    if not rows:
        return _resp(404, {"error": "No sensor data found for this session"})

    # 4. Get or compute session-level analytics
    target_pit_temp_f   = _get_target_pit_temp(session_id)
    session_analytics   = _get_analytics(session_id, "__session__")

    if not session_analytics:
        outside_temp_at_start = None
        for row in rows[:5]:
            v = row.get("outside_temp")
            if v and float(v) != -999:
                outside_temp_at_start = float(v)
                break

        pit_vals = [_pit_avg(r) for r in rows if _pit_avg(r) is not None]
        avg_pit_temp = round(sum(pit_vals) / len(pit_vals), 1) if pit_vals else None

        warmup_minutes = _compute_warmup(rows, session_id, target_pit_temp_f)

        session_analytics = {
            "outside_temp_at_start": outside_temp_at_start,
            "avg_pit_temp":          avg_pit_temp,
            "warmup_minutes":        warmup_minutes,
        }
        _put_analytics(session_id, "__session__", session_analytics)

    # 5. Compute probe-level metrics
    probe_temps     = [r.get(probe_id) for r in rows]
    rate_of_rise    = _compute_rate_of_rise(probe_temps)
    stall_detected  = _detect_stall(probe_temps)
    elapsed_minutes = _elapsed_minutes(session_id, rows[-1].get("timestamp")) if rows else 0

    # 6. Bucket sensor data based on meat type
    profile        = COOK_PROFILES.get(meat_type.lower(), "unknown")
    bucket_minutes = BUCKET_MINUTES[profile]
    sampled_rows   = _bucket_readings(rows, session_id, bucket_minutes)

    # 7. Call OpenAI
    try:
        messages = _build_prompt(
            probe_id        = probe_id,
            meat_type       = meat_type,
            meat_weight     = meat_weight,
            target_pit_temp_f       = target_pit_temp_f,
            warmup_minutes          = session_analytics.get("warmup_minutes"),
            outside_temp_at_start   = session_analytics.get("outside_temp_at_start"),
            avg_pit_temp            = session_analytics.get("avg_pit_temp"),
            rate_of_rise            = rate_of_rise,
            stall_detected          = stall_detected,
            elapsed_minutes         = elapsed_minutes,
            sampled_rows            = sampled_rows,
            session_id              = session_id,
        )
        openai_resp = _get_openai().chat.completions.create(
            model    = OPENAI_MODEL,
            messages = messages,
            timeout  = 30,
        )
        content = openai_resp.choices[0].message.content if openai_resp.choices else ""
        try:
            advice = json.loads(content)
            if not isinstance(advice, dict):
                advice = {"notes": str(advice)}
        except Exception:
            advice = {"notes": content or "No response from model."}
    except Exception as e:
        return _resp(500, {"error": f"OpenAI call failed: {e}"})

    # 8. Cache result
    _put_analytics(session_id, probe_id, {
        "last_advice":    advice,
        "last_advice_at": now,
        "rate_of_rise":   rate_of_rise,
        "stall_detected": stall_detected,
    })

    return _resp(200, {"advice": advice, "cached": False})
