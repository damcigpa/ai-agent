// Eval: does the material layer behave well with REAL models?
// Verifies the material-answers spec (tasks 6.1–6.2 of add-material-library) and query rewriting (Follow-up questions are made self-contained): Material-first answers; Nothing is wrongly attributed to the material; Contradictions are shown, never silently resolved; No relevant material changes nothing.
//
// Unlike the unit tests (fake model answers), this calls Voyage and Claude for real, so it
// measures the models' decisions: is the right note found, is coverage judged correctly,
// are contradictions caught. Web search is NOT part of it (searchSpoke has its own eval):
// contradictions are checked against a fixed "trusted source" text, so every run gets the
// same input.
//
// Each case runs several times, because model answers vary; the result is a pass rate.
// Run from packages/agent:  npx tsx --env-file=.env evals/material.eval.ts
// Cost: roughly 25 Haiku calls and a few Voyage calls — a few cents.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createVoyageEmbedder, openChunkStore } from "../src/library/vectorStore.js";
import { syncLibrary } from "../src/library/sync.js";
import { compareWithWeb, judgeMaterial, type MaterialJudgement } from "../src/spokes/librarySpoke.js";
import { rewriteQuestion, type HistoryMessage } from "../src/spokes/rewriteSpoke.js";
import type { ResearchFindings } from "../src/types.js";

const RUNS = Number(process.env.EVAL_RUNS ?? 3);
const MODEL = process.env.EVAL_MODEL ?? "claude-haiku-4-5-20251001";

// --- The sample library: known content, one deliberate error ---

const NOTES: Record<string, string> = {
  "henry_viii.txt": `Henry VIII of England - class notes

Henry VIII was born on 28 June 1491 at Greenwich Palace. He was the second monarch of the Tudor dynasty. He became King of England in 1509, after the death of his father, Henry VII, and ruled until his death on 28 January 1547.

Henry VIII married six times. His wives were:
1. Catherine of Aragon (married 1509) - the marriage was annulled in 1533.
2. Anne Boleyn (married 1533) - she was executed in 1536.
3. Jane Seymour (married 1536) - she died in 1537, shortly after giving birth to their son Edward.
4. Anne of Cleves (married 1540) - the marriage was annulled after a few months.
5. Catherine Howard (married 1540) - she was executed in 1542.
6. Catherine Parr (married 1543) - she outlived Henry.

Henry wanted a male heir. Because Catherine of Aragon had not given him a son, he asked Pope Clement VII to annul their marriage. The Pope refused. Henry then broke with the Roman Catholic Church. The Act of Supremacy of 1534 declared the king the Supreme Head of the Church of England.

Three of Henry's children became monarchs: Edward VI (son of Jane Seymour), Mary I (daughter of Catherine of Aragon) and Elizabeth I (daughter of Anne Boleyn).`,
  // DELIBERATE ERROR: Elizabeth I became queen in 1558, not 1565.
  "elizabeth_notes.txt": `Elizabeth I - my notes

Elizabeth I was the daughter of Henry VIII and Anne Boleyn.
She became Queen of England in 1565.
She never married, so she was called the "Virgin Queen".`,
};

// --- Coverage cases (Material-first answers / Nothing is wrongly attributed to the material / No relevant material changes nothing) ---

type Coverage = MaterialJudgement["coverage"];

interface CoverageCase {
  name: string;
  question: string;
  acceptable: Coverage[]; // a judgement outside this list is a failure
  expectFile?: string; // retrieval: this note must be among the hits
  missingMentions?: string; // with partial coverage, "missing" should name this (case-insensitive)
}

const COVERAGE_CASES: CoverageCase[] = [
  {
    name: "full — the notes answer everything",
    question: "Who were the wives of Henry VIII and what happened to them?",
    acceptable: ["full"],
    expectFile: "henry_viii.txt",
  },
  {
    name: "partial — Act of Supremacy is in the notes, the monasteries are not",
    question: "What was the Act of Supremacy and what happened to the monasteries afterwards?",
    acceptable: ["partial"],
    expectFile: "henry_viii.txt",
    missingMentions: "monaster",
  },
  {
    name: "none — same person, topic not in the notes",
    question: "What was the Field of the Cloth of Gold?",
    acceptable: ["none"],
  },
  {
    name: "none — unrelated topic",
    question: "Mikor volt a mohácsi csata?",
    acceptable: ["none"],
  },
  {
    name: "cross-language — Hungarian question, English notes",
    question: "Hány felesége volt VIII. Henriknek?",
    acceptable: ["full", "partial"],
    expectFile: "henry_viii.txt",
  },
];

// --- Follow-up cases (Follow-up questions are made self-contained): rewrite → search → judge ---

const WIVES_HISTORY: HistoryMessage[] = [
  { role: "user", content: "Kik voltak VIII. Henrik feleségei?" },
  { role: "assistant", content: "VIII. Henrik hat felesége: Aragóniai Katalin, Boleyn Anna, Jane Seymour, Klevei Anna, Howard Katalin és Parr Katalin." },
];

