import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { webSearch } from "../tools/webSearch.js";
import { fetchPage } from "../tools/fetchPage.js";
import { verifyFact } from "../tools/verifyFact.js";
import { createError, formatError } from "../errors.js";
import { ResearchFindings, Subject } from "../types.js";
import { PROMPTS } from "../prompts.js";
import { emit } from "../progress.js";

const MAX_TURNS = 8;
const MAX_FETCHES = 2;

const tools: Anthropic.Tool[] = [
  {
    name: "web_search",
    description:
      "Searches the web for information. Always start with this tool.",
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
      "Fetches the full content of a web page at a given URL. Use this when a search result looks promising but the snippet is too short.",
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

export interface ResearchFindings2 {
  author: string;
  work: string;
  date: string;
  context: string;
  confidence: "high" | "medium" | "low";
  sources: string[];
  subject?: Subject;
  keyFacts?: string[];
  escalate?: boolean;
  escalateReason?: string;
}

function emptyFindings(subject: Subject): ResearchFindings {
  return {
    author: "",
    work: "",
    date: "",
    context: "",
    confidence: "low",
    sources: [],
    subject,
    keyFacts: [],
  };
}

async function routeByConfidence(
  findings: ResearchFindings,
): Promise<ResearchFindings> {
  switch (findings.confidence) {
    case "high":
      console.log("  ✅ Confidence high — skipping verification");
      return findings;

    case "medium":
      emit("verifying");
      console.log("  🔍 Confidence medium — running verification...");
      const verification = await verifyFact(findings);
      if (verification.confirmed) {
        console.log(`  ✅ Verified — ${verification.reason}`);
        return {
          ...findings,
          confidence: verification.confidence,
          sources: [...new Set([...findings.sources, ...verification.sources])],
        };
      } else {
        console.log(`  ⚠️  Verification failed — ${verification.reason}`);
        return {
          ...findings,
          confidence: "low",
          escalate: true,
          escalateReason: `Verification failed: ${verification.reason}`,
        };
      }

    case "low":
      console.log("  🔺 Confidence low — escalating to hub");
      return {
        ...findings,
        escalate: true,
        escalateReason:
          "Confidence too low to verify, needs different search strategy",
      };
  }
}

export async function searchSpoke(
  task: string,
  subject: Subject = "general",
): Promise<ResearchFindings> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `${task}

You must respond ONLY with a JSON object matching this exact shape, no explanation, no markdown:
{
  "author": "name of the author or relevant figure, or empty string if unknown",
  "work": "title of the work, law, event or topic, or empty string if unknown",
  "date": "date or period or empty string if unknown",
  "context": "detailed explanation of the topic",
  "confidence": "high" | "medium" | "low",
  "sources": ["url1", "url2"],
  "subject": "${subject}",
  "keyFacts": ["fact1", "fact2", "fact3"]
}

If search snippets are too short, use fetch_page on promising URLs before responding.`,
    },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: PROMPTS.search,
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
          const findings = JSON.parse(text) as ResearchFindings;
          return await routeByConfidence(findings);
        } catch (e) {
          const error = createError(
            "PARSE_FAILED",
            "searchSpoke",
            "Failed to parse JSON response",
            { cause: e, turn },
          );
          console.error(formatError(error));
          return emptyFindings(subject);
        }
      }

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });

        // --- Phase 1: collect all tool calls by type ---
        const toolBlocks = response.content.filter(
          (b) => b.type === "tool_use",
        ) as Anthropic.ToolUseBlock[];

        const searches = toolBlocks
          .filter((b) => b.name === "web_search")
          .map((b) => ({
            id: b.id,
            query: (b.input as Record<string, string>).query,
          }));

        const fetches = toolBlocks
          .filter((b) => b.name === "fetch_page")
          .slice(0, MAX_FETCHES) // limit concurrent fetches
          .map((b) => ({
            id: b.id,
            url: (b.input as Record<string, string>).url,
          }));

        const skippedFetches = toolBlocks
          .filter((b) => b.name === "fetch_page")
          .slice(MAX_FETCHES); // fetches beyond the limit

        // --- Phase 2: execute ---

        // searches sequentially (Claude rarely calls more than one)
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const s of searches) {
          const result = await webSearch(s.query, subject);
          toolResults.push({
            type: "tool_result",
            tool_use_id: s.id,
            content: result,
          });
        }

        // fetches in parallel — independent HTTP calls benefit from this
        const fetchResults = await Promise.all(
          fetches.map(async (f) => {
            emit("fetching_page");
            console.log(`  [searchSpoke → fetch_page] ${f.url}`);
            return { id: f.id, result: await fetchPage(f.url) };
          }),
        );
        fetchResults.forEach((f) =>
          toolResults.push({
            type: "tool_result",
            tool_use_id: f.id,
            content: f.result,
          }),
        );

        // skipped fetches beyond MAX_FETCHES
        skippedFetches.forEach((b) =>
          toolResults.push({
            type: "tool_result",
            tool_use_id: b.id,
            content: "fetch_page limit reached — skipping this URL",
          }),
        );

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
      return emptyFindings(subject);
    }
  }

  const error = createError(
    "MAX_TURNS_REACHED",
    "searchSpoke",
    `Search spoke reached max turns (${MAX_TURNS})`,
  );
  console.warn(formatError(error));
  return emptyFindings(subject);
}
