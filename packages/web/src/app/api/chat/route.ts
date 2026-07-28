import { NextRequest } from "next/server";
import type { StreamEvent } from "@exam-prep/agent/src/progress.js";
import { auth } from "../../../../auth";
import { saveChatHistory } from "../../../lib/chatHistory";

export const runtime = "nodejs";

// TransformStream converts each StreamEvent into an SSE-formatted chunk.
// pipeThrough/pipeTo respects backpressure natively via the Web Streams API.
// It also saves the Q&A pair the moment the "done" event passes through —
// this doesn't block or alter what's sent to the client.
function createSSETransform(
  userId: string,
  question: string
): TransformStream<StreamEvent, Uint8Array> {
  const encoder = new TextEncoder();

  return new TransformStream<StreamEvent, Uint8Array>({
    async transform(event, controller) {
      if (event.type === "done") {
        try {
          await saveChatHistory(userId, question, event.data);
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

  const { message, model } = await req.json();

  if (!message) {
    return new Response("Message is required", { status: 400 });
  }

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
  const sseStream = agentStream.pipeThrough(createSSETransform(userId, message));

  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
