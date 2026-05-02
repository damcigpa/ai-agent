import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { createError, formatError } from "../errors.js";
import { ResearchFindings } from "../types.js";
import { PROMPTS } from "../prompts.js";

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
): Promise<Explanation> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Using these research findings, answer the following question with a clear, thorough explanation.

Question: "${userQuestion}"

Research findings:
${JSON.stringify(findings, null, 2)}

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
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: PROMPTS.explain,
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
          return JSON.parse(text) as Explanation;
        } catch (e) {
          const error = createError(
            "PARSE_FAILED",
            "searchSpoke",
            "Failed to parse explanation JSON",
            { cause: e, turn },
          );
          console.error(formatError(error));
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
