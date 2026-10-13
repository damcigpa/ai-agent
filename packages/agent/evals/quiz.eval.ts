// Eval for the topic quiz (/quiz <topic>): what does the quiz do with a WRONG note?
//
// The quiz is built from the student's notes, so the notes are the base: the quiz must mark the
// NOTE's answer correct. If the model knows better, it may flag it ("disagreement"), and the student
// is told AFTER answering. Each case has a wrong note and a control note that differs in one fact.
//
// Per quiz, on the question about that fact:
//   follows    marks the note's answer correct (intended)
//   corrected  silently marks the true answer instead (the quiz and the note disagree, nobody says so)
//   FLAGS      follows the note AND flags the true answer (intended)
//   silent     follows the note but says nothing
// And on the whole quiz:
//   other flags   flags on the OTHER questions of the wrong-note quiz. Their facts are correct, so these
//                 are false alarms unless the question builds on the wrong fact: read them in the log.
//   false alarm   any flag at all on the control quiz (every fact in it is correct)
//
// Cases:
//   history     Elizabeth I became queen in 1565 (true: 1558). Famous fact, English note.
//   english-lit "All animals are equal, but some animals are more equal than others." is attributed to Huxley,
//               Brave New World (true: Orwell, Animal Farm). Same shape as `literature`, English note.
//   literature  "Nincs a teremtésben vesztes, csak én! ..." is attributed to Madách, Az ember tragédiája
//               (true: Katona József, Bánk bán, act V, Bánk). A common mix-up, Hungarian note.
//
// Same pipeline as /quiz <topic> in agent.ts: the material judge turns the note into facts, quizSpoke
// writes the questions with notesAreTheBase. The notes are given directly: no Voyage, no web.
//
// KNOWN LIMITATIONS (measured 2026-10-13; the `literature` and `english-lit` cases exist to show them):
//   1. The material judge on Haiku drops a note fact that contradicts what it knows. `english-lit`, wrong note:
//      the fact "the line is from Brave New World" is missing from the judge's facts in 10/10 calls, so no
//      question about it is written and no disagreement can be shown (judge.eval.ts). Same effect as the
//      `swapped name` case in material.eval.ts. The Sonnet judge keeps such facts but see 2.
//   2. A note with a quotation breaks the structured output. The Sonnet judge returns its facts as TEXT with an
//      unescaped quote (JSON error at the closing quote) in every call, in Hungarian and in English: zero facts, no quiz.
//   3. Prompt rules did not fix this, they moved it. An instruction to keep wrong facts fixes 1 but made the Haiku
//      judge's Hungarian answer unreadable (5/5); a quotation-mark rule left the Haiku judge readable in English but broke it
//      in Hungarian (`„…"`). No rule is in the prompt. Not tried: have the judge return the note's own sentence
//      verbatim (or its position) and let the code check it, instead of rewording the fact.
//   4. The question writer failed to return a valid quiz (PARSE_FAILED) in 5 of 12 Hungarian-literature quizzes
//      (Sonnet 4 of 6, Haiku 1 of 6). Cause not looked into: the payload is not logged.
//   5. The disagreement flag is not shown for Hungarian literature: no flag in the 4 wrong-note quizzes that were written (Haiku 3, Sonnet 1).
//      History (Elizabeth I): flag 3/3 with Sonnet. Samples are small (1 fact, 3 runs per configuration).
//   6. One likely reason for 5 (knowledge.eval.ts, no notes, 5 calls per quote and model): the models do not know the
//      author of the Hungarian quote. "Nincs a teremtésben vesztes…" (Katona József, Bánk bán): 0/5 correct with Haiku
//      and with Sonnet (Petőfi, Madách, Vörösmarty, Ady; hedged in 1 of 10 answers). Two other Hungarian quotes: 0/5
//      and 0/5 (Küzdj és bízva bízzál!), Szózat 1/5 Haiku and 5/5 Sonnet. The English quote: 5/5 with both. So for
//      Hungarian literature the model's general knowledge cannot anchor a disagreement flag, and it can be confidently
//      wrong: another reason the notes are the base. Small sample, four quotes: an observation, not a rate.
//
// Run from packages/agent:  npx tsx --env-file=.env evals/quiz.eval.ts
// Env:  EVAL_RUNS (default 3), EVAL_CASE=history|literature|english-lit (default: all).
//       EVAL_VERBOSE=1 shows the judge's own log lines.
// Cost: about 7-8 cents per case and run for all three configurations (measured: $0.077 for one case,
//       one run); the exact cost is printed at the end.