interface FollowUpCase {
  name: string;
  history: HistoryMessage[];
  question: string;
  mustMatch?: RegExp; // the rewritten question must match (the missing subject was filled in)
  mustNotMatch?: RegExp; // ... and must not match (a topic switch must not drag the old topic along)
  acceptable: Coverage[];
  expectFile?: string;
}

const FOLLOWUP_CASES: FollowUpCase[] = [
  {
    name: "follow-up — \"És a harmadik?\" gets its subject back",
    history: WIVES_HISTORY,
    question: "És a harmadik?",
    // either the king or the person the "third" refers to fills in the missing subject
    mustMatch: /henrik|henry|seymour/i,
    acceptable: ["full", "partial"],
    expectFile: "henry_viii.txt",
  },
  {
    name: "follow-up — \"he\" is resolved (English)",
    history: [
      { role: "user", content: "Why did Henry VIII break with the Catholic Church?" },
      { role: "assistant", content: "Henry wanted a male heir and the Pope refused to annul his marriage to Catherine of Aragon." },
    ],
    question: "What did he do about it?",
    mustMatch: /henry/i,
    acceptable: ["full", "partial"],
    expectFile: "henry_viii.txt",
  },
  {
    name: "topic switch — the old topic is not dragged along",
    history: WIVES_HISTORY,
    question: "Mikor volt a mohácsi csata?",
    mustNotMatch: /henrik|henry|feleség/i,
    acceptable: ["none"],
  },
];

// --- Contradiction cases (Contradictions are shown, never silently resolved), against a fixed trusted source ---

interface ContradictionCase {
  name: string;
  question: string;
  web: ResearchFindings; // stands in for the web research result
  expectContradiction: boolean;
  expectVerdict?: "web" | "material" | "unclear";
}

const webSource = (context: string, keyFacts: string[]): ResearchFindings => ({
  author: "",
  work: "",
  date: "",
  context,
  confidence: "high",
  sources: ["https://www.britannica.com/"],
  keyFacts,
});

const CONTRADICTION_CASES: ContradictionCase[] = [
  {
    name: "deliberate error — wrong year in the notes is caught",
    question: "When did Elizabeth I become queen?",
    web: webSource("Elizabeth I became Queen of England on 17 November 1558 and reigned until 1603.", [
      "Elizabeth I became queen in 1558",
    ]),
    expectContradiction: true,
    expectVerdict: "web",
  },
  {
    name: "no false alarm — notes and source agree",
    question: "Who were the wives of Henry VIII and what happened to them?",
    web: webSource(
      "Henry VIII had six wives: Catherine of Aragon (annulled), Anne Boleyn (executed 1536), Jane Seymour (died 1537), Anne of Cleves (annulled), Catherine Howard (executed 1542) and Catherine Parr (survived him).",
      ["Anne Boleyn was executed in 1536", "Catherine Parr outlived Henry VIII"],
    ),
    expectContradiction: false,
  },
];

// --- Helpers ---

// The judge and compare steps log a line per call; keep the eval output readable.
async function quietly<T>(work: () => Promise<T>): Promise<T> {
  const log = console.log;
  console.log = () => {};
  try {
    return await work();
  } finally {
    console.log = log;
  }
}

const rate = (passed: number) => `${passed}/${RUNS}`;

// --- Result shape (read by evals/report.ts to compare models) ---

export interface CaseResult {
  name: string;
  group: "coverage" | "follow-up" | "contradiction";
  ok: number; // runs that passed
  runs: number;
}

export interface EvalSummary {
  passed: number; // cases that passed every run
  total: number;
  cases: CaseResult[];
}

// --- Main ---

