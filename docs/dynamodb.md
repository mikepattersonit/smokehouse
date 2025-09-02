# DynamoDB Inventory (summary)

_Generated from `cloud-inventory/ddb` on 2025-09-02T01:33:57Z. Raw JSON is gitignored._

## Table: `ProbeAssignments`
- ItemCount: 0
- SizeBytes: 0
- BillingMode: PAY_PER_REQUEST
- Keys:
  - HASH: SessionID (S)
- GSIs: 0
- TTL: DISABLED
- Sample attributes (first item):

## Table: `Sessions`
- ItemCount: 0
- SizeBytes: 0
- BillingMode: PAY_PER_REQUEST
- Keys:
  - HASH: Session_ID (S)
- GSIs: 0
- TTL: DISABLED
- Sample attributes (first item):

## Table: `meat_types`
- ItemCount: 15
- SizeBytes: 1021
- BillingMode: PAY_PER_REQUEST
- Keys:
  - HASH: name (S)
- GSIs: 0
- TTL: DISABLED
- Sample attributes (first item):
  - description
  - name

## Table: `sensor_data`
- ItemCount: 26022
- SizeBytes: 4163515
- BillingMode: PAY_PER_REQUEST
- Keys:
  - HASH: session_id (S)
  - RANGE: timestamp (S)
- GSIs: 0
- TTL: DISABLED
- Sample attributes (first item):
  - middle_temp
  - smoke_ppm
  - bottom_temp
  - probe1_temp
  - outside_temp
  - session_id
  - timestamp
  - humidity
  - probe2_temp
  - probe3_temp
  - top_temp

### Notes: sensor_data
- Expect PK `session_id` (S) and SK `timestamp` (S or N). Ensure front-end sends string session_id.

### Notes: Sessions
- Currently empty or not yet populated; plan a writer or a /sessions/latest query path.

