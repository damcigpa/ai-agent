import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { webSearch } from "../tools/webSearch.js";
import { fetchPage } from "../tools/fetchPage.js";
import { createError, formatError } from "../errors.js";
import { PROMPTS } from "../prompts.js";
import { trackUsage } from "../tokenTracker.js";

const MAX_TURNS = 5;

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
        url: { type: "string", description: "The full URL of the page to fetch" },
      },
      required: ["url"],
    },
  },
  {
    name: "submit_analysis",
    description: "Submit the final literary analysis as structured data",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        author: { type: "string" },
        period: { type: "string" },
        synopsis: { type: "string" },
        themes: { type: "array", items: { type: "string" } },
        literaryDevices: { type: "array", items: { type: "string" } },
        criticalPerspectives: { type: "array", items: { type: "string" } },
        significance: { type: "string" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        sources: { type: "array", items: { type: "string" } },
      },
      required: ["title", "author", "period", "synopsis", "themes", "literaryDevices", "criticalPerspectives", "significance", "confidence", "sources"],
    },
  },
];

export async function analyzeSpoke(
  task: string,
  model: string = "claude-haiku-4-5-20251001"
): Promise<AnalysisFindings> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `${task}

If a search result looks like a detailed analysis but the snippet is too short, use fetch_page to read the full article.
When you have enough information, submit your analysis using the submit_analysis tool.`,
    },
  ];

  let correctionTurn = false;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    try {
      const stream = client.messages.stream({
        model,
        max_tokens: 2048,
        system: [
          {
            type: "text",
            text: PROMPTS.analyze,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools,
        tool_choice: correctionTurn
          ? { type: "tool", name: "submit_analysis" }
          : turn === 0
          ? { type: "tool", name: "web_search" }
          : { type: "auto" },
        messages,
      });

      stream.on("message", (msg) => {
        trackUsage(msg.usage);
      });

      const response = await stream.finalMessage();

      if (response.stop_reason === "end_turn" || response.stop_reason === "max_tokens") {
        // Claude responded with text instead of calling submit_analysis
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user" as const,
          content: "Submit your analysis using the submit_analysis tool.",
        });
        correctionTurn = true;
        continue;
      }

      if (response.stop_reason === "tool_use") {
        const toolBlocks = response.content.filter(
          (b) => b.type === "tool_use"
        ) as Anthropic.ToolUseBlock[];

        // Check if Claude submitted analysis
        const submitBlock = toolBlocks.find((b) => b.name === "submit_analysis");
        if (submitBlock) {
          correctionTurn = false;
          return submitBlock.input as AnalysisFindings;
        }

        // Handle web_search and fetch_page tool calls
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
        { cause: e, turn }
      );
      console.error(formatError(error));
      return emptyAnalysis();
    }
  }

  const error = createError(
    "MAX_TURNS_REACHED",
    "searchSpoke",
    `Analyze spoke reached max turns (${MAX_TURNS})`
  );
  console.warn(formatError(error));
  return emptyAnalysis();
}