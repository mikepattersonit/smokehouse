import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'us-east-2' });
const dynamoDb = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
  const params = {
    TableName: 'sensor_data',
    KeyConditionExpression: 'session_id = :sessionId',
    ExpressionAttributeValues: {
      ':sessionId': 123, // Replace 123 with the correct session_id value
    },
    ScanIndexForward: false, // Latest data first
    Limit: 10, // Limit the number of records fetched
  };

  try {
    const data = await dynamoDb.send(new QueryCommand(params));
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data.Items),
    };
  } catch (error) {
    console.error('Error fetching data from DynamoDB:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Could not fetch sensor data' }),
    };
  }
};
