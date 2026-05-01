import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { webSearch } from "../tools/webSearch.js";
import { fetchPage } from "../tools/fetchPage.js";
import { createError, formatError } from "../errors.js";
import { PROMPTS } from "../prompts.js";

const MAX_TURNS = 5;

const tools: Anthropic.Tool[] = [
  {
    name: "web_search",
    description:
      "Searches the web for literary criticism, analysis, and scholarly perspectives on a work. Always start with this tool.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query string" },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_page",
    description:
      "Fetches the full content of a web page. Use this when a search result looks like a detailed analysis but the snippet is too short.",
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

export interface AnalysisFindings {
  title: string;
  author: string;
  period: string;
  synopsis: string;
  themes: string[];
  literaryDevices: string[];
  criticalPerspectives: string[];
  significance: string;
  confidence: "high" | "medium" | "low";
  sources: string[];
}

export function emptyAnalysis(): AnalysisFindings {
  return {
    title: "",
    author: "",
    period: "",
    synopsis: "",
    themes: [],
    literaryDevices: [],
    criticalPerspectives: [],
    significance: "",
    confidence: "low",
    sources: [],
  };
}

export async function analyzeSpoke(task: string): Promise<AnalysisFindings> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `${task}

You must respond ONLY with a JSON object matching this exact shape, no explanation, no markdown:
{
  "title": "title of the work",
  "author": "author of the work",
  "period": "literary period or date",
  "synopsis": "brief summary of the work",
  "themes": ["theme1", "theme2", "theme3"],
  "literaryDevices": ["device1: example", "device2: example"],
  "criticalPerspectives": ["perspective1", "perspective2"],
  "significance": "why this work matters in literary history",
  "confidence": "high" | "medium" | "low",
  "sources": ["url1", "url2"]
}

If a search result looks like a detailed analysis but the snippet is too short, use fetch_page to read the full article.`,
    },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: PROMPTS.analyze,
        tools,
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
          return JSON.parse(text) as AnalysisFindings;
        } catch (e) {
          const error = createError(
            "PARSE_FAILED",
            "searchSpoke",
            "Failed to parse analysis JSON",
            { cause: e, turn },
          );
          console.error(formatError(error));
          return emptyAnalysis();
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
                result = await webSearch(input.query, "literary_analysis");
                break;
              case "fetch_page":
                console.log(`  [analyzeSpoke → fetch_page] ${input.url}`);
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
        "API call failed in analyze spoke",
        { cause: e, turn },
      );
      console.error(formatError(error));
      return emptyAnalysis();
    }
  }

  const error = createError(
    "MAX_TURNS_REACHED",
    "searchSpoke",
    `Analyze spoke reached max turns (${MAX_TURNS})`,
  );
  console.warn(formatError(error));
  return emptyAnalysis();
}
