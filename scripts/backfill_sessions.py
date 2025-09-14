import os, sys, re, time, json
from datetime import datetime, timezone
import boto3
from botocore.config import Config

SENSOR_TABLE = os.environ.get("SENSOR_TABLE", "sensor_data")
SESSIONS_TABLE = os.environ.get("SESSIONS_TABLE", "sessions")

def parse_session_start(sess_id: str):
    """
    Expect 'YYYYMMDDhhmmss' (14 digits) — return epoch seconds.
    If format unexpected, return None.
    """
    if not re.fullmatch(r"\d{14}", sess_id or ""):
        return None
    dt = datetime.strptime(sess_id, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
    return int(dt.timestamp())

def main():
    cfg = Config(retries={"max_attempts": 10, "mode": "standard"})
    ddb = boto3.resource("dynamodb", config=cfg)
    sensor = ddb.Table(SENSOR_TABLE)
    sessions = ddb.Table(SESSIONS_TABLE)

    print(f"Scanning table: {SENSOR_TABLE} (projection: session_id)")
    seen = set()
    scan_kwargs = {"ProjectionExpression": "session_id"}
    while True:
        resp = sensor.scan(**scan_kwargs)
        for item in resp.get("Items", []):
            sid = item.get("session_id")
            if sid is None:
                continue
            # coerce to string
            sid = str(sid)
            seen.add(sid)

        if "LastEvaluatedKey" in resp:
            scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
        else:
            break

    print(f"Found {len(seen)} unique session_id(s). Upserting into '{SESSIONS_TABLE}'…")

    put_count = 0
    skip_count = 0
    for sid in sorted(seen):
        started_at = parse_session_start(sid)
        now = int(time.time())
        item = {
            "session_id": sid,            # PK
            "status": "unknown",          # we’ll set active/ended later
            "created_at": now,            # backfill timestamp
        }
        if started_at is not None:
            item["started_at"] = started_at

        try:
            sessions.put_item(
                Item=item,
                ConditionExpression="attribute_not_exists(session_id)"  # don’t overwrite
            )
            put_count += 1
        except sessions.meta.client.exceptions.ConditionalCheckFailedException:
            skip_count += 1

    print(json.dumps({"inserted": put_count, "skipped_existing": skip_count}, indent=2))

if __name__ == "__main__":
    main()
