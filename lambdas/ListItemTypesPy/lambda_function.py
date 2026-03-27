import os, json, boto3
from decimal import Decimal

DDB = boto3.resource('dynamodb')
TABLE = os.environ.get('ITEM_TYPES_TABLE', 'meat_types')
table = DDB.Table(TABLE)

def _to_native(x):
    if isinstance(x, Decimal):
        return int(x) if x % 1 == 0 else float(x)
    if isinstance(x, list):
        return [_to_native(v) for v in x]
    if isinstance(x, dict):
        return {k: _to_native(v) for k, v in x.items()}
    return x

def lambda_handler(event, context):
    # Name is reserved in projections, so alias it
    resp = table.scan(
        ProjectionExpression="#n, description",
        ExpressionAttributeNames={"#n": "name"}
    )
    items = _to_native(resp.get("Items", []))
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(items)
    }
