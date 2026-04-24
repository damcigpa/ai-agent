import Anthropic from "@anthropic-ai/sdk";
import { webSearch } from "./webSearch.js";

export const tools: Anthropic.Tool[] = [
  {
    name: "web_search",
    description:
      "Searches the web for information on a given query and returns relevant results.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The search query string, e.g. 'latest Python frameworks 2025'",
        },
      },
      required: ["query"],
    },
  },
];

export function runTool(name: string, input: Record<string, string>): string {
  switch (name) {
    case "web_search":
      return webSearch(input.query);
    default:
      return `Unknown tool: ${name}`;
  }
}
