import { NextRequest } from "next/server";
import type { StreamEvent } from "@exam-prep/agent/src/progress.js";
import { randomUUID } from "crypto";
import { auth } from "../../../../auth";
import { saveChatHistory } from "../../../lib/chatHistory";

export const runtime = "nodejs";

// Turns each agent event into one Server-Sent-Events line ("data: {...}").
function toSSE(
  userId: string,
  sessionId: string,
  question: string,
): TransformStream<StreamEvent, Uint8Array> {
  const encoder = new TextEncoder();
  return new TransformStream<StreamEvent, Uint8Array>({
    async transform(event, controller) {
      if (event.type === "done") {
        try {
          await saveChatHistory(userId, sessionId, question, event.data);
        } catch (error) {
          console.error("[chatHistory] failed to save:", error);
        }
      }

      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    },
  });
}

export async function POST(req: NextRequest) {
  const { message, model, sessionId } = await req.json();

  if (!message) {
    return new Response("Message is required", { status: 400 });
  }

  const authSession = await auth();
  const userId = authSession.user.id;
  const activeSessionId =
    typeof sessionId === "string" && sessionId ? sessionId : randomUUID();

  // The agent runs inside this server process — no separate agent server.
  const { hub } = await import("@exam-prep/agent/src/hub/index.js");

  const agentStream = hub(
    [{ role: "user", content: message }],
    model ?? "claude-haiku-4-5-20251001",
    req.signal
  );

  return new Response(
    agentStream.pipeThrough(toSSE(userId, activeSessionId, message)),
    {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
    },
  );
}