import { randomUUID } from "crypto";

export interface ChatHistoryItem {
  userId: string;
  // "<ISO timestamp>#<UUID>": sorts chronologically and is unique per item.
  createdAt: string;
  question: string;
  answer: string;
  // groups the messages of one conversation
  sessionId: string;
}

// In-memory store instead of DynamoDB: one local user, and the history lives
// as long as the server runs. It sits on globalThis because Next may load this
// module separately for each route, and they all need to see the same list.
const globalStore = globalThis as unknown as { __chatHistory?: ChatHistoryItem[] };
const items = (globalStore.__chatHistory ??= []);

// --- Save one Q&A pair, within a given session ---

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
  items.push(item);
  return item;
}

// --- A user's history, most recent first ---

export async function getChatHistory(
  userId: string,
  limit: number = 20
): Promise<ChatHistoryItem[]> {
  return items
    .filter((item) => item.userId === userId)
    .reverse()
    .slice(0, limit);
}

// --- All messages of one session, oldest first (replay order) ---

export async function getChatHistoryBySession(
  sessionId: string
): Promise<ChatHistoryItem[]> {
  return items.filter((item) => item.sessionId === sessionId);
}

// --- Delete one history item ---

export async function deleteChatHistoryItem(
  userId: string,
  createdAt: string
): Promise<void> {
  const index = items.findIndex(
    (item) => item.userId === userId && item.createdAt === createdAt
  );
  if (index !== -1) items.splice(index, 1);
}