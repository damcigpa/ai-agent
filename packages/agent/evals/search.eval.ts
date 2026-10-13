// Eval: does the web search find the RIGHT answer, and can its confidence be trusted?
//
// The existing src/searchSpoke.eval.ts checks behaviour (no endless loop, no invented author).
// This one checks CORRECTNESS against known answers, and the question underneath it for a study
// tool: when the search says confidence "high", is it right? A confident wrong answer is the worst
// outcome, because the student has no reason to doubt it.
//
// It runs the same search step the hub runs (executeSearchStep: search, escalation, coverage
// retries), for questions whose answer is known and easy to check:
//   correct         every expected pattern is found in the findings (author, work, date, context, keyFacts)
//                   and no forbidden pattern is
//   has link        at least one source is a real http(s) link (the hub drops findings without one)
//   confidence      reported per outcome: "high" and wrong = confident wrong
// Two questions have a FALSE PREMISE (the work or the prize does not exist). They are not graded
// automatically: the printed findings are meant to be read. What is counted is only whether the
// search claims "high" confidence for them.
//
// Checking is by regular expression on the model's findings, so it is a coarse check: a correct
// answer phrased unusually can count as wrong. Run with EVAL_VERBOSE=1 to read the findings of
// every miss before trusting a number.
//
// Run from packages/agent:  npx tsx --env-file=.env evals/search.eval.ts
// Real Anthropic and Tavily calls. About 1-2 cents per question and run on Haiku (a question needs
// 2-5 model calls). EVAL_RUNS (default 3), EVAL_MODEL=haiku|sonnet (default haiku),
// EVAL_CASE=<part of a question>, EVAL_VERBOSE=1.

import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { executeSearchStep } from "../src/hub/execute.js";
import { estimateCost, resetSession } from "../src/tokenTracker.js";
import type { ResearchFindings, Subject } from "../src/types.js";

const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-6";
const MODEL = process.env.EVAL_MODEL === "sonnet" ? SONNET : HAIKU;
const RUNS = Number(process.env.EVAL_RUNS ?? 3);
const VERBOSE = process.env.EVAL_VERBOSE === "1";
const ONLY = process.env.EVAL_CASE?.toLowerCase();

interface Case {
  question: string;
  subject: Subject;
  expect: RegExp[]; // all must match
  forbid?: RegExp[]; // none may match
  falsePremise?: boolean; // not graded: counted by confidence only
}

const CASES: Case[] = [
  { question: "Melyik évben volt a mohácsi csata?", subject: "hungarian_history", expect: [/1526/], forbid: [/1514/] },
  { question: "Ki adta ki az Aranybullát, és melyik évben?", subject: "hungarian_history", expect: [/II\.?\s*András|Andrew II|András/, /1222/] },
  { question: "Hol és mikor halt meg Hunyadi János?", subject: "hungarian_history", expect: [/Nándorfehérvár|Belgrád|Belgrade/i, /1456/] },
  { question: "Mikor kötötték meg a kiegyezést?", subject: "hungarian_history", expect: [/1867/] },
  { question: "Mikor tört ki a francia forradalom?", subject: "history", expect: [/1789/] },
  { question: "Mikor ért véget a második világháború Európában?", subject: "history", expect: [/1945/, /május|May/i] },
  { question: "Ki írta a Toldi című elbeszélő költeményt?", subject: "hungarian_literature", expect: [/Arany\s+János/] },
  { question: "Melyik évben született Petőfi Sándor?", subject: "hungarian_literature", expect: [/1823/] },
  { question: "Ki írta Az ember tragédiáját?", subject: "hungarian_literature", expect: [/Madách/] },
  { question: "Ki írta az Egri csillagokat?", subject: "hungarian_literature", expect: [/Gárdonyi/] },
  { question: "Who wrote Animal Farm and when was it published?", subject: "literature", expect: [/Orwell/, /1945/] },
  { question: "Who wrote Brave New World?", subject: "literature", expect: [/Huxley/], forbid: [/Orwell\s+wrote/i] },
  {
    question: "Melyik évben írta Petőfi Sándor a Holdfény-szonáta című regényét?",
    subject: "hungarian_literature",
    expect: [],
    falsePremise: true,
  },
  {
    question: "Melyik évben nyerte el Arany János az irodalmi Nobel-díjat?",
    subject: "hungarian_literature",
    expect: [],
    falsePremise: true,
  },
];

