import Anthropic from "@anthropic-ai/sdk";
import { webSearch } from "./webSearch.js";

export const tools: Anthropic.Tool[] = [
  {
    name: "web_search",
    description:
      "Searches the web for current information, recent news, or anything that requires up to date knowledge.",
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
];

export async function runTool(
  name: string,
  input: Record<string, string>
): Promise<string> {
  switch (name) {
    case "web_search":
      return await webSearch(input.query, "general");
    default:
      return `Unknown tool: ${name}`;
  }
}