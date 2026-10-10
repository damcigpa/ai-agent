// Model comparison: runs the material eval with each model and compares accuracy,
// stability, cost and time on the SAME cases. Answers "why Haiku by default?" with numbers.
//
// Accuracy  — share of runs that passed, per case group (coverage, follow-up, contradiction)
// Stability — a case that passes in some runs but not all is "unstable": the model's answer
//             varies between identical calls, so one passing run proves nothing
// Cost      — from the real token counts (tokenTracker), priced per model
// Time      — wall-clock for the whole eval; includes the Voyage searches, which are the same
//             for every model
//
// Run from packages/agent:  npx tsx --env-file=.env evals/report.ts
// Runs per case: EVAL_RUNS (default 3). Measured cost on 2026-10-10 with the first 10 cases and
// 3 runs: about $0.09 for Haiku and $0.26 for Sonnet, $0.35 in total (about 44 calls per model).
// With the 16 cases now in the eval (about 64 calls per model) expect about $0.50.
// EVAL_RUNS=1 cuts it to a third. Commit the report in evals/results/ instead of re-running it
// for a demo. Each run writes a new file (date and time in the name), so older reports are kept.
// The tokens also count toward the daily budget in data/budget.json.
// A Markdown report is written to evals/results/.

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { main as runMaterialEval, type EvalSummary } from "./material.eval.js";
import { getUsage, resetSession, type TokenUsage } from "../src/tokenTracker.js";

// Prices in USD per million tokens, from https://platform.claude.com/docs/en/about-claude/pricing
// (checked 2026-10-09). Cache write = 5-minute cache.
const MODELS = [
  {
    id: "claude-haiku-4-5-20251001",
    name: "Haiku 4.5",
    price: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  },
  {
    id: "claude-sonnet-4-6",
    name: "Sonnet 4.6",
    price: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  },
];

type Price = (typeof MODELS)[number]["price"];

interface ModelResult {
  name: string;
  summary: EvalSummary;
  usage: TokenUsage;
  cost: number;
  seconds: number;
}

function costOf(u: TokenUsage, p: Price): number {
  return (
    (u.inputTokens * p.input +
      u.outputTokens * p.output +
      u.cacheWriteTokens * p.cacheWrite +
      u.cacheReadTokens * p.cacheRead) /
    1_000_000
  );
}

// Share of all runs that passed (a case with 2/3 counts as 2 passes out of 3).
function runPassRate(cases: EvalSummary["cases"]): number {
  const runs = cases.reduce((s, c) => s + c.runs, 0);
  return runs ? cases.reduce((s, c) => s + c.ok, 0) / runs : 0;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const usd = (x: number) => `$${x.toFixed(4)}`;

function buildReport(results: ModelResult[]): string {
  const lines: string[] = [];
  const runs = results[0].summary.cases[0]?.runs ?? 0;

  lines.push("# Model comparison — material eval");
  lines.push("");
  lines.push(`${new Date().toISOString().slice(0, 10)} · ${results[0].summary.total} cases × ${runs} runs per model`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push("| Model | Cases passing every run | Runs passed | Unstable cases | Cost | Time |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of results) {
    const unstable = r.summary.cases.filter((c) => c.ok > 0 && c.ok < c.runs).length;
    lines.push(
      `| ${r.name} | ${r.summary.passed}/${r.summary.total} | ${pct(runPassRate(r.summary.cases))} | ${unstable} | ${usd(r.cost)} | ${r.seconds.toFixed(0)} s |`,
    );
  }
  lines.push("");

  lines.push("## Runs passed, by case group");
  lines.push("");
  lines.push(`| Group | ${results.map((r) => r.name).join(" | ")} |`);
  lines.push(`|---|${results.map(() => "---").join("|")}|`);
  for (const group of ["coverage", "follow-up", "contradiction"] as const) {
    const cells = results.map((r) => pct(runPassRate(r.summary.cases.filter((c) => c.group === group))));
    lines.push(`| ${group} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  lines.push("## Every case");
  lines.push("");
  lines.push(`| Case | ${results.map((r) => r.name).join(" | ")} |`);
  lines.push(`|---|${results.map(() => "---").join("|")}|`);
  for (const [i, c] of results[0].summary.cases.entries()) {
    const cells = results.map((r) => {
      const x = r.summary.cases[i];
      return `${x.ok === x.runs ? "✅" : "❌"} ${x.ok}/${x.runs}`;
    });
    lines.push(`| ${c.name} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  lines.push("## Tokens");
  lines.push("");
  lines.push("| Model | Input | Output | Cache write | Cache read |");
  lines.push("|---|---|---|---|---|");
  for (const r of results) {
    const u = r.usage;
    lines.push(`| ${r.name} | ${u.inputTokens} | ${u.outputTokens} | ${u.cacheWriteTokens} | ${u.cacheReadTokens} |`);
  }
  lines.push("");

  return lines.join("\n");
}

async function main(): Promise<void> {
  const results: ModelResult[] = [];

  for (const model of MODELS) {
    console.log(`\n===== ${model.name} =====\n`);
    resetSession(); // count only this model's tokens
    const start = Date.now();
    const summary = await runMaterialEval(model.id);
    const seconds = (Date.now() - start) / 1000;
    const usage = getUsage();
    results.push({ name: model.name, summary, usage, cost: costOf(usage, model.price), seconds });
  }

  const report = buildReport(results);
  console.log(`\n${report}`);

  const dir = join(process.cwd(), "evals", "results");
  mkdirSync(dir, { recursive: true });
  // Date AND local time in the name, so a second run on the same day never overwrites the first.
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}`;
  const file = join(dir, `models-${stamp}.md`);
  writeFileSync(file, report);
  console.log(`Report written to ${file}`);
}

main().catch((e) => {
  console.error(`💥 ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
});