const hasLink = (f: ResearchFindings) => f.sources.some((s) => /^https?:\/\//i.test(s));

function haystack(f: ResearchFindings): string {
  return [f.author, f.work, f.date, f.context, ...(f.keyFacts ?? [])].join(" \n ");
}

function isCorrect(c: Case, f: ResearchFindings): boolean {
  const text = haystack(f);
  return c.expect.every((re) => re.test(text)) && !(c.forbid ?? []).some((re) => re.test(text));
}

interface Outcome {
  correct: boolean;
  link: boolean;
  confidence: "high" | "medium" | "low";
  cost: number;
  findings: ResearchFindings | null;
  error?: string;
}

async function runOnce(c: Case): Promise<Outcome> {
  resetSession();
  try {
    // Same step the hub runs. A fresh temp folder keeps the scratchpad and the budget file away from the real ones.
    const previous = process.cwd();
    process.chdir(mkdtempSync(join(tmpdir(), "search-eval-")));
    let findings: ResearchFindings | null;
    try {
      ({ updatedFindings: findings } = await executeSearchStep(c.question, c.subject, null, null, null, () => {}, MODEL));
    } finally {
      process.chdir(previous);
    }
    if (!findings) return { correct: false, link: false, confidence: "low", cost: estimateCost(), findings: null, error: "no findings" };
    return { correct: isCorrect(c, findings), link: hasLink(findings), confidence: findings.confidence, cost: estimateCost(), findings };
  } catch (e) {
    return { correct: false, link: false, confidence: "low", cost: estimateCost(), findings: null, error: e instanceof Error ? e.message : String(e) };
  }
}

const pct = (n: number, d: number) => (d === 0 ? "-" : `${n}/${d}`);

async function main() {
  const cases = CASES.filter((c) => !ONLY || c.question.toLowerCase().includes(ONLY));
  console.log(`\nSearch eval — ${MODEL}, ${RUNS} run(s) per question, ${cases.length} question(s)\n`);

  const graded: { c: Case; o: Outcome }[] = [];
  const falsePremise: { c: Case; o: Outcome }[] = [];
  let totalCost = 0;

  console.log(`${"question".padEnd(64)} ${"correct".padStart(8)} ${"link".padStart(6)}  confidence (high/medium/low)`);
  console.log("-".repeat(104));

  for (const c of cases) {
    const outcomes: Outcome[] = [];
    for (let i = 0; i < RUNS; i++) {
      const o = await runOnce(c);
      outcomes.push(o);
      totalCost += o.cost;
      (c.falsePremise ? falsePremise : graded).push({ c, o });
      if (VERBOSE && (c.falsePremise || !o.correct)) {
        console.log(`\n  [${c.question}] run ${i + 1}: ${o.error ? "ERROR " + o.error : ""}`);
        if (o.findings) {
          console.log(`    confidence=${o.findings.confidence} author=${JSON.stringify(o.findings.author)} work=${JSON.stringify(o.findings.work)} date=${JSON.stringify(o.findings.date)}`);
          console.log(`    context=${JSON.stringify(o.findings.context.slice(0, 400))}`);
          console.log(`    keyFacts=${JSON.stringify(o.findings.keyFacts ?? [])}`);
          console.log(`    sources=${JSON.stringify(o.findings.sources)}\n`);
        }
      }
    }
    const n = (conf: string) => outcomes.filter((o) => o.confidence === conf).length;
    const correct = c.falsePremise ? "n/a" : pct(outcomes.filter((o) => o.correct).length, RUNS);
    console.log(
      `${(c.falsePremise ? "(false premise) " : "") + c.question}`.slice(0, 64).padEnd(64) +
        ` ${correct.padStart(8)} ${pct(outcomes.filter((o) => o.link).length, RUNS).padStart(6)}  ${n("high")}/${n("medium")}/${n("low")}`,
    );
  }

  // --- Summary: accuracy, and accuracy per reported confidence ---
  const right = graded.filter((x) => x.o.correct).length;
  console.log(`\nAccuracy: ${pct(right, graded.length)} answers matched the expected facts`);

  console.log(`\nIs the confidence trustworthy? (graded questions only)`);
  console.log(`${"reported".padEnd(10)} ${"answers".padStart(8)} ${"correct".padStart(8)} ${"wrong".padStart(7)}`);
  for (const conf of ["high", "medium", "low"] as const) {
    const g = graded.filter((x) => x.o.confidence === conf);
    const ok = g.filter((x) => x.o.correct).length;
    console.log(`${conf.padEnd(10)} ${String(g.length).padStart(8)} ${String(ok).padStart(8)} ${String(g.length - ok).padStart(7)}`);
  }
  const confidentWrong = graded.filter((x) => x.o.confidence === "high" && !x.o.correct);
  console.log(`\nConfident wrong ("high" and wrong): ${confidentWrong.length} of ${graded.length}`);
  for (const x of confidentWrong) console.log(`  - ${x.c.question}`);

  if (falsePremise.length) {
    const high = falsePremise.filter((x) => x.o.confidence === "high").length;
    console.log(`\nFalse-premise questions: "high" confidence in ${high} of ${falsePremise.length} runs (run with EVAL_VERBOSE=1 and read what it claims)`);
  }

  console.log(`\nCost of this run: $${totalCost.toFixed(3)} (Anthropic only; Tavily not counted)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});