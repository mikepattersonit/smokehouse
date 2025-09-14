import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client in the correct region
const client = new DynamoDBClient({ region: 'us-east-2' }); // Ensure the region is us-east-2
const dynamoDb = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  // Define DynamoDB scan parameters
  const params = {
    TableName: 'meat_types', // Ensure this matches your DynamoDB table name for meat types
  };

  try {
    console.log('Scanning DynamoDB with params:', JSON.stringify(params, null, 2));

    // Execute scan
    const data = await dynamoDb.send(new ScanCommand(params));
    console.log('Scan succeeded:', JSON.stringify(data.Items, null, 2));

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
    console.error('Error scanning DynamoDB:', error);

    // Return error response
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Enable CORS
        'Access-Control-Allow-Methods': 'GET',
      },
      body: JSON.stringify({ error: 'Could not fetch meat types' }),
    };
  }
};