import { judgeMaterial } from "../src/spokes/librarySpoke.js";
import { quizSpoke, type Quiz, type QuizQuestion } from "../src/spokes/quizSpoke.js";
import { getUsage, resetSession } from "../src/tokenTracker.js";
import type { SearchHit } from "../src/library/vectorStore.js";
import type { ResearchFindings } from "../src/types.js";

const RUNS = Number(process.env.EVAL_RUNS ?? 3);
const ONLY = process.env.EVAL_CASE;
const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-6";

// $ per million tokens (input, output). Cache tokens are not used in these calls.
const PRICE: Record<string, { input: number; output: number }> = {
  [HAIKU]: { input: 1, output: 5 },
  [SONNET]: { input: 3, output: 15 },
};

// --- Cases ---

export interface Case {
  name: string;
  topic: string;
  file: string;
  wrongNote: string;
  rightNote: string;
  isFactQuestion: (q: QuizQuestion) => boolean; // the question about the fact that differs
  noteValue: RegExp; // the wrong note's answer
  trueValue: RegExp; // the true answer
}

const ELIZABETH_WRONG = `Elizabeth I - my notes

Elizabeth I was the daughter of Henry VIII and Anne Boleyn.
She became Queen of England in 1565.
She never married, so she was called the "Virgin Queen".`;

const QUOTE = "„Nincs a teremtésben vesztes, csak én! Nincs árva más több, csak az én gyermekem!”";
const BANK_RIGHT = `Szállóigék – saját jegyzet

Az ember tragédiája szerzője Madách Imre.
A Bánk bán szerzője Katona József.
A ${QUOTE} sorokat Katona József írta, a Bánk bánban hangzanak el: Bánk mondja, amikor Tiborc behozza Melinda holttestét.`;
const BANK_WRONG = BANK_RIGHT.replace(
  "sorokat Katona József írta, a Bánk bánban hangzanak el: Bánk mondja, amikor Tiborc behozza Melinda holttestét.",
  "sorokat Madách Imre írta, Az ember tragédiájában hangzanak el.",
);

const ANIMAL_QUOTE = '"All animals are equal, but some animals are more equal than others."';
const FARM_RIGHT = `Quotes - my notes

Animal Farm was written by George Orwell.
Brave New World was written by Aldous Huxley.
The line ${ANIMAL_QUOTE} comes from Animal Farm by George Orwell: it is the last commandment the pigs paint on the barn wall.`;
const FARM_WRONG = FARM_RIGHT.replace(
  "comes from Animal Farm by George Orwell: it is the last commandment the pigs paint on the barn wall.",
  "comes from Brave New World by Aldous Huxley.",
);

export const CASES: Case[] = [
  {
    name: "history",
    topic: "Elizabeth I",
    file: "jegyzet.txt", // real-life names: generic notes and screenshots
    wrongNote: ELIZABETH_WRONG,
    rightNote: ELIZABETH_WRONG.replace("1565", "1558"),
    isFactQuestion: (q) => Object.values(q.options).some((o) => /1565|1558/.test(o)),
    noteValue: /1565/,
    trueValue: /1558/,
  },
  {
    name: "literature",
    // A topic a student would type and the note is clearly about. "szállóigék" (the note's title) was
    // judged "none" by the strict judge: the note is about two authors and a quote, not about catchphrases.
    topic: "Az ember tragédiája és a Bánk bán",
    file: "Képernyőfotó 2026-10-13 11.20.03.png",
    wrongNote: BANK_WRONG,
    rightNote: BANK_RIGHT,
    // The question about the quote (not the ones about who wrote which play).
    isFactQuestion: (q) => /teremtésben|árva|vesztes/i.test(q.question),
    noteValue: /Madách|tragédi/i,
    trueValue: /Katona|Bánk/i,
  },
  {
    // Same shape as the Hungarian case (a quote, two works, a common mix-up), in English: if this works
    // and the Hungarian one does not, the language or the quotation marks are the suspect.
    name: "english-lit",
    topic: "Animal Farm and Brave New World",
    file: "Screenshot 2026-10-13 at 11.20.03.png",
    wrongNote: FARM_WRONG,
    rightNote: FARM_RIGHT,
    isFactQuestion: (q) => /equal/i.test(q.question),
    noteValue: /Huxley|Brave New World/i,
    trueValue: /Orwell|Animal Farm/i,
  },
];

