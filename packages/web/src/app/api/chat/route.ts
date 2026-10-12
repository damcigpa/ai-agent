import { NextRequest } from "next/server";
import type { StreamEvent } from "@exam-prep/agent/src/progress.js";
import { prepareQuestion } from "@exam-prep/agent/src/prepareQuestion";
import { randomUUID } from "crypto";
import { auth } from "../../../../auth";
import { getChatHistoryBySession, saveChatHistory } from "../../../lib/chatHistory";
import { getStore } from "../../../lib/library";

export const runtime = "nodejs";

// The student's own material: the hub searches it before any web research (RAG).
// A failure (for example a missing Voyage key) only means the answer comes from the web.
async function searchLibrary(question: string) {
  try {
    const store = await getStore();
    return await store.search(question, 5);
  } catch (error) {
    console.error("[library search] skipped:", error);
    return [];
  }
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

  // Earlier questions and answers of this conversation (kept in memory by chatHistory.ts),
  // so a follow-up like "And the third one?" can be made self-contained.
  const history = (await getChatHistoryBySession(activeSessionId))
    .filter((item) => item.userId === userId)
    .flatMap((item) => [
      { role: "user" as const, content: item.question },
      { role: "assistant" as const, content: item.answer },
    ]);

  const encoder = new TextEncoder();

  // One Server-Sent-Events line per agent event ("data: {...}").
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // the client went away (Stop button) — nothing left to send to
        }
      };

      try {
        // Same safety checks, follow-up rewriting and library search as the CLI (prepareQuestion.ts).
        const prepared = await prepareQuestion(message, {
          history,
          searchLibrary,
          onProgress: (m) => send({ type: "progress", data: m }),
        });

        if (prepared.ok === false) {
          send({ type: "done", data: prepared.message });
          return;
        }

        // The agent runs inside this server process — no separate agent server.
        const { hub } = await import("@exam-prep/agent/src/hub/index.js");
        const reader = hub(
           [{ role: "user", content: prepared.standaloneQuestion }],
          model ?? "claude-haiku-4-5-20251001",
          req.signal,
          {
            searchLibrary: async () => prepared.hits,
            standaloneQuestion: prepared.standaloneQuestion,
          },
        ).getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value.type === "done") {
            try {
              await saveChatHistory(userId, activeSessionId, message, value.data);
            } catch (error) {
              console.error("[chatHistory] failed to save:", error);
            }
          }
          send(value);
        }
      } catch (error) {
        send({ type: "error", data: error instanceof Error ? error.message : "Something went wrong." });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed because the client went away
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}