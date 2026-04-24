import boto3
import json
import os
from decimal import Decimal

ddb = boto3.resource('dynamodb')
TABLE = ddb.Table(os.environ.get('SESSIONS_TABLE', 'sessions'))

UPDATABLE_FIELDS = {'target_pit_temp_f'}

def _response(status, body):
    return {
        'statusCode': status,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
        'body': json.dumps(body),
    }

def lambda_handler(event, context):
    method = (
        event.get('requestContext', {}).get('http', {}).get('method')
        or event.get('httpMethod')
        or 'POST'
    ).upper()

    if method == 'OPTIONS':
        return _response(204, {})

    try:
        data = json.loads(event.get('body') or '{}')
    except Exception:
        return _response(400, {'ok': False, 'error': 'Invalid JSON'})

    session_id = str(data.get('session_id') or '').strip()
    if not session_id:
        return _response(400, {'ok': False, 'error': 'session_id is required'})

    updates = {}
    for field in UPDATABLE_FIELDS:
        if field in data and data[field] is not None:
            try:
                updates[field] = Decimal(str(data[field]))
            except Exception:
                return _response(400, {'ok': False, 'error': f'Invalid value for {field}'})

    if not updates:
        return _response(400, {'ok': False, 'error': 'No valid fields to update'})

    expr = 'SET ' + ', '.join(f'#{k} = :{k}' for k in updates)
    names = {f'#{k}': k for k in updates}
    vals = {f':{k}': v for k, v in updates.items()}

    try:
        TABLE.update_item(
            Key={'session_id': session_id},
            UpdateExpression=expr,
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=vals,
        )
        return _response(200, {'ok': True})
    except Exception as e:
        return _response(500, {'ok': False, 'error': str(e)})
