import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import type { StreamEvent } from "@exam-prep/agent/src/progress.js";
import { getChatHistoryBySession } from "../../../lib/chatHistory";
import { POST } from "./route";

const { mockHub } = vi.hoisted(() => ({ mockHub: vi.fn() }));

vi.mock("../../../../auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "local" } })),
}));
vi.mock("@exam-prep/agent/src/hub/index.js", () => ({ hub: mockHub }));

function createEventStream(events: StreamEvent[]): ReadableStream<StreamEvent> {
  return new ReadableStream({
    start(controller) {
      events.forEach((event) => controller.enqueue(event));
      controller.close();
    },
  });
}

describe("POST /api/chat", () => {
  it("saves the completed answer to the chat session history", async () => {
    const sessionId = randomUUID();
    mockHub.mockReturnValueOnce(
      createEventStream([
        { type: "chunk", data: "Completed answer" },
        { type: "done", data: "Completed answer" },
      ]),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Question", sessionId }),
      }),
    );

    expect(response.status).toBe(200);
    await response.text();
    expect(await getChatHistoryBySession(sessionId)).toMatchObject([
      {
        userId: "local",
        sessionId,
        question: "Question",
        answer: "Completed answer",
      },
    ]);
  });
});
