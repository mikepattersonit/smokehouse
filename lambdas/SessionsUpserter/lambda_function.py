import os, json, boto3, time
from decimal import Decimal

DDB = boto3.resource("dynamodb")
SESS = DDB.Table("sessions")
MERGE_GAP_SECS = int(os.getenv("SESSION_MERGE_SECS", "1800"))  # 30min default

def _to_s(v):  # ensure strings
    if isinstance(v, (int, float, Decimal)): return str(v)
    return str(v)

def _now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def lambda_handler(event, context):
    for rec in event.get("Records", []):
        if rec.get("eventName") not in ("INSERT","MODIFY"): 
            continue
        img = rec["dynamodb"].get("NewImage", {})
        session_id = img.get("session_id", {}).get("S") or _to_s(img.get("session_id", {}).get("N", ""))
        ts = img.get("timestamp", {}).get("S") or _to_s(img.get("timestamp", {}).get("N", ""))
        if not session_id: 
            continue

        now = _now_iso()
        # Upsert session: if first time, set start_time = now; always bump last_seen
        SESS.update_item(
            Key={"session_id": session_id},
            UpdateExpression="SET last_seen=:ls ADD seen_count :one",
            ExpressionAttributeValues={":ls": ts or now, ":one": 1}
        )
        # Initialize start_time once (no overwrite)
        SESS.update_item(
            Key={"session_id": session_id},
            UpdateExpression="SET start_time = if_not_exists(start_time, :st), status = if_not_exists(status, :stts)",
            ExpressionAttributeValues={":st": ts or now, ":stts": "active"}
        )
    return {"ok": True}
