import Anthropic from "@anthropic-ai/sdk";
import { webSearch } from "./webSearch.js";
import { readFile } from "./readFile.js";
import { writeFile } from "./writeFile.js";

export const tools: Anthropic.Tool[] = [
  {
    name: "web_search",
    description:
      "Searches the web for current information, recent news, or anything that requires up to date knowledge. Use this to find the origin, context, or background of a given text.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query string",
        },
      },
      required: ["query"],
    },
  },
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

export async function runTool(
  name: string,
  input: Record<string, string>,
): Promise<string> {
  switch (name) {
    case "web_search":
      return await webSearch(input.query);
    case "read_file":
      return readFile(input.path);
    case "write_file":
      return writeFile(input.path, input.content);
    default:
      return `Unknown tool: ${name}`;
  }
}
