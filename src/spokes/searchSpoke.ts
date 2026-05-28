import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { webSearch } from "../tools/webSearch.js";
import { fetchPage } from "../tools/fetchPage.js";
import { createError, formatError } from "../errors.js";
import { LiteratureSubject, ResearchFindings, Subject } from "../types.js";
import { PROMPTS } from "../prompts.js";
import { trackUsage } from "../tokenTracker.js";
import { emit } from "../progress.js";

const MAX_TURNS = 4;
const MAX_FETCHES = 2;

const failedUrls = new Set<string>();

const LITERATURE_SUBJECTS: LiteratureSubject[] = [
  "literature",
  "literary_analysis",
  "hungarian_literature",
];

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

function validateSchema(data: unknown): data is ResearchFindings {
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return false;

  const d = data as Record<string, unknown>;

  if (typeof d.author !== "string") return false;
  if (typeof d.work !== "string") return false;
  if (typeof d.date !== "string") return false;
  if (typeof d.context !== "string") return false;
  if (!["high", "medium", "low"].includes(d.confidence as string)) return false;
  if (!Array.isArray(d.sources)) return false;
  if (!d.sources.every((s) => typeof s === "string")) return false;
  if (d.keyFacts !== undefined) {
    if (!Array.isArray(d.keyFacts)) return false;
    if (!d.keyFacts.every((f) => typeof f === "string")) return false;
  }

  return true;
}

function validateFindings(findings: ResearchFindings): string | null {
  if (!LITERATURE_SUBJECTS.includes(findings.subject as LiteratureSubject)) {
    return null;
  }

  // only escalate if there is no useful information at all
  // terminology questions won't have author or work but will have context
  if (!findings.author && !findings.work && !findings.context) {
    return "no useful information found for literature question";
  }

  return null;
}

async function routeByConfidence(
  findings: ResearchFindings,
): Promise<ResearchFindings> {
  switch (findings.confidence) {
    case "high":
    case "medium":
      console.log(
        `  ✅ Confidence ${findings.confidence} — skipping verification`,
      );
      return findings;

    case "low":
      console.log("  🔺 Confidence low — escalating to hub");
      return {
        ...findings,
        escalate: true,
        escalateReason: "Confidence too low, needs different search strategy",
      };
  }
}

export async function searchSpoke(
  task: string,
  subject: Subject = "general",
  model: string = "claude-haiku-4-5-20251001",
): Promise<ResearchFindings> {
  const baseContent = `${task}

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

If search snippets are too short, use fetch_page on the single most promising URL only before responding.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: baseContent },
  ];

  let fetchCount = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const isLastTurn = turn === MAX_TURNS - 1;

    try {
      const stream = client.messages.stream({
        model,
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: PROMPTS.search,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools,
        tool_choice: isLastTurn
          ? { type: "none" }
          : turn === 0
            ? { type: "tool", name: "web_search" }
            : { type: "auto" },
        messages: isLastTurn
          ? [
              ...messages,
              {
                role: "user" as const,
                content:
                  "⚠️  IMPORTANT: You MUST respond with valid JSON now. No more tool calls. Use what you have found so far.",
              },
            ]
          : messages,
      });

      stream.on("message", (msg) => {
        trackUsage(msg.usage);
      });

      const response = await stream.finalMessage();

      if (response.stop_reason === "end_turn") {
        const text = response.content
          .filter((b) => b.type === "text")
          .map((b) => (b as Anthropic.TextBlock).text)
          .join("")
          .trim()
          .replace(/```json|```/g, "")
          .trim();

        try {
          const parsed = JSON.parse(text);

          if (!validateSchema(parsed)) {
            const error = createError(
              "PARSE_FAILED",
              "searchSpoke",
              "Claude returned invalid JSON schema",
              { turn },
            );
            console.error(formatError(error));
            return emptyFindings(subject);
          }

          const findings = parsed as ResearchFindings;

          const missingRequired = validateFindings(findings);
          if (missingRequired) {
            console.log(
              `  ⚠️  Missing required fields: ${missingRequired} — escalating`,
            );
            return {
              ...findings,
              escalate: true,
              escalateReason: `Missing required fields: ${missingRequired}`,
            };
          }

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

        const toolBlocks = response.content.filter(
          (b) => b.type === "tool_use",
        ) as Anthropic.ToolUseBlock[];

        const searches = toolBlocks
          .filter((b) => b.name === "web_search")
          .map((b) => ({
            id: b.id,
            query: (b.input as Record<string, string>).query,
          }));

        const allFetchBlocks = toolBlocks.filter(
          (b) => b.name === "fetch_page",
        );

        const fetches = allFetchBlocks
          .slice(0, MAX_FETCHES - fetchCount)
          .map((b) => {
            fetchCount++;
            return {
              id: b.id,
              url: (b.input as Record<string, string>).url,
            };
          });

        const skippedFetches = allFetchBlocks.slice(fetches.length);

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        // searches in parallel
        const searchResults = await Promise.all(
          searches.map(async (s) => {
            emit("searching");
            return { id: s.id, result: await webSearch(s.query, subject) };
          }),
        );
        searchResults.forEach((s) =>
          toolResults.push({
            type: "tool_result",
            tool_use_id: s.id,
            content: s.result,
          }),
        );

        // fetches in parallel
        const fetchResults = await Promise.all(
          fetches
            .filter((f) => {
              if (failedUrls.has(f.url)) {
                console.log(`  ⏭️  Skipping previously failed URL: ${f.url}`);
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: f.id,
                  content: "Skipped: this URL already timed out previously",
                });
                return false;
              }
              return true;
            })
            .map(async (f) => {
              emit("fetching_page");
              console.log(`  [searchSpoke → fetch_page] ${f.url}`);
              const result = await fetchPage(f.url);
              if (
                result.includes("timed out") ||
                result.includes("Failed to fetch")
              ) {
                failedUrls.add(f.url);
              }
              return { id: f.id, result };
            }),
        );
        fetchResults.forEach((f) =>
          toolResults.push({
            type: "tool_result",
            tool_use_id: f.id,
            content: f.result,
          }),
        );

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