// `model` defaults to EVAL_MODEL (or Haiku), so running this file alone works as before.
export async function main(model: string = MODEL): Promise<EvalSummary> {
  const root = mkdtempSync(join(tmpdir(), "material-eval-"));
  const paths = { inboxDir: join(root, "inbox"), libraryDir: join(root, "library") };
  mkdirSync(paths.libraryDir, { recursive: true });
  for (const [name, text] of Object.entries(NOTES)) writeFileSync(join(paths.libraryDir, name), text);

  let passedCases = 0;
  const total = COVERAGE_CASES.length + FOLLOWUP_CASES.length + CONTRADICTION_CASES.length;
  const cases: CaseResult[] = [];

  try {
    const store = openChunkStore(await createVoyageEmbedder(), join(root, "lancedb"));
    const report = await quietly(() =>
      syncLibrary({ store, paths, manifestPath: join(root, "manifest.json") }),
    );
    if (report.failed.length) throw new Error(`Indexing failed: ${JSON.stringify(report.failed)}`);

    console.log(`Material eval — ${total} cases × ${RUNS} runs, model ${model}\n`);

    for (const c of COVERAGE_CASES) {
      const hits = await store.search(c.question, 5); // retrieval is deterministic: once per case
      const failures: string[] = [];
      let ok = 0;

      if (c.expectFile && !hits.some((h) => h.file === c.expectFile)) {
        failures.push(`retrieval: ${c.expectFile} not among the hits`);
      }

      const seen: string[] = [];
      for (let run = 0; run < RUNS; run++) {
        const j = await quietly(() => judgeMaterial(c.question, hits, model));
        seen.push(j.coverage);
        const problems: string[] = [];
        if (!c.acceptable.includes(j.coverage)) problems.push(`coverage ${j.coverage}, expected ${c.acceptable.join("/")}`);
        if (c.missingMentions && j.coverage === "partial" && !j.missing.join(" ").toLowerCase().includes(c.missingMentions)) {
          problems.push(`"missing" does not mention "${c.missingMentions}": ${JSON.stringify(j.missing)}`);
        }
        if (problems.length === 0 && failures.length === 0) ok++;
        else failures.push(...problems);
      }

      if (ok === RUNS) passedCases++;
      cases.push({ name: c.name, group: "coverage", ok, runs: RUNS });
      console.log(`${ok === RUNS ? "✅" : "❌"} ${rate(ok)}  ${c.name}   [${seen.join(", ")}]`);
      [...new Set(failures)].forEach((f) => console.log(`        - ${f}`));
    }

    for (const c of FOLLOWUP_CASES) {
      const failures: string[] = [];
      let ok = 0;
      const seen: string[] = [];
      let lastRewrite = c.question;

      // For comparison only (no pass/fail): what would the judge say about the raw follow-up?
      // (Retrieval alone cannot show the difference here: the sample library is so small that
      // the top 5 contain every note either way, so the judge's verdict is what is compared.)
      const rawHits = await store.search(c.question, 5);
      const rawVerdict = (await quietly(() => judgeMaterial(c.question, rawHits, model))).coverage;

      for (let run = 0; run < RUNS; run++) {
        const rewritten = await quietly(() => rewriteQuestion(c.question, c.history, model));
        lastRewrite = rewritten;
        const hits = await store.search(rewritten, 5);
        const j = await quietly(() => judgeMaterial(rewritten, hits, model));
        seen.push(j.coverage);
        const problems: string[] = [];
        if (c.mustMatch && !c.mustMatch.test(rewritten)) problems.push(`rewritten question lacks the subject: "${rewritten}"`);
        if (c.mustNotMatch && c.mustNotMatch.test(rewritten)) problems.push(`old topic dragged along: "${rewritten}"`);
        if (c.expectFile && !hits.some((h) => h.file === c.expectFile)) problems.push(`retrieval: ${c.expectFile} not among the hits for "${rewritten}"`);
        if (!c.acceptable.includes(j.coverage)) problems.push(`coverage ${j.coverage}, expected ${c.acceptable.join("/")}`);
        if (problems.length === 0) ok++;
        else failures.push(...problems);
      }

      if (ok === RUNS) passedCases++;
      cases.push({ name: c.name, group: "follow-up", ok, runs: RUNS });
      console.log(`${ok === RUNS ? "✅" : "❌"} ${rate(ok)}  ${c.name}   [${seen.join(", ")}]`);
      console.log(`        "${c.question}" → "${lastRewrite}"`);
      console.log(`        without rewriting the judge says: ${rawVerdict}`);
      [...new Set(failures)].forEach((f) => console.log(`        - ${f}`));
    }

    for (const c of CONTRADICTION_CASES) {
      const hits = await store.search(c.question, 5);
      const judgement = await quietly(() => judgeMaterial(c.question, hits, model));
      const failures: string[] = [];
      let ok = 0;

      if (judgement.coverage === "none") {
        failures.push("the judge found no material facts, nothing to compare");
      } else {
        for (let run = 0; run < RUNS; run++) {
          const found = await quietly(() => compareWithWeb(c.question, judgement.materialFacts, c.web, model));
          const problems: string[] = [];
          if (c.expectContradiction && found.length === 0) problems.push("contradiction not found");
          if (!c.expectContradiction && found.length > 0) {
            problems.push(`false alarm: ${found.map((f) => `"${f.material}" vs "${f.web}"`).join("; ")}`);
          }
          if (c.expectVerdict && found.length > 0 && found[0].likelyCorrect !== c.expectVerdict) {
            problems.push(`verdict ${found[0].likelyCorrect}, expected ${c.expectVerdict}`);
          }
          if (problems.length === 0) ok++;
          else failures.push(...problems);
        }
      }

      if (ok === RUNS) passedCases++;
      cases.push({ name: c.name, group: "contradiction", ok, runs: RUNS });
      console.log(`${ok === RUNS ? "✅" : "❌"} ${rate(ok)}  ${c.name}`);
      [...new Set(failures)].forEach((f) => console.log(`        - ${f}`));
    }

    console.log(`\n--- ${passedCases}/${total} cases passed every run ---`);
    return { passed: passedCases, total, cases };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("material.eval.ts")) {
  main().catch((e) => {
    console.error(`💥 ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  });
}