import Anthropic from "@anthropic-ai/sdk";
import { client } from "./client.js";
import { tools, runTool } from "./tools/index.js";

const messages: Anthropic.MessageParam[] = [];

const MAX_TURNS = 20;

export async function chat(userMessage: string): Promise<void> {
  messages.push({ role: "user", content: userMessage });

  let turn = 0;

  while (turn < MAX_TURNS) {
    turn++;

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        tools,
        messages,
      });
    } catch (e) {
      console.error(`API error: ${(e as Error).message}`);
      break;
    }

    if (response.stop_reason === "end_turn") {
      for (const block of response.content) {
        if (block.type === "text") {
          console.log(`\nClaude: ${block.text}\n`);
        }
      }
      messages.push({ role: "assistant", content: response.content });
      break;
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          const input = block.input as Record<string, string>;
          console.log(`  [${block.name}] ${JSON.stringify(input)}`);
          const result = runTool(block.name, input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  if (turn === MAX_TURNS) {
    console.warn(
      `\n⚠️  Warning: max turns (${MAX_TURNS}) reached — loop was force-stopped`,
    );
  }
}
