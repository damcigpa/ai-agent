import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { resolvers } from "./resolvers";
import type { Session } from "next-auth";
import type { ChatHistoryItem } from "../lib/chatHistory";
import {
  getChatHistory,
  getChatHistoryBySession,
  deleteChatHistoryItem,
} from "../lib/chatHistory";
import { getUserById } from "../lib/users";
import type { SafeUser } from "../lib/users";

vi.mock("../../auth", () => ({
  auth: vi.fn(),
}));

vi.mock("../lib/chatHistory", () => ({
  getChatHistory: vi.fn(),
  getChatHistoryBySession: vi.fn(),
  deleteChatHistoryItem: vi.fn(),
}));

vi.mock("../lib/users", () => ({
  getUserById: vi.fn(),
}));

const { mockAuth } = vi.hoisted(() => {
  return {
    mockAuth: vi.fn() as Mock<() => Promise<Session | null>>,
  };
});


vi.mock("../../auth", () => ({
  auth: mockAuth,
}));

const mockGetChatHistory = vi.mocked(getChatHistory);
const mockGetChatHistoryBySession = vi.mocked(getChatHistoryBySession);
const mockDeleteChatHistoryItem = vi.mocked(deleteChatHistoryItem);
const mockGetUserById = vi.mocked(getUserById);

function fakeSession(userId: string): Session {
  return {
    user: { id: userId, email: "a@b.com", name: "A" },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function makeChatHistoryItem(
  overrides: Partial<ChatHistoryItem> = {}
): ChatHistoryItem {
  return {
    userId: "user-1",
    createdAt: "t1",
    question: "q1",
    answer: "a1",
    sessionId: "s1",
    ...overrides,
  };
}

function makeSafeUser(overrides: Partial<SafeUser> = {}): SafeUser {
  return {
    userId: "user-1",
    email: "a@b.com",
    name: "A",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Query.chatHistory", () => {
  it("throws Unauthorized when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(
      resolvers.Query.chatHistory({}, {})
    ).rejects.toThrow("Unauthorized");

    expect(mockGetChatHistory).not.toHaveBeenCalled();
  });

  it("passes the caller's userId and default limit", async () => {
    mockAuth.mockResolvedValue(fakeSession("user-1"));
    mockGetChatHistory.mockResolvedValue([]);

    await resolvers.Query.chatHistory({}, {});

    expect(mockGetChatHistory).toHaveBeenCalledWith("user-1", 20);
  });

  it("respects an explicit limit argument", async () => {
    mockAuth.mockResolvedValue(fakeSession("user-1"));
    mockGetChatHistory.mockResolvedValue([]);

    await resolvers.Query.chatHistory({}, { limit: 5 });

    expect(mockGetChatHistory).toHaveBeenCalledWith("user-1", 5);
  });
});

describe("Query.chatHistoryBySession — ownership check", () => {
  it("throws Unauthorized when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(
      resolvers.Query.chatHistoryBySession({}, { sessionId: "s1" })
    ).rejects.toThrow("Unauthorized");

    expect(mockGetChatHistoryBySession).not.toHaveBeenCalled();
  });

  it("returns items when every item belongs to the caller", async () => {
    mockAuth.mockResolvedValue(fakeSession("user-1"));
    const items = [
      makeChatHistoryItem({ createdAt: "t1" }),
      makeChatHistoryItem({ createdAt: "t2" }),
    ];
    mockGetChatHistoryBySession.mockResolvedValue(items);

    const result = await resolvers.Query.chatHistoryBySession(
      {},
      { sessionId: "s1" }
    );

    expect(result).toEqual(items);
  });

  it("throws Forbidden when even one item belongs to a different user", async () => {
    // This is the critical regression test: the GSI is keyed by sessionId
    // alone, so a malicious or buggy caller could otherwise read another
    // user's conversation just by supplying its sessionId.
    mockAuth.mockResolvedValue(fakeSession("user-1"));
    const items = [
      makeChatHistoryItem({ createdAt: "t1" }),
      makeChatHistoryItem({ userId: "attacker", createdAt: "t2" }),
    ];
    mockGetChatHistoryBySession.mockResolvedValue(items);

    await expect(
      resolvers.Query.chatHistoryBySession({}, { sessionId: "s1" })
    ).rejects.toThrow("Forbidden");
  });

  it("returns an empty array without throwing Forbidden when there are no items", async () => {
    // Guards against a naive rewrite of the ownership check (e.g. swapping
    // .some() for .every()) that would silently flip behavior on empty results.
    mockAuth.mockResolvedValue(fakeSession("user-1"));
    mockGetChatHistoryBySession.mockResolvedValue([]);

    const result = await resolvers.Query.chatHistoryBySession(
      {},
      { sessionId: "s1" }
    );

    expect(result).toEqual([]);
  });
});

describe("Query.me", () => {
  it("throws Unauthorized when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(resolvers.Query.me()).rejects.toThrow("Unauthorized");
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it("looks up the caller's own user record", async () => {
    mockAuth.mockResolvedValue(fakeSession("user-1"));
    mockGetUserById.mockResolvedValue(makeSafeUser());

    await resolvers.Query.me();

    expect(mockGetUserById).toHaveBeenCalledWith("user-1");
  });
});

describe("Mutation.deleteChatHistoryItem", () => {
  it("throws Unauthorized when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(
      resolvers.Mutation.deleteChatHistoryItem({}, { createdAt: "t1" })
    ).rejects.toThrow("Unauthorized");

    expect(mockDeleteChatHistoryItem).not.toHaveBeenCalled();
  });

  it("deletes using the SESSION's userId, never a client-supplied one", async () => {
    // args intentionally has no userId field at all — this test documents
    // that the mutation's safety comes from ignoring any such field even
    // if a future refactor accidentally added one to the schema.
    mockAuth.mockResolvedValue(fakeSession("user-1"));
    mockDeleteChatHistoryItem.mockResolvedValue(undefined);

    const result = await resolvers.Mutation.deleteChatHistoryItem(
      {},
      { createdAt: "t1" }
    );

    expect(mockDeleteChatHistoryItem).toHaveBeenCalledWith("user-1", "t1");
    expect(result).toBe(true);
  });
});