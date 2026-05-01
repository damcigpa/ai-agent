import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { readFile } from "../tools/readFile.js";
import { writeFile } from "../tools/writeFile.js";
import { createError, formatError } from "../errors.js";
import { PROMPTS } from "../prompts.js";

const MAX_TURNS = 3;

const tools: Anthropic.Tool[] = [
  {
    name: "read_file",
    description: "Reads the contents of a file at the given path.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "The file path to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Writes content to a file at the given path.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "The file path to write to" },
        content: { type: "string", description: "The content to write" },
      },
      required: ["path", "content"],
    },
  },
];

export async function fileSpoke(task: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: PROMPTS.file,
        tools,
        tool_choice: { type: "tool", name: "write_file" },
        messages,
      });

      if (response.stop_reason === "end_turn") {
        return response.content
          .filter((b) => b.type === "text")
          .map((b) => (b as Anthropic.TextBlock).text)
          .join("");
      }

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "tool_use") {
            const input = block.input as Record<string, string>;
            let result = "";

            switch (block.name) {
              case "read_file":
                result = readFile(input.path);
                break;
              case "write_file":
                result = writeFile(input.path, input.content);
                break;
              default:
                result = `Unknown tool: ${block.name}`;
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        messages.push({ role: "user", content: toolResults });
      }
    } catch (e) {
      const error = createError(
        "API_FAILED",
        "fileSpoke",
        "API call failed in file spoke",
        { cause: e, turn },
      );
      console.error(formatError(error));
      return formatError(error);
    }
  }

  const error = createError(
    "MAX_TURNS_REACHED",
    "fileSpoke",
    `File spoke reached max turns (${MAX_TURNS})`,
  );
  console.warn(formatError(error));
  return formatError(error);
}
