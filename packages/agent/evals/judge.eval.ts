// Judge-only eval: does the material judge keep the fact that matters, and can its answer be read?
//
// Why: in evals/quiz.eval.ts the judge sometimes returned fewer facts (the note's wrong fact missing)
// or its facts could not be read (a quote broke the JSON). This script runs ONLY the judge, many times,
// on the same notes, so a difference between two prompts can be told from run-to-run variation. No question
// writer, so it is cheap (about 0.2 cent per call with Haiku).
//
// Per case and note (wrong / control), over EVAL_RUNS calls:
//   key fact kept   the facts include one about the thing that differs between the notes (the year, the quote)
//   unreadable      the judge's facts arrived as broken text (the "arrived as text" log line): zero facts, but
//                   NOT the same as the judge saying "none"
//   none            the judge said the notes do not cover the topic
//   facts           the number of facts, min-max
//
// Run from packages/agent:  npx tsx --env-file=.env evals/judge.eval.ts
// Env:  EVAL_RUNS (default 10), EVAL_CASE=history|literature|english-lit (default: all),
//       EVAL_JUDGE=haiku|sonnet (default haiku), EVAL_VERBOSE=1 prints the facts of every call.
// Measured with this script (judge on Haiku, no extra prompt rule, 5-10 calls per note; the judge is
// deterministic: every call gave the same number of facts):
//   history, literature: the wrong fact is kept (10/10), the answer is readable (0 unreadable).
//   english-lit, wrong note: the wrong fact is dropped (0/10), 2 facts instead of 3.
//   With the sentence "report what the notes say even if you believe it is wrong": english-lit 5/5, but
//   literature (Hungarian quote) unreadable 5/5. With a quotation-mark rule: the reverse. Neither is in the prompt.
// To compare two prompts, run it once with each version of src/spokes/librarySpoke.ts.

import { judgeMaterial } from "../src/spokes/librarySpoke.js";
import type { SearchHit } from "../src/library/vectorStore.js";
import { CASES } from "./quiz.eval.js";

const RUNS = Number(process.env.EVAL_RUNS ?? 10);
const ONLY = process.env.EVAL_CASE;
const VERBOSE = process.env.EVAL_VERBOSE === "1";
const MODEL = process.env.EVAL_JUDGE === "sonnet" ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";

// The fact that differs between the wrong and the control note.
const KEY_FACT: Record<string, RegExp> = {
  history: /1565|1558/,
  literature: /teremtésben|árva|vesztes/i,
  "english-lit": /equal/i,
};

interface Tally {
  runs: number;
  kept: number;
  unreadable: number;
  none: number;
  min: number;
  max: number;
}

async function judgeOnce(text: string, file: string, topic: string, key: RegExp) {
  const hits: SearchHit[] = [{ text, file, chunkIndex: 0, sourceKind: "text", distance: 0.1 }];
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.join(" "));
  let judgement;
  try {
    judgement = await judgeMaterial(`What do the notes say about ${topic}?`, hits, MODEL);
  } finally {
    console.log = original;
  }
  const unreadable = lines.some((l) => l.includes("arrived as text"));
  const facts = judgement.materialFacts.map((f) => f.fact);
  return {
    unreadable,
    none: !unreadable && judgement.coverage === "none",
    kept: facts.some((f) => key.test(f)),
    facts,
  };
}

async function main() {
  console.log(`\nJudge eval — ${MODEL}, ${RUNS} call(s) per note\n`);
  const rows: string[][] = [];

  for (const c of CASES.filter((x) => !ONLY || x.name === ONLY)) {
    const key = KEY_FACT[c.name];
    for (const [kind, note] of [["wrong", c.wrongNote], ["control", c.rightNote]] as const) {
      const t: Tally = { runs: RUNS, kept: 0, unreadable: 0, none: 0, min: Infinity, max: 0 };
      for (let i = 0; i < RUNS; i++) {
        const r = await judgeOnce(note, c.file, c.topic, key);
        if (r.kept) t.kept++;
        if (r.unreadable) t.unreadable++;
        if (r.none) t.none++;
        t.min = Math.min(t.min, r.facts.length);
        t.max = Math.max(t.max, r.facts.length);
        if (VERBOSE) console.log(`${c.name} ${kind} #${i + 1}: ${r.unreadable ? "UNREADABLE" : r.facts.join(" | ") || "(none)"}`);
      }
      rows.push([c.name, kind, `${t.kept}/${RUNS}`, `${t.unreadable}/${RUNS}`, `${t.none}/${RUNS}`, `${t.min}-${t.max}`]);
    }
  }

  const head = ["case", "note", "key fact kept", "unreadable", "none", "facts"];
  const width = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((v, i) => v.padEnd(width[i])).join("   ");
  console.log(line(head));
  console.log(width.map((w) => "-".repeat(w)).join("   "));
  rows.forEach((r) => console.log(line(r)));
  console.log();
}

if (process.argv[1]?.endsWith("judge.eval.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}