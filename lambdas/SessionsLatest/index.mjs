import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-2" }));

export const handler = async () => {
  // Prefer GSI if available, else fallback (cheap scan with limit)
  try {
    const q = new QueryCommand({
      TableName: "sessions",
      IndexName: "last_seen-index",
      KeyConditionExpression: "last_seen = :ls", // simple hash index; use latest 'today' bucket if you bucket it
      ExpressionAttributeValues: { ":ls": new Date().toISOString().slice(0,10) } // OPTIONAL: if you later bucket last_seen, adjust
    });
    // If not using a bucketed GSI, fallback to scan to find max last_seen
    const res = await ddb.send(new ScanCommand({ TableName: "sessions", ProjectionExpression: "session_id, start_time, last_seen, status" }));
    if (!res.Items || !res.Items.length) return resp({ session_id: null });
    res.Items.sort((a,b) => (b.last_seen||"") .localeCompare(a.last_seen||""));
    return resp(res.Items[0]);
  } catch (e) {
    // Fallback: scan
    const res = await ddb.send(new ScanCommand({ TableName: "sessions", ProjectionExpression: "session_id, start_time, last_seen, status" }));
    if (!res.Items || !res.Items.length) return resp({ session_id: null });
    res.Items.sort((a,b) => (b.last_seen||"").localeCompare(a.last_seen||""));
    return resp(res.Items[0]);
  }
};

function resp(body, code=200) {
  return { statusCode: code,
    headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" },
    body: JSON.stringify(body)
  };
}
