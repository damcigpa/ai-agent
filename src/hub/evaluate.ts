import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { ResearchFindings } from "../types.js";
import { AnalysisFindings } from "../spokes/analyzeSpoke.js";

export interface CoverageResult {
  complete: boolean;
  missing: string[];
}

export function evaluateCoverage(
  findings: ResearchFindings,
  userMessage: string,
): CoverageResult {
  const required: (keyof ResearchFindings)[] = ["context"];

  // only require date if the question asks for it
  if (/when|date|year|period|century|era/i.test(userMessage)) {
    required.push("date");
  }

  // only require author if the question asks for it
  if (/who|author|writer|wrote|poet/i.test(userMessage)) {
    required.push("author");
  }

  const missing = required.filter((f) => !findings[f]);
  return { complete: missing.length === 0, missing };
}

export async function needsSimplification(
  content: AnalysisFindings | ResearchFindings,
): Promise<boolean> {
  const text = "synopsis" in content ? content.synopsis : content.context;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 50,
    messages: [
      {
        role: "user",
        content: `Is this explanation too complex for a student to understand without further simplification?

Content: "${text}"

Reply with only YES or NO.`,
      },
    ],
  });

  const result = (response.content[0] as Anthropic.TextBlock).text
    .trim()
    .toUpperCase();
  return result === "YES";
}
