import Anthropic from "@anthropic-ai/sdk";
import { hub } from "./hub/index.js";
import { createError, formatError, formatUserError } from "./errors.js";
import { getUsageWarning } from "./tokenTracker.js";
import { StreamEvent } from "./progress.js";

const messages: { role: string; content: string }[] = [];

function applyCache(
  messages: { role: string; content: string }[],
): Anthropic.MessageParam[] {
  return messages.map((msg, index) => ({
    role: msg.role as "user" | "assistant",
    content: [
      {
        type: "text" as const,
        text: msg.content,
        ...(index === messages.length - 1 && {
          cache_control: { type: "ephemeral" as const },
        }),
      },
    ],
  }));
}

export async function chat(userMessage: string): Promise<string> {
  messages.push({ role: "user", content: userMessage });

  try {
    const stream = hub(applyCache(messages));
    const reader = stream.getReader();

    let finalResponse = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const event = value as StreamEvent;

      switch (event.type) {
        case "progress":
          console.log(event.data);
          break;
        case "chunk":
          process.stdout.write(event.data);
          break;
        case "done":
          finalResponse = event.data;
          console.log("\n");
          break;
        case "error":
          console.error(`Error: ${event.data}`);
          break;
      }
    }

    const warning = getUsageWarning();
    const response = warning ? `${finalResponse}${warning}` : finalResponse;
    messages.push({ role: "assistant", content: response });
    return response;
  } catch (e) {
    const error = createError(
      "HUB_FAILED",
      "agent",
      "Hub failed to process message",
      { cause: e },
    );
    console.error(formatError(error));
    const userFacing = formatUserError(error);
    messages.push({ role: "assistant", content: userFacing });
    return userFacing;
  }
}
