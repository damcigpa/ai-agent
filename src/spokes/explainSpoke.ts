import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { createError, formatError } from "../errors.js";
import { ResearchFindings } from "../types.js";
import { PROMPTS } from "../prompts.js";
import { trackUsage } from "../tokenTracker.js";
import { StreamEvent } from "../progress.js";

const MAX_TURNS = 3;

export interface Explanation {
  summary: string;
  keyPoints: string[];
  significance: string;
  furtherReading: string[];
}

export async function explainSpoke(
  findings: ResearchFindings,
  userQuestion: string,
  onEvent: (event: StreamEvent) => void,
  analysisMode: boolean = false,
  model: string = "claude-haiku-4-5-20251001",
): Promise<Explanation> {
  const analysisInstructions = analysisMode
    ? `Provide a DEEP literary analysis including:
- Main themes and their significance
- Literary devices (metaphor, symbolism, allegory, imagery, etc.)
- Structure and form (verse type, rhyme scheme, meter if applicable)
- Historical and biographical context
- The author's message and intent
- Why this work matters in literary history`
    : `Provide a clear, accessible explanation appropriate for an eighth grade student preparing for a high school exam.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Using these research findings, answer the following question.

Question: "${userQuestion}"

Research findings:
${JSON.stringify(findings, null, 2)}

${analysisInstructions}

Respond ONLY with a JSON object matching this exact shape, no explanation, no markdown:
{
  "summary": "a clear direct answer to the question",
  "keyPoints": ["point1", "point2", "point3"],
  "significance": "why this matters historically or literarily",
  "furtherReading": ["topic1", "topic2"]
}`,
    },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    try {
      const stream = client.messages.stream({
        model,
        max_tokens: 2048,
        system: [
          {
            type: "text",
            text: PROMPTS.explain,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages,
      });

      // Post-tool hook — track usage
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
          const explanation = JSON.parse(text) as Explanation;
          onEvent({ type: "chunk", data: explanation.summary });
          onEvent({ type: "done", data: explanation.summary });
          return explanation;
        } catch (e) {
          const error = createError(
            "PARSE_FAILED",
            "searchSpoke",
            "Failed to parse explanation JSON",
            { cause: e, turn },
          );
          console.error(formatError(error));
          onEvent({ type: "error", data: "Failed to parse explanation" });
          return {
            summary: findings.context || "No explanation available",
            keyPoints: findings.keyFacts ?? [],
            significance: "",
            furtherReading: [],
          };
        }
      }
    } catch (e) {
      const error = createError(
        "API_FAILED",
        "searchSpoke",
        "API call failed in explain spoke",
        { cause: e, turn },
      );
      console.error(formatError(error));
      onEvent({ type: "error", data: (e as Error).message });
    }
  }

  const error = createError(
    "MAX_TURNS_REACHED",
    "searchSpoke",
    `Explain spoke reached max turns (${MAX_TURNS})`,
  );
  console.warn(formatError(error));
  return {
    summary: findings.context || "Could not generate explanation",
    keyPoints: findings.keyFacts ?? [],
    significance: "",
    furtherReading: [],
  };
}
