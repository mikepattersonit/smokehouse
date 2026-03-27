import os
import json
import base64
import time
from datetime import datetime, timedelta
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

# ---------- Config ----------
REGION               = os.getenv("AWS_REGION", "us-east-2")
BEDROCK_MODEL        = os.getenv("BEDROCK_MODEL", "us.anthropic.claude-3-5-haiku-20241022-v1:0")
PROBE_TABLE          = os.getenv("PROBE_ASSIGNMENT_TABLE", "probe_assignments")
SENSOR_TABLE         = os.getenv("SENSOR_DATA_TABLE", "sensor_data")
SESSIONS_TABLE       = os.getenv("SESSIONS_TABLE", "sessions")
ANALYTICS_TABLE      = os.getenv("ANALYTICS_TABLE", "session_analytics")
ADVICE_CACHE_MINUTES = int(os.getenv("ADVICE_CACHE_MINUTES", "15"))
WARMUP_FETCH         = 30   # oldest rows fetched (warmup curve)
RECENT_FETCH         = 100  # newest rows fetched (current trajectory + metrics)
MILESTONE_POINTS     = 12   # evenly-spaced points sent to model

# ---------- AWS clients ----------
_ddb     = boto3.resource("dynamodb", region_name=REGION)
_bedrock = boto3.client("bedrock-runtime", region_name=REGION)

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
    if isinstance(event, str):      return json.loads(event)
    if not isinstance(event, dict): return {}
    body = event.get("body")
    if body is None:                return event
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
    try:
        s     = str(session_id)
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

# ---------- Metrics ----------
def _compute_rate_of_rise(temps, window=10):
    """°F per hour over the last `window` readings."""
    vals = [(i, float(t)) for i, t in enumerate(temps) if t is not None and float(t) != -999]
    if len(vals) < 2:
        return None
    recent = vals[-min(window, len(vals)):]
    delta_temp     = recent[-1][1] - recent[0][1]
    delta_readings = recent[-1][0] - recent[0][0]
    if delta_readings == 0:
        return None
    return round(delta_temp / delta_readings * 60, 1)  # ~1 min/reading → per hr

def _detect_stall(temps, window=10, threshold=2):
    """True if probe temp changed less than threshold °F over last `window` readings."""
    vals = [float(t) for t in temps if t is not None and float(t) != -999]
    if len(vals) < window:
        return False
    recent = vals[-window:]
    return (max(recent) - min(recent)) < threshold

def _compute_warmup(rows, session_id, target_pit_temp_f, hold_readings=5):
    """Minutes until pit first held target_pit_temp_f for hold_readings consecutive readings."""
    if not target_pit_temp_f:
        return None
    above = []
    for row in rows:
        avg     = _pit_avg(row)
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
        table  = _ddb.Table(ANALYTICS_TABLE)
        result = table.get_item(Key={"session_id": session_id, "metric": metric})
        return _to_native(result.get("Item")) if result.get("Item") else None
    except Exception:
        return None

def _put_analytics(session_id, metric, fields):
    try:
        table = _ddb.Table(ANALYTICS_TABLE)
        item  = {"session_id": session_id, "metric": metric, "computed_at": int(time.time())}
        item.update(fields)
        table.put_item(Item=item)
    except Exception:
        pass

# ---------- Fetch target pit temp ----------
def _get_target_pit_temp(session_id):
    try:
        table  = _ddb.Table(SESSIONS_TABLE)
        result = table.get_item(
            Key={"session_id": session_id},
            ProjectionExpression="target_pit_temp_f",
        )
        item = result.get("Item")
        if item and item.get("target_pit_temp_f"):
            return float(item["target_pit_temp_f"])
    except Exception:
        pass
    return None

