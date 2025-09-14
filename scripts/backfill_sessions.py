import os, boto3, time
from boto3.dynamodb.conditions import Key, Attr

REGION = os.environ.get("AWS_REGION", "us-east-2")
TABLE_SENSOR = os.environ.get("TABLE_SENSOR", "sensor_data")
TABLE_SESS   = os.environ.get("TABLE_SESS", "sessions")

ddb = boto3.resource("dynamodb", region_name=REGION)
t_sensors = ddb.Table(TABLE_SENSOR)
t_sessions = ddb.Table(TABLE_SESS)

def main():
    print(f"Scanning table: {TABLE_SENSOR} (projection: session_id)")
    seen = set()
    scan_kwargs = {"ProjectionExpression": "session_id"}
    while True:
        resp = t_sensors.scan(**scan_kwargs)
        for item in resp.get("Items", []):
            sid = str(item.get("session_id", "")).strip()
            if sid:
                seen.add(sid)
        if "LastEvaluatedKey" in resp:
            scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
        else:
            break

    print(f"Found {len(seen)} unique session_id(s). Upserting into '{TABLE_SESS}'…")
    inserted = 0
    skipped = 0
    now = int(time.time())

    for sid in seen:
        # try to create item if not exists
        try:
            t_sessions.put_item(
                Item={
                    "session_id": sid,
                    "started_at": now,          # best-effort; will be corrected by stream upserter later
                    "created_at": now,
                    "status": "unknown",
                },
                ConditionExpression="attribute_not_exists(session_id)"
            )
            inserted += 1
        except Exception:
            skipped += 1

    print({"inserted": inserted, "skipped_existing": skipped})

if __name__ == "__main__":
    main()
