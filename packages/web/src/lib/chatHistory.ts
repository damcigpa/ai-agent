import { PutCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { db } from "./dynamodb";

export interface ChatHistoryItem {
  userId: string;
  // sort key — "<ISO timestamp>#<UUID>". The timestamp prefix preserves
  // correct chronological sorting (ScanIndexForward still works as plain
  // string comparison); the UUID suffix guarantees uniqueness even if two
  // saves land in the exact same millisecond, which a bare timestamp alone
  // cannot guarantee.
  createdAt: string;
  question: string;
  answer: string;
  // groups messages into a conversation thread. NOT part of the main
  // table's key — queried via a separate GSI (SessionIndex). Client-
  // generated (crypto.randomUUID()), persisted in sessionStorage.
  sessionId: string;
}

const TABLE_NAME = "ChatHistory";

// --- Save one Q&A pair for a user, within a given session ---

export async function saveChatHistory(
  userId: string,
  sessionId: string,
  question: string,
  answer: string
): Promise<ChatHistoryItem> {
  const item: ChatHistoryItem = {
    userId,
    createdAt: `${new Date().toISOString()}#${randomUUID()}`,
    question,
    answer,
    sessionId,
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

// --- Get ALL messages belonging to ONE specific session, in chronological
// order (oldest first — the natural order to REPLAY a conversation, the
// opposite of getChatHistory's newest-first list view). Uses the
// SessionIndex GSI, since sessionId is not the main table's key. ---

export async function getChatHistoryBySession(
  sessionId: string
): Promise<ChatHistoryItem[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "sessionIndex",
      KeyConditionExpression: "sessionId = :sessionId",
      ExpressionAttributeValues: {
        ":sessionId": sessionId,
      },
      ScanIndexForward: true, // true = ascending = oldest first = replay order
    })
  );

  return (result.Items as ChatHistoryItem[]) ?? [];
}

// --- Delete a single history item, identified by BOTH parts of the
// composite key. userId always comes from the session, never from a
// client-supplied argument — this is what prevents one user from ever
// being able to delete another user's item, even if they somehow
// guessed a valid createdAt value. ---

export async function deleteChatHistoryItem(
  userId: string,
  createdAt: string
): Promise<void> {
  await db.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { userId, createdAt },
    })
  );
}