import { NextRequest } from "next/server";
import type { StreamEvent } from "@exam-prep/agent/src/progress.js";
import { randomUUID } from "crypto";
import { auth } from "../../../../auth";
import { saveChatHistory } from "../../../lib/chatHistory";
import { checkChatRateLimit } from "../../../lib/rateLimiter";

export const runtime = "nodejs";

// TransformStream converts each StreamEvent into an SSE-formatted chunk.
// pipeThrough/pipeTo respects backpressure natively via the Web Streams API.
// It also saves the Q&A pair the moment the "done" event passes through —
// this doesn't block or alter what's sent to the client.
function createSSETransform(
  userId: string,
  sessionId: string,
  question: string
): TransformStream<StreamEvent, Uint8Array> {
  const encoder = new TextEncoder();

  return new TransformStream<StreamEvent, Uint8Array>({
    async transform(event, controller) {
      if (event.type === "done") {
        // awaited deliberately — guarantees the save completes before this
        // request's execution context can be torn down (matters especially
        // on serverless runtimes, where fire-and-forget work can be cut off
        // the instant the response finishes). The small delay here is
        // invisible to the user since the answer text has already streamed.
        try {
          await saveChatHistory(userId, sessionId, question, event.data);
        } catch (e) {
          console.error("[chatHistory] failed to save:", e);
        }
      }

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
      );
    },
  });
}

export async function POST(req: NextRequest) {
  // Verify the JWT/session — NOT the request body — proves who's calling.
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  // Rate limit check happens BEFORE parsing the body or touching the agent —
  // this is deliberately the FIRST real work done after auth, precisely
  // because the agent call is the expensive part (real Anthropic + Tavily
  // API costs) we're protecting against.
  const rateLimit = await checkChatRateLimit(userId);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please slow down." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(rateLimit.msBeforeNext / 1000)),
        },
      }
    );
  }

  const { message, model, sessionId } = await req.json();

  if (!message) {
    return new Response("Message is required", { status: 400 });
  }

  // The client doesn't send sessionId yet (that piece is deferred — see
  // project notes). Falling back to a fresh UUID here keeps every message
  // correctly saved and queryable NOW, and requires ZERO changes to this
  // route once the client starts sending a real, persisted sessionId —
  // it'll simply stop hitting this fallback.
  const activeSessionId = sessionId ?? randomUUID();

  const { hub } = await import("@exam-prep/agent/src/hub/index.js");

  // Progress events now flow through hub()'s own ReadableStream —
  // no global handler, no shared state, safe under concurrent requests.
  const agentStream = hub(
    [{ role: "user", content: message }],
    model ?? "claude-haiku-4-5-20251001",
    req.signal
  );

  // pipeThrough applies the SSE transform with automatic backpressure handling.
  // If the client disconnects, the platform cancels this stream automatically,
  // which propagates cancellation back to hub()'s own stream.
  const sseStream = agentStream.pipeThrough(
    createSSETransform(userId, activeSessionId, message)
  );

  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
