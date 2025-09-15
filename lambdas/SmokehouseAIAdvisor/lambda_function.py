# lambdas/SmokehouseAIAdvisor/lambda_function.py
import os, json, boto3, decimal
from botocore.exceptions import ClientError

# ---- env ----
SENSORS_TABLE = os.environ.get("SENSORS_TABLE", "sensor_data")
SENSORS_GSI = os.environ.get("SENSORS_GSI", "by_session_timestamp")
OPENAI_API_KEY_PARAM = os.environ.get("OPENAI_API_KEY_PARAM", "/smokehouse/openai/api_key")
CORS_ALLOW_ORIGIN = os.environ.get("CORS_ALLOW_ORIGIN", "*")  # set to your domain in prod for tighter security
DEFAULT_MODEL = os.environ.get("ADVISOR_MODEL", "gpt-4o-mini")

ddb = boto3.client("dynamodb")
ssm = boto3.client("ssm")

def _headers():
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": CORS_ALLOW_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,POST",
    }

def _resp(code: int, body: dict):
    return {"statusCode": code, "headers": _headers(), "body": json.dumps(body)}

def _get_openai_clients():
    """
    Return a tuple (mode, client_or_module)
    mode = "v1" -> from openai import OpenAI; client=OpenAI(api_key=...)
    mode = "legacy" -> import openai; openai.api_key=...
    """
    # fetch/decrypt key from SSM
    param = ssm.get_parameter(Name=OPENAI_API_KEY_PARAM, WithDecryption=True)
    api_key = param["Parameter"]["Value"]

    try:
        # New SDK (>=1.x)
        from openai import OpenAI  # type: ignore
        return "v1", OpenAI(api_key=api_key)
    except Exception:
        # Legacy SDK (0.x)
        import openai  # type: ignore
        openai.api_key = api_key
        return "legacy", openai

def _query_recent_samples(session_id: str, limit: int = 120):
    # Query GSI by session_id, newest first
    resp = ddb.query(
        TableName=SENSORS_TABLE,
        IndexName=SENSORS_GSI,
        KeyConditionExpression="session_id = :sid",
        ExpressionAttributeValues={":sid": {"S": session_id}},
        ScanIndexForward=False,
        Limit=limit,
    )
    items = []
    for it in resp.get("Items", []):
        def getn(field):
            v = it.get(field)
            if v is None: return None
            # handle number or string
            if "N" in v: 
                try: return float(v["N"])
                except: return None
            if "S" in v:
                try: return float(v["S"])
                except: return None
            return None
        items.append({
            "timestamp": it.get("timestamp", {}).get("S"),
            "outside_temp": getn("outside_temp"),
            "top_temp": getn("top_temp"),
            "middle_temp": getn("middle_temp"),
            "bottom_temp": getn("bottom_temp"),
            "probe1_temp": getn("probe1_temp"),
            "probe2_temp": getn("probe2_temp"),
            "probe3_temp": getn("probe3_temp"),
            "humidity": getn("humidity"),
            "smoke_ppm": getn("smoke_ppm"),
        })
    return items

def _build_prompt(samples, probe_id):
    # Use latest few points for brevity
    latest = list(filter(lambda x: x.get(probe_id) is not None, samples))[:12]
    lines = [f"{s['timestamp']}: {probe_id}={s.get(probe_id)}F, top={s.get('top_temp')}, mid={s.get('middle_temp')}, bot={s.get('bottom_temp')}, out={s.get('outside_temp')}, hum={s.get('humidity')}, smoke={s.get('smoke_ppm')}" for s in latest]
    series = "\n".join(lines) if lines else "No recent readings for that probe."

    prompt = f"""You're an experienced pitmaster assistant.
Given these recent readings for the smokehouse, provide 2–4 concise, practical tips specific to the selected probe.

Readings (newest first):
{series}

Guidance requirements:
- Keep it actionable and brief.
- If temps are flat or missing, note it and suggest checks (cable seating, probe position).
- If chamber temps swing, mention vent/fire adjustments.
- If humidity or smoke seems off, suggest small tweaks.
- No brand names; no emojis.

Return just the advice text (no JSON).
"""
    return prompt

def _call_llm(payload: dict):
    mode, client = _get_openai_clients()
    prompt = _build_prompt(payload["samples"], payload["probe_id"])
    model = payload.get("model") or DEFAULT_MODEL

    if mode == "v1":
        # OpenAI >=1.x
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role":"system","content":"You help with barbecue smoking."},
                      {"role":"user","content": prompt}],
            temperature=0.3,
            max_tokens=300,
        )
        return model, resp.choices[0].message.content.strip()
    else:
        # Legacy openai==0.x
        openai = client
        resp = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",  # or gpt-4o-mini if your legacy layer supports it; otherwise this fallback.
            messages=[{"role":"system","content":"You help with barbecue smoking."},
                      {"role":"user","content": prompt}],
            temperature=0.3,
            max_tokens=300,
        )
        return "gpt-3.5-turbo", resp["choices"][0]["message"]["content"].strip()

def lambda_handler(event, _ctx):
    # CORS preflight
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {"statusCode": 204, "headers": _headers(), "body": ""}

    try:
        body = event.get("body") or "{}"
        if isinstance(body, str):
            data = json.loads(body)
        else:
            data = body

        session_id = data.get("session_id")
        probe_id = data.get("probe_id")
        if not session_id or not probe_id:
            return _resp(400, {"error": "session_id and probe_id required"})

        samples = _query_recent_samples(session_id, limit=120)
        payload = {"samples": samples, "probe_id": probe_id}
        model_used, advice = _call_llm(payload)

        return _resp(200, {"advice": advice, "model": model_used})
    except ClientError as ce:
        return _resp(500, {"error": f"AWS error: {str(ce)}"})
    except Exception as e:
        return _resp(500, {"error": f"Unhandled: {str(e)}"})
