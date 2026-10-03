import { NextRequest } from "next/server";
import type { StreamEvent } from "@exam-prep/agent/src/progress.js";

export const runtime = "nodejs";

// Turns each agent event into one Server-Sent-Events line ("data: {...}").
function toSSE(): TransformStream<StreamEvent, Uint8Array> {
  const encoder = new TextEncoder();
  return new TransformStream<StreamEvent, Uint8Array>({
    transform(event, controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    },
  });
}

export async function POST(req: NextRequest) {
  const { message, model } = await req.json();

  if (!message) {
    return new Response("Message is required", { status: 400 });
  }

  // The agent runs inside this server process — no separate agent server.
  const { hub } = await import("@exam-prep/agent/src/hub/index.js");

  const agentStream = hub(
    [{ role: "user", content: message }],
    model ?? "claude-haiku-4-5-20251001",
    req.signal
  );

  return new Response(agentStream.pipeThrough(toSSE()), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}