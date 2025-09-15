import os, time, json, logging
import boto3
from boto3.dynamodb.types import TypeDeserializer

log = logging.getLogger()
log.setLevel(logging.INFO)

ddb = boto3.resource("dynamodb")
table = ddb.Table(os.environ.get("SESSIONS_TABLE", "sessions"))

deser = TypeDeserializer()

def _from_ddb_image(img):
    return {k: deser.deserialize(v) for k, v in img.items()}

def _as_epoch_from_session(session_id: str) -> int:
    # Expect YYYYMMDDHHMMSS -> epoch; fallback to now
    try:
        if session_id and len(session_id) >= 14:
            import datetime
            dt = datetime.datetime.strptime(session_id[:14], "%Y%m%d%H%M%S")
            return int(dt.replace(tzinfo=datetime.timezone.utc).timestamp())
    except Exception:
        pass
    return int(time.time())

def handler(event, context):
    # Handle INSERT/MODIFY with NEW_IMAGE
    for rec in event.get("Records", []):
        if rec.get("eventName") not in ("INSERT", "MODIFY"):
            continue
        new_img = rec.get("dynamodb", {}).get("NewImage")
        if not new_img:
            continue
        item = _from_ddb_image(new_img)
        sess = str(item.get("session_id") or "")
        if not sess:
            continue

        # Derive start candidate from session_id; record heartbeat
        start_candidate = _as_epoch_from_session(sess)
        now = int(time.time())

        # Upsert: set started_at if missing; always bump last_seen_at/status
        table.update_item(
            Key={"session_id": sess},
            UpdateExpression="SET started_at = if_not_exists(started_at, :s), "
                             "last_seen_at = :now, #st = :active",
            ExpressionAttributeValues={
                ":s": start_candidate,
                ":now": now,
                ":active": "active"
            },
            ExpressionAttributeNames={
                "#st": "status"
            }
        )
    return {"ok": True}
