# IAM Inventory (read-only summary)

_Generated from local files in `cloud-inventory/iam` on 2025-09-01T22:18:06Z. Raw JSON is **not** committed._

## Lambda → Role mapping

| Lambda                         | RoleName                                 | Runtime      | Handler                        |
|--                             -|--                                       -|--           -|--                             -|
| Lambda                         | RoleName                                 | Runtime      | Handler                        |
| ManageProbeAssignments         | ManageProbeAssignments-role-tgh8uf69     | python3.13   | lambda_function.lambda_handler |
| SmokehouseAIAdvisor            | SmokehouseAIAdvisor-role-4urtfd4y        | python3.13   | lambda_function.lambda_handler |
| SmokehouseSensorAlerts         | SmokehouseSensorAlerts-role-u6vuhcmf     | python3.13   | lambda_function.lambda_handler |
| SmokehouseUpdateSession        | SmokehouseUpdateSession-role-mia45do7    | python3.13   | lambda_function.lambda_handler |
| Smokehouse_Shutdown            | Smokehouse_Shutdown-role-j54e4zj3        | python3.13   | lambda_function.lambda_handler |
| Smokehouse_WakeUp              | Smokehouse_WakeUp-role-giotj03e          | python3.13   | lambda_function.lambda_handler |
| fetchSensorData                | fetchSensorData-role-oc1xfb1o            | nodejs18.x   | index.handler                  |
| lambda_meat_data               | lambda_meat_data-role-bmc67t41           | nodejs18.x   | index.handler                  |

## Roles, attached & inline policies

### Role: `ManageProbeAssignments-role-tgh8uf69`

- ARN: `arn:aws:iam::623626440685:role/service-role/ManageProbeAssignments-role-tgh8uf69`
- Attached managed policies:
  - AWSLambdaBasicExecutionRole-c9e21cf8-1d77-4941-a86d-e28b5d32f175 (arn:aws:iam::623626440685:policy/service-role/AWSLambdaBasicExecutionRole-c9e21cf8-1d77-4941-a86d-e28b5d32f175)
- Inline policies: _none_

### Role: `SmokehouseAIAdvisor-role-4urtfd4y`

- ARN: `arn:aws:iam::623626440685:role/service-role/SmokehouseAIAdvisor-role-4urtfd4y`
- Attached managed policies:
  - AWSLambdaBasicExecutionRole-f034964b-a64e-410a-9c7b-2235819af411 (arn:aws:iam::623626440685:policy/service-role/AWSLambdaBasicExecutionRole-f034964b-a64e-410a-9c7b-2235819af411)
- Inline policies: _none_

### Role: `SmokehouseSensorAlerts-role-u6vuhcmf`

- ARN: `arn:aws:iam::623626440685:role/service-role/SmokehouseSensorAlerts-role-u6vuhcmf`
- Attached managed policies:
  - AWSLambdaBasicExecutionRole-514c126a-79d4-4531-86aa-aedcaf143a83 (arn:aws:iam::623626440685:policy/service-role/AWSLambdaBasicExecutionRole-514c126a-79d4-4531-86aa-aedcaf143a83)
- Inline policies: _none_

### Role: `SmokehouseUpdateSession-role-mia45do7`

- ARN: `arn:aws:iam::623626440685:role/service-role/SmokehouseUpdateSession-role-mia45do7`
- Attached managed policies:
  - AWSLambdaBasicExecutionRole-d6f11a65-bcf1-4b00-9787-2931266adf62 (arn:aws:iam::623626440685:policy/service-role/AWSLambdaBasicExecutionRole-d6f11a65-bcf1-4b00-9787-2931266adf62)
- Inline policies: _none_

### Role: `Smokehouse_Shutdown-role-j54e4zj3`

- ARN: `arn:aws:iam::623626440685:role/service-role/Smokehouse_Shutdown-role-j54e4zj3`
- Attached managed policies:
  - AWSLambdaBasicExecutionRole-9266b730-6bad-4c52-8821-1edcfdd05892 (arn:aws:iam::623626440685:policy/service-role/AWSLambdaBasicExecutionRole-9266b730-6bad-4c52-8821-1edcfdd05892)
- Inline policies: _none_

### Role: `Smokehouse_WakeUp-role-giotj03e`

- ARN: `arn:aws:iam::623626440685:role/service-role/Smokehouse_WakeUp-role-giotj03e`
- Attached managed policies:
  - AWSLambdaBasicExecutionRole-15be25f6-20fa-4bea-8813-6d5e0d212ed2 (arn:aws:iam::623626440685:policy/service-role/AWSLambdaBasicExecutionRole-15be25f6-20fa-4bea-8813-6d5e0d212ed2)
- Inline policies: _none_

### Role: `fetchSensorData-role-oc1xfb1o`

- ARN: `arn:aws:iam::623626440685:role/service-role/fetchSensorData-role-oc1xfb1o`
- Attached managed policies:
  - AWSLambdaBasicExecutionRole-d6a6c010-37f0-4456-9fab-af1743290a89 (arn:aws:iam::623626440685:policy/service-role/AWSLambdaBasicExecutionRole-d6a6c010-37f0-4456-9fab-af1743290a89)
  - AWSLambdaInvocation-DynamoDB (arn:aws:iam::aws:policy/AWSLambdaInvocation-DynamoDB)
  - AmazonDynamoDBReadOnlyAccess (arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess)
- Inline policies:
  - Smokehouse_api_read

### Role: `lambda_meat_data-role-bmc67t41`

- ARN: `arn:aws:iam::623626440685:role/service-role/lambda_meat_data-role-bmc67t41`
- Attached managed policies:
  - AWSLambdaBasicExecutionRole-5d852533-1296-4b47-84ca-7bf0a10a589d (arn:aws:iam::623626440685:policy/service-role/AWSLambdaBasicExecutionRole-5d852533-1296-4b47-84ca-7bf0a10a589d)
  - AWSLambdaInvocation-DynamoDB (arn:aws:iam::aws:policy/AWSLambdaInvocation-DynamoDB)
  - AmazonDynamoDBReadOnlyAccess (arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess)
- Inline policies: _none_

## IoT

### Topic rules (names + ARNs)
- InsertSensorData (arn:aws:iot:us-east-2:623626440685:rule/InsertSensorData)
- Smokehouse_WakeUp (arn:aws:iot:us-east-2:623626440685:rule/Smokehouse_WakeUp)

### IoT policies
  - SmokehouseDevice-Policy (arn:aws:iot:us-east-2:623626440685:policy/SmokehouseDevice-Policy)

_End of summary._
