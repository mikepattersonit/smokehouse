import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client in the correct region
const client = new DynamoDBClient({ region: 'us-east-2' }); // Ensure the region is us-east-2
const dynamoDb = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  // Extract session_id from query parameters
  //const sessionId = Number(event.queryStringParameters?.session_id);
  const raw = event.queryStringParameters?.session_id ?? event.queryStringParameters?.Session_ID;
  const sessionId = (raw ?? '').toString().trim();
  console.log('Parsed sessionId:', sessionId);

  // Validate session_id
  if (!sessionId) {
    console.error('Invalid session_id:', event.queryStringParameters?.session_id);
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Enable CORS
        'Access-Control-Allow-Methods': 'GET',
      },
      body: JSON.stringify({ error: 'Invalid session_id' }),
    };
  }

  // Define DynamoDB query parameters
  const params = {
    TableName: 'sensor_data', // Ensure this matches your DynamoDB table name
    KeyConditionExpression: 'session_id = :sessionId',
    ExpressionAttributeValues: {
      ':sessionId': sessionId,
    },
    ScanIndexForward: false, // Get the latest data first
    Limit: 10, // Adjust as needed
  };

  try {
    console.log('Querying DynamoDB with params:', JSON.stringify(params, null, 2));

    // Execute query
    const data = await dynamoDb.send(new QueryCommand(params));
    console.log('Query succeeded:', JSON.stringify(data.Items, null, 2));

    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Enable CORS
        'Access-Control-Allow-Methods': 'GET',
      },
      body: JSON.stringify(data.Items),
    };
  } catch (error) {
    console.error('Error querying DynamoDB:', error);

    // Return error response
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Enable CORS
        'Access-Control-Allow-Methods': 'GET',
      },
      body: JSON.stringify({ error: 'Could not fetch sensor data' }),
    };
  }
};
