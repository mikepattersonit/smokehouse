# DynamoDB Data Model

_Generated from local inventory in `cloud-inventory` on 2025-09-01T22:25:47Z._ 

## Table: `ProbeAssignments`

- **Primary key:** `SessionID` (PK)
- **Attributes:**
  - `SessionID` (S)
- **TTL:** not enabled

<details><summary>Sample items (first 3)</summary>

[]

</details>

## Table: `Sessions`

- **Primary key:** `Session_ID` (PK)
- **Attributes:**
  - `Session_ID` (S)
- **TTL:** not enabled

<details><summary>Sample items (first 3)</summary>

[]

</details>

## Table: `meat_types`

- **Primary key:** `name` (PK)
- **Attributes:**
  - `name` (S)
- **TTL:** not enabled

<details><summary>Sample items (first 3)</summary>

[
  {
    "description": {
      "S": "Various types of sausage links for smoking."
    },
    "name": {
      "S": "sausage"
    }
  },
  {
    "description": {
      "S": "Whole quail, a small bird ideal for smoking."
    },
    "name": {
      "S": "quail"
    }
  },
  {
    "description": {
      "S": "Whole duck or parts like breasts."
    },
    "name": {
      "S": "duck"
    }
  }
]

</details>

## Table: `sensor_data`

- **Primary key:** `session_id` (PK), `timestamp` (SK)
- **Attributes:**
  - `session_id` (S)
  - `timestamp` (S)
- **TTL:** not enabled

<details><summary>Sample items (first 3)</summary>

[
  {
    "middle_temp": {
      "N": "0"
    },
    "smoke_ppm": {
      "N": "12.02346041"
    },
    "bottom_temp": {
      "N": "0"
    },
    "probe1_temp": {
      "N": "0"
    },
    "outside_temp": {
      "N": "0"
    },
    "session_id": {
      "S": "20250829230350"
    },
    "timestamp": {
      "S": "230352"
    },
    "humidity": {
      "N": "0"
    },
    "probe2_temp": {
      "N": "0"
    },
    "probe3_temp": {
      "N": "0"
    },
    "top_temp": {
      "N": "0"
    }
  },
  {
    "middle_temp": {
      "N": "-999"
    },
    "smoke_ppm": {
      "N": "4.056695992"
    },
    "bottom_temp": {
      "N": "79"
    },
    "probe1_temp": {
      "N": "-999"
    },
    "outside_temp": {
      "N": "0"
    },
    "session_id": {
      "S": "20250829230350"
    },
    "timestamp": {
      "S": "230357"
    },
    "humidity": {
      "N": "0"
    },
    "probe2_temp": {
      "N": "0"
    },
    "probe3_temp": {
      "N": "0"
    },
    "top_temp": {
      "N": "76"
    }
  },
  {
    "middle_temp": {
      "N": "-999"
    },
    "smoke_ppm": {
      "N": "11.29032258"
    },
    "bottom_temp": {
      "N": "79"
    },
    "probe1_temp": {
      "N": "-999"
    },
    "outside_temp": {
      "N": "80"
    },
    "session_id": {
      "S": "20250829230350"
    },
    "timestamp": {
      "S": "230402"
    },
    "humidity": {
      "N": "0"
    },
    "probe2_temp": {
      "N": "77"
    },
    "probe3_temp": {
      "N": "-999"
    },
    "top_temp": {
      "N": "76"
    }
  }
]

</details>

_End of doc._
