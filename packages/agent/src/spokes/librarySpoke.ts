// Material judge: compares a question with chunks from the student's own material.
// Implements specs/material-library/material-library.plan.md — TD-7 step 2
// (serves AC-13, AC-15, AC-17).
//
// It decides how much of the question the material covers and extracts the facts
// the material really states, each with the file it came from. Never throws:
// any failure counts as "the material does not help" and the normal flow continues.

import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { trackUsage } from "../tokenTracker.js";
import type { SearchHit } from "../library/vectorStore.js";

export interface MaterialFact {
  fact: string;
  file: string;
}

export interface MaterialJudgement {
  coverage: "full" | "partial" | "none";
  materialFacts: MaterialFact[];
  missing: string[]; // what the question asks that the material does not answer
}

const NONE: MaterialJudgement = { coverage: "none", materialFacts: [], missing: [] };

const SYSTEM_PROMPT = `You compare a student's question with excerpts from the student's OWN study notes (handwritten pages and typed notes).
Rules:
- Use ONLY the excerpts. Never add facts from your own knowledge, even if you know the answer.
- A fact must be stated in the excerpts (or follow directly from them). Write it as a short sentence in the language of the notes, and name the file it came from.
- Passages marked [olvashatatlan] are unreadable: never turn them into facts.
- coverage "full": the excerpts answer the whole question. "partial": they answer only part of it. "none": they do not answer it (for example they are about another topic).
- "missing": what the question asks that the excerpts do not answer. Empty when coverage is "full".
- Be strict: text that only looks related but does not answer the question means "none".`;

const tools: Anthropic.Tool[] = [
  {
    name: "judge_material",
    description: "Submit how well the student's notes cover the question",
    input_schema: {
      type: "object",
      properties: {
        coverage: { type: "string", enum: ["full", "partial", "none"] },
        materialFacts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fact: { type: "string" },
              file: { type: "string", description: "The file name exactly as written after \"File:\"" },
            },
            required: ["fact", "file"],
          },
        },
        missing: { type: "array", items: { type: "string" } },
      },
      required: ["coverage", "materialFacts", "missing"],
    },
  },
];

export async function judgeMaterial(
  question: string,
  hits: SearchHit[],
  model: string = "claude-haiku-4-5-20251001",
  signal?: AbortSignal,
): Promise<MaterialJudgement> {
  if (hits.length === 0) return NONE; // empty library or nothing found: no call needed (AC-17)

  const excerpts = hits
    .map((hit) => `File: ${hit.file}\nPart: ${hit.chunkIndex + 1}\n${hit.text}`)
    .join("\n---\n");

  try {
    const response = await client.messages.create(
      {
        model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools,
        tool_choice: { type: "tool", name: "judge_material" },
        messages: [
          {
            role: "user",
            content: `Question: "${question}"\n\nExcerpts from the student's notes:\n${excerpts}`,
          },
        ],
      },
      { signal },
    );

    trackUsage(response.usage);

    const toolUse = response.content.find((b) => b.type === "tool_use") as
      | Anthropic.ToolUseBlock
      | undefined;
    if (!toolUse) return NONE;

    const input = toolUse.input as {
      coverage?: unknown;
      materialFacts?: unknown;
      missing?: unknown;
    };

    // AC-15: a fact is kept only if it names a file that was really retrieved.
    // The model sometimes copies more than the name ("1000003153.jpg, part 3"), so the
    // retrieved name is looked for inside what it returned. Longest names first, so
    // "aa.jpg" is not mistaken for "a.jpg".
    const retrievedFiles = [...new Set(hits.map((hit) => hit.file))].sort((a, b) => b.length - a.length);
    const materialFacts: MaterialFact[] = [];
    let ignored = 0;
    for (const f of Array.isArray(input.materialFacts) ? input.materialFacts : []) {
      const file =
        f && typeof f.file === "string" ? retrievedFiles.find((name) => f.file.includes(name)) : undefined;
      if (!file || typeof f.fact !== "string" || f.fact.trim() === "") {
        ignored++;
        continue;
      }
      materialFacts.push({ fact: f.fact.trim(), file });
    }

    const coverage = input.coverage === "full" || input.coverage === "partial" ? input.coverage : "none";
    console.log(
      `  📒 Material check: ${coverage}, ${materialFacts.length} fact(s)` +
        (ignored ? `, ${ignored} ignored (no known source file)` : ""),
    );
    if (coverage === "none" || materialFacts.length === 0) return NONE;

    const missing =
      coverage === "full"
        ? []
        : (Array.isArray(input.missing) ? input.missing : [])
            .filter((m): m is string => typeof m === "string")
            .map((m) => m.trim())
            .filter(Boolean);

    return { coverage, materialFacts, missing };
  } catch (e) {
    console.warn(`  ⚠️  Material check failed, continuing without it: ${e instanceof Error ? e.message : "unknown error"}`);
    return NONE;
  }
}