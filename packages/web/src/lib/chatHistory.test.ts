import { randomUUID } from "crypto";
import { describe, it, expect } from "vitest";
import {
  saveChatHistory,
  getChatHistory,
  getChatHistoryBySession,
  deleteChatHistoryItem,
} from "./chatHistory";

describe("saveChatHistory", () => {
  it("stores a completed question and answer in its session", async () => {
    const userId = randomUUID();
    const sessionId = randomUUID();

    const result = await saveChatHistory(userId, sessionId, "question", "answer");

    expect(result).toMatchObject({ userId, sessionId, question: "question", answer: "answer" });
    expect(await getChatHistoryBySession(sessionId)).toEqual([result]);
  });
});

describe("getChatHistory", () => {
  it("returns a user's messages newest first and applies the limit", async () => {
    const userId = randomUUID();
    await saveChatHistory(userId, randomUUID(), "first", "answer");
    await saveChatHistory(userId, randomUUID(), "second", "answer");

    const result = await getChatHistory(userId, 1);

    expect(result.map((item) => item.question)).toEqual(["second"]);
  });

  it("returns no messages for another user", async () => {
    const item = await saveChatHistory(randomUUID(), randomUUID(), "q", "a");

    expect(await getChatHistory(item.userId + "-other")).toEqual([]);
  });
});

describe("getChatHistoryBySession", () => {
  it("returns one session's messages in insertion order", async () => {
    const sessionId = randomUUID();
    await saveChatHistory(randomUUID(), sessionId, "first", "answer 1");
    await saveChatHistory(randomUUID(), sessionId, "second", "answer 2");

    const result = await getChatHistoryBySession(sessionId);

    expect(result.map((item) => item.question)).toEqual(["first", "second"]);
  });
});

describe("deleteChatHistoryItem", () => {
  it("deletes only the matching user's item", async () => {
    const userId = randomUUID();
    const item = await saveChatHistory(userId, randomUUID(), "q", "a");

    await deleteChatHistoryItem(userId + "-other", item.createdAt);
    expect(await getChatHistoryBySession(item.sessionId)).toEqual([item]);

    await deleteChatHistoryItem(userId, item.createdAt);
    expect(await getChatHistoryBySession(item.sessionId)).toEqual([]);
  });
});