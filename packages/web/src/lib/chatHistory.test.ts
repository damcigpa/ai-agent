import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import { PutCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import {
    saveChatHistory,
    getChatHistory,
    getChatHistoryBySession,
    deleteChatHistoryItem,
} from "./chatHistory";

const { mockSend } = vi.hoisted(() => {
    return {
        mockSend: vi.fn() as Mock<(command: unknown) => Promise<any>>,
    };
});

vi.mock("./dynamodb", () => ({
    db: { send: mockSend },
}));
vi.mock("crypto", () => ({
    randomUUID: vi.fn(() => "fixed-uuid"),
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe("saveChatHistory", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("writes a PutCommand with the correct table and item shape", async () => {
        const result = await saveChatHistory("user-1", "session-1", "q", "a");

        const command = mockSend.mock.calls[0][0] as PutCommand;
        expect(command.input).toEqual({
            TableName: "ChatHistory",
            Item: {
                userId: "user-1",
                // timestamp prefix + UUID suffix, joined with "#" — see chatHistory.ts
                createdAt: "2026-01-01T00:00:00.000Z#fixed-uuid",
                question: "q",
                answer: "a",
                sessionId: "session-1",
            },
        });
        expect(result).toEqual(command.input.Item);
    });
});

describe("getChatHistory", () => {
    it("queries by userId, newest first, with the given limit", async () => {
        mockSend.mockResolvedValue({ Items: [{ userId: "user-1" }] });

        const result = await getChatHistory("user-1", 5);

        const command = mockSend.mock.calls[0][0] as QueryCommand;
        expect(command).toBeInstanceOf(QueryCommand);
        expect(command.input).toMatchObject({
            TableName: "ChatHistory",
            KeyConditionExpression: "userId = :userId",
            ExpressionAttributeValues: { ":userId": "user-1" },
            ScanIndexForward: false, // newest first
            Limit: 5,
        });
        expect(result).toEqual([{ userId: "user-1" }]);
    });

    it("returns an empty array when DynamoDB returns no Items", async () => {
        mockSend.mockResolvedValue({});

        const result = await getChatHistory("user-1");

        expect(result).toEqual([]);
    });
});

describe("getChatHistoryBySession", () => {
    it("queries the sessionIndex GSI in ascending (replay) order", async () => {
        mockSend.mockResolvedValue({ Items: [{ sessionId: "s1" }] });

        const result = await getChatHistoryBySession("s1");

        const command = mockSend.mock.calls[0][0] as QueryCommand;
        expect(command).toBeInstanceOf(QueryCommand);
        expect(command.input).toMatchObject({
            TableName: "ChatHistory",
            // exact, case-sensitive index name — this exact field caused a real
            // bug once (capital "SessionIndex" vs. the actual "sessionIndex" GSI),
            // so this assertion is a direct regression guard against that.
            IndexName: "sessionIndex",
            KeyConditionExpression: "sessionId = :sessionId",
            ExpressionAttributeValues: { ":sessionId": "s1" },
            ScanIndexForward: true, // oldest first = replay order
        });
        expect(result).toEqual([{ sessionId: "s1" }]);
    });

    it("returns an empty array when DynamoDB returns no Items", async () => {
        mockSend.mockResolvedValue({});

        const result = await getChatHistoryBySession("s1");

        expect(result).toEqual([]);
    });
});

describe("deleteChatHistoryItem", () => {
    it("deletes using exactly the composite key (userId + createdAt)", async () => {
        await deleteChatHistoryItem("user-1", "t1");

        const command = mockSend.mock.calls[0][0] as DeleteCommand;
        expect(command).toBeInstanceOf(DeleteCommand);
        expect(command.input).toEqual({
            TableName: "ChatHistory",
            Key: { userId: "user-1", createdAt: "t1" },
        });
    });
});