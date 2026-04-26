import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { webSearch } from "../tools/webSearch.js";
import { fetchPage } from "../tools/fetchPage.js";
import { createError, formatError } from "../errors.js";

const MAX_TURNS = 5;

const tools: Anthropic.Tool[] = [
  {
    name: "web_search",
    description:
      "Searches the web for current information, recent news, or anything that requires up to date knowledge. Use this to find the origin, author, and context of a given text. Always start with this tool.",
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
    name: "fetch_page",
    description:
      "Fetches the full content of a web page at a given URL. Use this when a search result looks promising but the snippet is too short to confirm the origin of the text. Read the full page for deeper context.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL of the page to fetch",
        },
      },
      required: ["url"],
    },
  },
];

export interface ResearchFindings {
  author: string;
  work: string;
  date: string;
  context: string;
  confidence: "high" | "medium" | "low";
  sources: string[];
}

function emptyFindings(): ResearchFindings {
  return {
    author: "",
    work: "",
    date: "",
    context: "",
    confidence: "low",
    sources: [],
  };
}

export async function searchSpoke(task: string): Promise<ResearchFindings> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `${task}

You must respond ONLY with a JSON object matching this exact shape, no explanation, no markdown:
{
  "author": "name of the author or empty string if unknown",
  "work": "title of the work or empty string if unknown",
  "date": "date or period or empty string if unknown",
  "context": "brief explanation of the text meaning and background",
  "confidence": "high" | "medium" | "low",
  "sources": ["url1", "url2"]
}

If a search result looks promising but the snippet is too short, use fetch_page to read the full article before responding.`,
    },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system:
          "You are a research assistant. Search the web to find the origin, author, and context of a given text. Always use web_search first. If snippets are insufficient, use fetch_page to read the full content of promising URLs. Always respond with valid JSON only.",
        tools,
        // Force web_search on first turn, let Claude decide after
        tool_choice:
          turn === 0 ? { type: "tool", name: "web_search" } : { type: "auto" },
        messages,
      });

      if (response.stop_reason === "end_turn") {
        const text = response.content
          .filter((b) => b.type === "text")
          .map((b) => (b as Anthropic.TextBlock).text)
          .join("")
          .trim()
          .replace(/```json|```/g, "")
          .trim();

        try {
          return JSON.parse(text) as ResearchFindings;
        } catch (e) {
          const error = createError(
            "PARSE_FAILED",
            "searchSpoke",
            "Failed to parse JSON response from search spoke",
            { cause: e, turn },
          );
          console.error(formatError(error));
          return emptyFindings();
        }
      }

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "tool_use") {
            const input = block.input as Record<string, string>;
            let result = "";

            switch (block.name) {
              case "web_search":
                result = await webSearch(input.query);
                break;
              case "fetch_page":
                console.log(`  [searchSpoke → fetch_page] ${input.url}`);
                result = await fetchPage(input.url);
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
        "searchSpoke",
        "API call failed in search spoke",
        { cause: e, turn },
      );
      console.error(formatError(error));
      return emptyFindings();
    }
  }

  const error = createError(
    "MAX_TURNS_REACHED",
    "searchSpoke",
    `Search spoke reached max turns (${MAX_TURNS})`,
  );
  console.warn(formatError(error));
  return emptyFindings();
}