# ---------- Build evenly-spaced milestones ----------
def _build_milestones(rows, session_id, probe_id, n=MILESTONE_POINTS):
    """Pick n evenly-spaced rows and return compact {min, pit, probe} dicts."""
    if not rows:
        return []
    step     = max(1, len(rows) // n)
    selected = rows[::step][:n]
    result   = []
    for row in selected:
        elapsed    = _elapsed_minutes(session_id, row.get("timestamp"))
        pit        = _pit_avg(row)
        probe_temp = row.get(probe_id)
        if probe_temp is not None and float(probe_temp) == -999:
            probe_temp = None
        result.append({
            "min":   elapsed,
            "pit":   round(pit, 1) if pit is not None else None,
            "probe": round(float(probe_temp), 1) if probe_temp is not None else None,
        })
    return result

# ---------- Prompt ----------
def _build_prompt(probe_id, meat_type, meat_weight, smoke_type,
                  item_target_temp, item_max_safe_temp, target_pit_temp_f,
                  warmup_minutes, outside_temp_at_start, avg_pit_temp,
                  rate_of_rise, stall_detected, elapsed_minutes,
                  current_probe_temp, current_pit_temp, milestones):

    if smoke_type == "cold":
        system_msg = (
            "You are an expert cold-smoking coach. The goal is NOT to cook the meat — "
            "it is to infuse smoke flavor while keeping the product temperature below the "
            "max_safe_temp_f at all times. Elevated temperatures will melt fat, denature "
            "proteins prematurely, or create food safety issues. "
            "All temperatures are Fahrenheit. Be concise and specific. "
            "Respond with strict JSON only, no markdown or extra text."
        )
        context = {
            "meat_type":             meat_type,
            "weight_lbs":            meat_weight,
            "smoke_type":            "cold",
            "max_safe_temp_f":       item_max_safe_temp,
            "outside_temp_f":        outside_temp_at_start,
            "total_elapsed_minutes": elapsed_minutes,
            "current_probe_temp_f":  current_probe_temp,
            "current_pit_temp_f":    current_pit_temp,
            "rate_of_rise_f_per_hr": rate_of_rise,
        }
        user_msg = (
            f"Session context:\n{json.dumps(context)}\n\n"
            f"Temperature milestones ({len(milestones)} points; min=elapsed minutes, "
            f"pit=pit temp, probe=product temp):\n{json.dumps(milestones)}\n\n"
            "Return strict JSON — for cold smoke, eta_hours means remaining safe smoke time, "
            "doneness_percent is not applicable (null), stall_detected is false unless "
            "product temp is climbing dangerously:\n"
            '{"eta_hours": number|null, "doneness_percent": null, "stall_detected": false, '
            '"target_internal_temp_f": null, "recommended_pit_temp_f": number|null, '
            '"rest_time_minutes": null, "notes": string}'
        )
    else:
        system_msg = (
            "You are an expert BBQ pitmaster coach. Analyze the smokehouse session data and "
            "provide precise, actionable guidance. All temperatures are Fahrenheit. "
            "Use warmup time and outside temp to understand how the pit performs in current conditions. "
            "Use milestones to identify trends, stalls, and whether the cook is on track. "
            "Be concise and specific — no generic advice. "
            "Respond with strict JSON only, no markdown or extra text."
        )
        context = {
            "meat_type":               meat_type,
            "weight_lbs":              meat_weight,
            "smoke_type":              "hot",
            "target_internal_temp_f":  item_target_temp,
            "target_pit_temp_f":       target_pit_temp_f,
            "outside_temp_at_start_f": outside_temp_at_start,
            "warmup_minutes":          warmup_minutes,
            "avg_pit_temp_f":          avg_pit_temp,
            "total_elapsed_minutes":   elapsed_minutes,
            "current_probe_temp_f":    current_probe_temp,
            "current_pit_temp_f":      current_pit_temp,
            "rate_of_rise_f_per_hr":   rate_of_rise,
            "stall_detected":          stall_detected,
        }
        user_msg = (
            f"Session context:\n{json.dumps(context)}\n\n"
            f"Temperature milestones ({len(milestones)} evenly-spaced points; "
            f"min=elapsed minutes, pit=avg pit temp, probe=probe temp):\n"
            f"{json.dumps(milestones)}\n\n"
            "Return strict JSON:\n"
            '{"eta_hours": number|null, "doneness_percent": number|null, "stall_detected": boolean, '
            '"target_internal_temp_f": number|null, "recommended_pit_temp_f": number|null, '
            '"rest_time_minutes": number|null, "notes": string}'
        )

    return system_msg, user_msg

# ---------- Bedrock invoke ----------
def _invoke_bedrock(system_msg, user_msg):
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 512,
        "system":     system_msg,
        "messages":   [{"role": "user", "content": user_msg}],
    }
    response = _bedrock.invoke_model(
        modelId      = BEDROCK_MODEL,
        contentType  = "application/json",
        accept       = "application/json",
        body         = json.dumps(body),
    )
    result  = json.loads(response["body"].read())
    content = result["content"][0]["text"]
    return content

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

    # Look up smoke_type and target temp from meat_types table
    smoke_type            = "hot"
    item_target_temp      = None
    item_max_safe_temp    = None
    try:
        item_row = _ddb.Table("meat_types").get_item(Key={"name": meat_type}).get("Item")
        if item_row:
            smoke_type         = _to_native(item_row).get("smoke_type", "hot")
            item_target_temp   = _to_native(item_row).get("target_internal_temp_f")
            item_max_safe_temp = _to_native(item_row).get("max_safe_temp_f")
    except Exception:
        pass

    # 2. Check advice cache
    now          = int(time.time())
    cached_probe = _get_analytics(session_id, probe_id)
    if cached_probe and cached_probe.get("last_advice_at"):
        age_minutes = (now - int(cached_probe["last_advice_at"])) / 60
        if age_minutes < ADVICE_CACHE_MINUTES and cached_probe.get("last_advice"):
            return _resp(200, {"advice": cached_probe["last_advice"], "cached": True})

    # 3. Fetch sensor data: oldest WARMUP_FETCH rows + newest RECENT_FETCH rows
    try:
        sensor_table  = _ddb.Table(SENSOR_TABLE)
        warmup_result = sensor_table.query(
            KeyConditionExpression=Key("session_id").eq(session_id),
            ScanIndexForward=True,
            Limit=WARMUP_FETCH,
        )
        recent_result = sensor_table.query(
            KeyConditionExpression=Key("session_id").eq(session_id),
            ScanIndexForward=False,
            Limit=RECENT_FETCH,
        )
        warmup_rows = [_to_native(i) for i in warmup_result.get("Items", [])]
        recent_rows = list(reversed([_to_native(i) for i in recent_result.get("Items", [])]))

        # Merge, dedupe by timestamp, sort chronologically
        seen = set()
        rows = []
        for r in warmup_rows + recent_rows:
            ts = r.get("timestamp")
            if ts not in seen:
                seen.add(ts)
                rows.append(r)
        rows.sort(key=lambda r: str(r.get("timestamp", "")))
    except Exception as e:
        return _resp(500, {"error": f"Error fetching sensor data: {e}"})

    if not rows:
        return _resp(404, {"error": "No sensor data found for this session"})

    # 4. Get or compute session-level analytics
    target_pit_temp_f = _get_target_pit_temp(session_id)
    session_analytics = _get_analytics(session_id, "__session__")

    if not session_analytics:
        outside_temp_at_start = None
        for row in rows[:5]:
            v = row.get("outside_temp")
            if v and float(v) != -999:
                outside_temp_at_start = float(v)
                break

        pit_vals       = [_pit_avg(r) for r in rows if _pit_avg(r) is not None]
        avg_pit_temp   = round(sum(pit_vals) / len(pit_vals), 1) if pit_vals else None
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

    last_row           = rows[-1]
    current_probe_temp = last_row.get(probe_id)
    if current_probe_temp is not None and float(current_probe_temp) == -999:
        current_probe_temp = None
    current_pit_temp = _pit_avg(last_row)

    # 6. Build milestones
    milestones = _build_milestones(rows, session_id, probe_id)

    # 7. Call Bedrock
    system_msg, user_msg = _build_prompt(
        probe_id              = probe_id,
        meat_type             = meat_type,
        meat_weight           = meat_weight,
        smoke_type            = smoke_type,
        item_target_temp      = item_target_temp,
        item_max_safe_temp    = item_max_safe_temp,
        target_pit_temp_f     = target_pit_temp_f,
        warmup_minutes        = session_analytics.get("warmup_minutes"),
        outside_temp_at_start = session_analytics.get("outside_temp_at_start"),
        avg_pit_temp          = session_analytics.get("avg_pit_temp"),
        rate_of_rise          = rate_of_rise,
        stall_detected        = stall_detected,
        elapsed_minutes       = elapsed_minutes,
        current_probe_temp    = current_probe_temp,
        current_pit_temp      = current_pit_temp,
        milestones            = milestones,
    )

    try:
        content = _invoke_bedrock(system_msg, user_msg)
        # Strip potential markdown fencing
        text = content.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        advice = json.loads(text)
        if not isinstance(advice, dict):
            advice = {"notes": str(advice)}
    except Exception as e:
        return _resp(500, {"error": f"Bedrock call failed: {type(e).__name__}: {e}"})

    # 8. Cache result
    _put_analytics(session_id, probe_id, {
        "last_advice":    advice,
        "last_advice_at": now,
        "rate_of_rise":   rate_of_rise,
        "stall_detected": stall_detected,
    })

    return _resp(200, {"advice": advice, "cached": False})