// --- Classifying a quiz ---

export type Outcome = "follows" | "corrected" | "other" | "no-question";

export function classify(quiz: Quiz, c: Case): {
  outcome: Outcome;
  question?: QuizQuestion;
  flaggedTrue: boolean; // the fact question is flagged, and the flagged option really is the true answer
  otherFlags: QuizQuestion[]; // flagged questions other than the fact question
} {
  const q = quiz.questions.find(c.isFactQuestion);
  const otherFlags = quiz.questions.filter((x) => x.disagreement && x !== q);
  if (!q) return { outcome: "no-question", flaggedTrue: false, otherFlags };

  const correct = q.options[q.correct];
  const note = c.noteValue.test(correct);
  const truth = c.trueValue.test(correct);
  const outcome: Outcome = note && !truth ? "follows" : truth && !note ? "corrected" : "other";
  const flaggedTrue = !!q.disagreement && c.trueValue.test(q.options[q.disagreement.option]);
  return { outcome, question: q, flaggedTrue, otherFlags };
}

// --- Running ---

interface Config {
  label: string;
  judge: string;
  quiz: string;
}

const CONFIGS: Config[] = [
  { label: "Haiku all", judge: HAIKU, quiz: HAIKU },
  { label: "judge Haiku + quiz Sonnet", judge: HAIKU, quiz: SONNET },
  { label: "Sonnet all", judge: SONNET, quiz: SONNET },
];

function cost(model: string): number {
  const u = getUsage();
  const p = PRICE[model];
  return (u.inputTokens / 1e6) * p.input + (u.outputTokens / 1e6) * p.output;
}

// EVAL_VERBOSE=1 keeps the spokes' own log lines (for example the judge's "N ignored (no known source file)").
async function quietly<T>(work: () => Promise<T>): Promise<T> {
  if (process.env.EVAL_VERBOSE === "1") return work();
  const log = console.log;
  console.log = () => {};
  try {
    return await work();
  } finally {
    console.log = log;
  }
}

// Same steps as notesOnTopic() in agent.ts (kept as a copy so the eval does not pull in the CLI).
async function findingsFor(c: Case, note: string, judgeModel: string): Promise<ResearchFindings | null> {
  const hits: SearchHit[] = [{ text: note, file: c.file, chunkIndex: 0, sourceKind: "text", distance: 0.1 }];
  const judgement = await quietly(() => judgeMaterial(`What do the notes say about ${c.topic}?`, hits, judgeModel));
  if (judgement.coverage === "none") return null;
  const facts = judgement.materialFacts.map((m) => m.fact);
  return {
    author: "",
    work: c.topic,
    date: "",
    context: facts.join(" "),
    confidence: "high",
    sources: [],
    keyFacts: facts,
    materialFacts: judgement.materialFacts,
  };
}

interface RunResult {
  outcome: Outcome;
  flaggedTrue: boolean;
  flagsTotal: number;
  line?: string;
  otherFlags: string[];
  // Only when the fact question was not found: what the judge kept, and what the quiz asked.
  // Tells apart "the fact never reached the quiz" from "the quiz asked it in other words".
  facts?: string[];
  questions?: string[];
  cost: number;
}

const show = (q: QuizQuestion) =>
  `${q.question} → ${q.correct}) ${q.options[q.correct]}` +
  (q.disagreement ? `  ⚠️ ${q.disagreement.option}) ${q.options[q.disagreement.option]} — ${q.disagreement.text}` : "");

