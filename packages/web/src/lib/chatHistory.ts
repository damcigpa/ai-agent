import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "./dynamodb";

export interface ChatHistoryItem {
  userId: string;
  createdAt: string; // sort key — ISO timestamp, naturally orders history
  question: string;
  answer: string;
}

const TABLE_NAME = "ChatHistory";

// --- Save one Q&A pair for a user ---

export async function saveChatHistory(
  userId: string,
  question: string,
  answer: string
): Promise<ChatHistoryItem> {
  const item: ChatHistoryItem = {
    userId,
    createdAt: new Date().toISOString(),
    question,
    answer,
  };

  await db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    })
  );

  return item;
}

// --- Get a user's history, most recent first ---

export async function getChatHistory(
  userId: string,
  limit: number = 20
): Promise<ChatHistoryItem[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
      ScanIndexForward: false, // false = descending by sort key = newest first
      Limit: limit,
    })
  );

  return (result.Items as ChatHistoryItem[]) ?? [];
}
