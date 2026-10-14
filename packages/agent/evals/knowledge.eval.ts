// Knowledge eval: does the model know who wrote a quote, with NO notes at all?
//
// Why: in the topic quiz the disagreement flag ("your notes say X, but it could be Y") never appeared for the
// Hungarian literature case (quiz.eval.ts: 4 wrong-note quizzes, 0 flags), while it did for history. Silence has
// three possible causes: the model does not know the true author, it knows but is not confident enough for the
// rule, or it knows and does not fill the field. This script tests the first one directly: one plain question
// per quote, no notes, no quiz.
//
// Quotes:
//   target-hu   the quote of the quiz.eval.ts literature case (Katona József, Bánk bán; often mixed up with Madách)
//   target-en   the quote of the english-lit case (Orwell, Animal Farm)
//   control-hu  two very well known Hungarian quotes (Madách; Vörösmarty), to see if the model knows
//               Hungarian literature in general, not only this quote
//
// Per answer: correct = names the right author and not the wrong one; wrong = names a wrong author / no right
// one; mixed = names both; hedged = says it is not sure (counted separately, and it is also checked for the
// author). EVAL_VERBOSE=1 prints every answer.
//
// Measured 2026-10-13 (5 calls per quote and model, answers by regex on the author or work):
//   quote                                   Haiku   Sonnet
//   target-hu (Katona, Bánk bán)             0/5     0/5     (answers: Petőfi, Madách, Vörösmarty, Ady; never Katona)
//   target-en (Orwell, Animal Farm)          5/5     5/5
//   control-hu-1 (Madách: Küzdj és bízva…)   0/5     0/5
//   control-hu-2 (Vörösmarty: Szózat)        1/5     5/5
// Hedged ("I am not sure") in 1 of 25 wrong Hungarian answers: the models are confidently wrong, with invented
// details ("Éva says it when she loses her child"). The metric counts the author OR the work as correct.
//
// Run from packages/agent:  npx tsx --env-file=.env evals/knowledge.eval.ts
// Env:  EVAL_RUNS (default 5), EVAL_VERBOSE=1
// Cost: a few cents (about 40 short calls).
// A Markdown report (table, the first answer of each quote and model, cost) is written to evals/results/.

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { client } from "../src/client.js";

const RUNS = Number(process.env.EVAL_RUNS ?? 5);
const VERBOSE = process.env.EVAL_VERBOSE === "1";
const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-6";
const PRICE: Record<string, { input: number; output: number }> = {
  [HAIKU]: { input: 1, output: 5 },
  [SONNET]: { input: 3, output: 15 },
};

interface Item {
  name: string;
  prompt: string;
  right: RegExp; // the true author or work
  wrong?: RegExp; // the common mix-up
}

const ITEMS: Item[] = [
  {
    name: "target-hu",
    prompt:
      "Ki írta ezt, és melyik műből való? Válaszolj egy-két mondatban.\n„Nincs a teremtésben vesztes, csak én! Nincs árva más több, csak az én gyermekem!”",
    right: /Katona|Bánk bán/i,
    wrong: /Madách|tragédi/i,
  },
  {
    name: "target-en",
    prompt: 'Who wrote this, and which work is it from? Answer in one or two sentences.\n"All animals are equal, but some animals are more equal than others."',
    right: /Orwell|Animal Farm/i,
    wrong: /Huxley|Brave New World/i,
  },
  {
    name: "control-hu-1",
    prompt: "Ki írta ezt, és melyik műből való? Válaszolj egy-két mondatban.\n„Küzdj és bízva bízzál!”",
    right: /Madách|tragédi/i,
  },
  {
    name: "control-hu-2",
    prompt: "Ki írta ezt, és melyik műből való? Válaszolj egy-két mondatban.\n„Hazádnak rendületlenül légy híve óh magyar”",
    right: /Vörösmarty|Szózat/i,
  },
];

const HEDGE = /nem (tudom|vagyok biztos|sikerült)|nem tudok|not sure|cannot confirm|can't confirm|don't know|unable to/i;

async function ask(model: string, prompt: string) {
  const res = await client.messages.create({ model, max_tokens: 300, messages: [{ role: "user", content: prompt }] });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  return { text, input: res.usage.input_tokens, output: res.usage.output_tokens };
}

async function main() {
  console.log(`\nKnowledge eval — ${RUNS} call(s) per quote and model, no notes\n`);
  const rows: string[][] = [];
  const examples: string[] = [];
  let cost = 0;

  for (const model of [HAIKU, SONNET]) {
    for (const item of ITEMS) {
      const t = { correct: 0, wrong: 0, mixed: 0, hedged: 0 };
      for (let i = 0; i < RUNS; i++) {
        const r = await ask(model, item.prompt);
        cost += (r.input * PRICE[model].input + r.output * PRICE[model].output) / 1e6;
        const right = item.right.test(r.text);
        const wrong = item.wrong ? item.wrong.test(r.text) : false;
        const kind = right && wrong ? "mixed" : right ? "correct" : "wrong";
        t[kind]++;
        if (i === 0) examples.push(`- **${model.includes("haiku") ? "Haiku" : "Sonnet"} · ${item.name}** [${kind}]: ${r.text.replace(/\s+/g, " ")}`);
        if (HEDGE.test(r.text)) t.hedged++;
        if (VERBOSE) console.log(`${model.includes("haiku") ? "Haiku " : "Sonnet"} ${item.name} #${i + 1} [${kind}${HEDGE.test(r.text) ? ", hedged" : ""}]: ${r.text.replace(/\s+/g, " ")}`);
      }
      rows.push([model.includes("haiku") ? "Haiku" : "Sonnet", item.name, `${t.correct}/${RUNS}`, `${t.wrong}/${RUNS}`, `${t.mixed}/${RUNS}`, `${t.hedged}/${RUNS}`]);
    }
  }

  const head = ["model", "quote", "correct", "wrong", "mixed", "hedged"];
  const width = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((v, i) => v.padEnd(width[i])).join("   ");
  console.log(line(head));
  console.log(width.map((w) => "-".repeat(w)).join("   "));
  rows.forEach((r) => console.log(line(r)));
  console.log(`\nCost of this run: $${cost.toFixed(3)}\n`);

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})/, "$1-");
  const report = [
    `# Knowledge eval — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    "",
    `${RUNS} call(s) per quote and model, no notes. Correct = names the right author or work and not the common mix-up.`,
    "",
    `| ${head.join(" | ")} |`,
    `|${head.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
    "",
    "## First answer per quote and model",
    "",
    ...examples,
    "",
    `Cost: $${cost.toFixed(3)}`,
    "",
  ].join("\n");
  const dir = join(process.cwd(), "evals", "results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `knowledge-${stamp}.md`);
  writeFileSync(file, report);
  console.log(`Report: ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});