async function runOnce(c: Case, note: string, cfg: Config): Promise<RunResult> {
  resetSession();
  const findings = await findingsFor(c, note, cfg.judge);
  let total = cost(cfg.judge);
  if (!findings) return { outcome: "no-question", flaggedTrue: false, flagsTotal: 0, otherFlags: [], facts: ["(judge: no facts: coverage none, or the facts could not be read - run with EVAL_VERBOSE=1 to see which)"], questions: [], cost: total };

  resetSession();
  const quiz = await quietly(() => quizSpoke(findings, 5, cfg.quiz, { notesAreTheBase: true }));
  total += cost(cfg.quiz);

  const r = classify(quiz, c);
  return {
    outcome: r.outcome,
    flaggedTrue: r.flaggedTrue,
    flagsTotal: quiz.questions.filter((q) => q.disagreement).length,
    line: r.question ? show(r.question) : undefined,
    otherFlags: r.otherFlags.map(show),
    ...(r.outcome === "no-question" ? { facts: findings.keyFacts ?? [], questions: quiz.questions.map(show) } : {}),
    cost: total,
  };
}

function printMissing(r: RunResult) {
  if (!r.facts) return;
  console.log(`      facts from the judge:`);
  for (const f of r.facts) console.log(`        - ${f}`);
  console.log(`      questions in the quiz:`);
  for (const q of r.questions ?? []) console.log(`        - ${q}`);
}

const n = (rs: RunResult[], o: Outcome) => rs.filter((r) => r.outcome === o).length;

async function main() {
  const cases = CASES.filter((c) => !ONLY || c.name === ONLY);
  console.log(`\nTopic quiz eval — ${cases.map((c) => c.name).join(", ")}, ${RUNS} run(s) per configuration\n`);
  let totalCost = 0;
  const rows: string[][] = [];

  for (const c of cases) {
    for (const cfg of CONFIGS) {
      const wrong: RunResult[] = [];
      const right: RunResult[] = [];
      for (let i = 0; i < RUNS; i++) wrong.push(await runOnce(c, c.wrongNote, cfg));
      for (let i = 0; i < RUNS; i++) right.push(await runOnce(c, c.rightNote, cfg));
      totalCost += [...wrong, ...right].reduce((s, r) => s + r.cost, 0);

      rows.push([
        c.name,
        cfg.label,
        `${n(wrong, "follows")}/${RUNS}`,
        `${n(wrong, "corrected")}/${RUNS}`,
        `${wrong.filter((r) => r.flaggedTrue).length}/${RUNS}`,
        `${wrong.filter((r) => r.outcome === "follows" && !r.flaggedTrue).length}/${RUNS}`,
        `${wrong.reduce((s, r) => s + r.otherFlags.length, 0)}`,
        `${right.filter((r) => r.flagsTotal > 0).length}/${RUNS}`,
        `${n(right, "corrected")}/${RUNS}`,
      ]);

      console.log(`${c.name} — ${cfg.label}`);
      for (const r of wrong) {
        console.log(`  wrong note:   ${r.outcome}, ${r.flaggedTrue ? "FLAGGED" : "silent"}${r.line ? `  | ${r.line}` : ""}`);
        for (const f of r.otherFlags) console.log(`      other flag: ${f}`);
        printMissing(r);
      }
      for (const r of right) {
        console.log(`  control note: ${r.outcome === "corrected" ? "true answer marked" : r.outcome}, ${r.flagsTotal > 0 ? `FALSE ALARM x${r.flagsTotal}` : "no flag"}${r.line ? `  | ${r.line}` : ""}`);
        for (const f of r.otherFlags) console.log(`      flag: ${f}`);
        printMissing(r);
      }
    }
  }

  // Plain, aligned text (a markdown table does not line up in a terminal).
  const header = ["case", "configuration", "follows note", "corrected", "FLAGS truth", "silent", "other flags", "false alarm", "control ok"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i])).join("   ");
  console.log("\nWrong note, per run:   follows note = marks the note's answer | corrected = marks the true answer | FLAGS truth = follows AND flags the true answer | silent = follows, says nothing");
  console.log("                       other flags = total flags on the other questions (their facts are correct: false alarms, read them above)");
  console.log("Control note, per run: false alarm = any flag at all | control ok = marks the true answer\n");
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("   "));
  rows.forEach((r) => console.log(line(r)));
  console.log(`\nCost of this run: $${totalCost.toFixed(3)}\n`);
}

if (process.argv[1]?.endsWith("quiz.eval.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}