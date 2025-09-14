# AWS IoT Inventory (summary)

_Generated from `cloud-inventory/iot` on 2025-09-02T01:32:18Z. Raw JSON is gitignored._

## Endpoints
- **cred-provider**: `c2fvvvn6nygvhs.credentials.iot.us-east-2.amazonaws.com`
- **data-ats**: `alrvpmzrb225x-ats.iot.us-east-2.amazonaws.com`
- **jobs**: `lje0j3hrsripg.jobs.iot.us-east-2.amazonaws.com`

## Things → Certificates → Policies

| Thing | CertId(s) & Status | Policies (per Cert) |
|------|---------------------|----------------------|
| SmokehouseDevice | c82aad9ad5114acf3c5377a41de4cf397cb2fda51f1cc4482e5bf25725b773c4(ACTIVE) | SmokehouseDevice-Policy |

## Topic Rules

### Rule: `InsertSensorData`
- **SQL**: `SELECT 
  session_id,
  timestamp,
  outside_temp,
  bottom_temp,
  middle_temp,
  top_temp,
  probe1_temp,
  probe2_temp,
  probe3_temp,
  humidity,
  smoke_ppm
FROM 'smokehouse/sensordata'`
- **Actions**:
- DynamoDBv2 → table: sensor_data

### Rule: `Smokehouse_WakeUp`
- **SQL**: `SELECT * FROM 'smokehouse/wake-up'`
- **Actions**:
- Lambda → arn: arn:aws:lambda:us-east-2:623626440685:function:Smokehouse_WakeUp

## Jobs

## Role Aliases
