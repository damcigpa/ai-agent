import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { ResearchFindings } from "../types.js";
import { AnalysisFindings } from "../spokes/analyzeSpoke.js";
import { trackUsage } from "../tokenTracker.js";

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

  if (!text) return false;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 50,
    messages: [
      {
        role: "user",
        content: `Does this text contain language that would be difficult for a student to understand without further explanation?

        Do not flag these as complex:
        allegória, epigramma, humanizmus, szimbolizmus, metafora, reneszánsz, barokk, realizmus

        Flag as YES only if it contains:
        - Latin phrases used without explanation
        - Legal or economic terminology (lex, hegemony, bourgeoisie)
        - Academic abstractions that assume university-level knowledge
        - Overly complex sentence structures a 14 year old would struggle with

Text: "${text}"

Reply with only YES or NO.`,
      },
    ],
  });

  trackUsage(response.usage);

  const result = (response.content[0] as Anthropic.TextBlock).text
    .trim()
    .toUpperCase();
  return result === "YES";
}
