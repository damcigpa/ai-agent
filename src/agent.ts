import Anthropic from "@anthropic-ai/sdk";
import { hub } from "./hub.js";
import { createError, formatError, formatUserError } from "./errors.js";

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
    const response = await hub(applyCache(messages));
    messages.push({ role: "assistant", content: response });
    console.log(`\nClaude: ${response}\n`);
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
