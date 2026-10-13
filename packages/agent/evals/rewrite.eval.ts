// Eval for the follow-up rewrite (rewriteSpoke.ts): does a follow-up that points further back than
// the last two exchanges still become the right standalone question?
//
// The rewrite sees the last 4 messages (2 exchanges). A question like "and the first captain I asked
// about?" names something from 3+ exchanges earlier, so the rewrite cannot see it, and the library
// search gets a question without its subject. The variant also passes the student's earlier
// QUESTIONS (not the answers: those are long) from before those 4 messages.
//
// Compared on the same conversations:
//   current   earlierQuestions = 0 (the behaviour before 2026-10-13)
//   variant   earlierQuestions = 8 (the default since then)
//
// Cases:
//   far-*      the subject is only in a student question 3+ exchanges back. The answers in the
//              last 2 exchanges do not name it, so `current` should fail and `variant` should pass.
//   near       control: the subject is in the last exchange. Both should pass.
//   recency    control: an older subject (Dobó) is in the earlier questions, but "he" means the
//              latest one (Zrínyi). The variant must not pull the older subject in.
//   switch     control: a new, self-contained question after a long topic. Must stay on the new
//              topic, no old subject added.
// A run passes when the rewritten question matches `right` and does not match `wrong`.
//
// Measured 2026-10-13 (2 runs, temperature 0): current 6/16, variant 16/16, $0.039.
//   All five far-* cases failed with current, and not by leaving the question unchanged: the rewrite put in
//   the nearest similar subject (Zrínyi for Dobó, Arany for Petőfi, the Himnusz for the Szózat). The three
//   controls passed with both. Limits: 8 hand-written cases aimed at this failure; the effect on the library
//   hits is not measured; a subject named only in an old ANSWER is still out of reach.
//
// Run from packages/agent:  npx tsx --env-file=.env evals/rewrite.eval.ts
// Env:  EVAL_RUNS (default 2; the rewrite runs at temperature 0), EVAL_VERBOSE=1 prints every rewrite
// Cost: 8 cases × 2 variants × 2 runs = 32 short Haiku calls, about $0.05. The cost is printed.
// A Markdown report is written to evals/results/.

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { rewriteQuestion, type HistoryMessage } from "../src/spokes/rewriteSpoke.js";
import { getUsage, resetSession } from "../src/tokenTracker.js";

const RUNS = Number(process.env.EVAL_RUNS ?? 2);
const VERBOSE = process.env.EVAL_VERBOSE === "1";
const HAIKU = "claude-haiku-4-5-20251001"; // the model agent.ts uses for the rewrite
const PRICE = { input: 1, output: 5 }; // Haiku 4.5, USD per million tokens
const EARLIER_QUESTIONS = 8;

interface Case {
  name: string;
  history: [string, string][]; // [student question, answer], oldest first
  question: string;
  right: RegExp;
  wrong?: RegExp;
}

const CASES: Case[] = [
  {
    name: "far-dobo",
    history: [
      ["Ki volt Dobó István?", "Dobó István az egri vár kapitánya volt 1552-ben, ő vezette a védelmet a török ellen."],
      ["Mi történt Szigetvárnál 1566-ban?", "1566-ban I. Szulejmán ostromolta Szigetvárt. A vár kapitánya Zrínyi Miklós volt, aki a végén a védőkkel kirohant és elesett."],
      ["Melyik eposz dolgozza fel az ostromot?", "A Szigeti veszedelem, amelyet a hős dédunokája, Zrínyi Miklós költő írt."],
    ],
    question: "És az első várkapitány, akiről kérdeztem, hogyan halt meg?",
    right: /Dobó/i,
  },
  {
    name: "far-petofi",
    history: [
      ["Mikor született Petőfi Sándor?", "Petőfi Sándor 1823. január 1-jén született Kiskőrösön."],
      ["Ki írta a Toldit?", "A Toldit Arany János írta 1846-ban, a Kisfaludy Társaság pályázatára."],
      ["Miről szól a Toldi?", "Toldi Miklós, a nagy erejű parasztlegény útjáról, aki legyőzi a cseh vitézt, és a király lovaggá üti."],
    ],
    question: "Az első költő, akiről kérdeztem, milyen híres verset írt 1848 márciusában?",
    right: /Petőfi/i,
    wrong: /Arany/i,
  },
  {
    name: "far-aranybulla",
    history: [
      ["Mit tartalmazott az Aranybulla?", "Az 1222-es oklevél korlátozta a király hatalmát, és ellenállási záradékot tartalmazott."],
      ["Ki volt Szent László?", "I. László 1077 és 1095 között uralkodott, és szigorú törvényeket hozott a tulajdon védelmére."],
      ["És Könyves Kálmán?", "Kálmán 1095 és 1116 között uralkodott, enyhítette László törvényeit, és kimondta, hogy boszorkányok nincsenek."],
    ],
    question: "Melyik király adta ki azt az oklevelet, amiről legelőször kérdeztem?",
    right: /Aranybull|1222/i,
  },
  {
    name: "far-szozat",
    history: [
      ["Ki írta a Szózatot?", "A Szózatot Vörösmarty Mihály írta 1836-ban."],
      ["Ki írta a Himnuszt?", "A Himnuszt Kölcsey Ferenc írta 1823-ban."],
      ["Mi a Himnusz alcíme?", "Az alcíme: „A magyar nép zivataros századaiból”."],
    ],
    question: "És a másik vers, amiről először kérdeztem, ki zenésítette meg?",
    right: /Szózat|Vörösmarty/i,
  },
  {
    name: "far-tatarjaras",
    history: [
      ["Mikor volt a tatárjárás?", "A tatárjárás 1241–1242-ben volt."],
      ["Ki volt IV. Béla?", "IV. Béla 1235 és 1270 között uralkodott, őt tartják a második honalapítónak."],
      ["Ki alapította a Magyar Tudományos Akadémiát?", "Széchenyi István ajánlotta fel birtokai egyévi jövedelmét 1825-ben."],
      ["Mi volt a Lánchíd jelentősége?", "Az első állandó híd Pest és Buda között, Széchenyi kezdeményezésére épült."],
    ],
    question: "Visszatérve a legelső kérdésemre: melyik csatában verték meg ott a magyar sereget?",
    right: /tatár|mongol/i,
    wrong: /Széchenyi|Lánchíd|Akadémi/i,
  },
  {
    name: "near",
    history: [
      ["Mi volt a fekete sereg?", "Mátyás király zsoldos serege, az ország első állandó hadserege."],
      ["Ki volt Mátyás király?", "Hunyadi Mátyás 1458 és 1490 között uralkodott, a reneszánsz kultúra pártolója volt."],
    ],
    question: "És ki volt az apja?",
    right: /Mátyás/i,
  },
  {
    name: "recency",
    history: [
      ["Ki volt Dobó István?", "Dobó István az egri vár kapitánya volt 1552-ben."],
      ["Mi volt a végvári rendszer?", "A végvárak láncolata a török terjeszkedés megállítására."],
      ["Ki volt Zrínyi Miklós, a szigetvári kapitány?", "1566-ban ő védte Szigetvárt a szultán serege ellen."],
    ],
    question: "És hogyan halt meg?",
    right: /Zrínyi/i,
    wrong: /Dobó/i,
  },
  {
    name: "switch",
    history: [
      ["Ki volt Dobó István?", "Dobó István az egri vár kapitánya volt 1552-ben."],
      ["Mi volt Eger ostroma?", "1552-ben a török sereg öt hétig ostromolta Egert, sikertelenül."],
      ["Ki volt Bornemisza Gergely?", "Az egri vár egyik védője, a tűzszerszámok mestere."],
    ],
    question: "Ki írta az Anyám tyúkja című verset?",
    right: /Anyám tyúkja/i,
    wrong: /Dobó|Eger|Bornemisza/i,
  },
];

const toMessages = (h: [string, string][]): HistoryMessage[] =>
  h.flatMap(([q, a]) => [
    { role: "user", content: q },
    { role: "assistant", content: a },
  ]);

const VARIANTS = [
  { name: "current", earlier: 0 },
  { name: "variant", earlier: EARLIER_QUESTIONS },
];

async function main() {
  resetSession();
  // rewriteQuestion never throws: on an API error it warns and returns the original question, which
  // would count as a FAIL here. Stop instead, so a bad key or an outage cannot produce a fake result.
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    warn(...args);
    throw new Error("A rewrite call failed (see the warning above): the eval stops, no report is written.");
  };
  const lines: string[] = [];
  const log = (s = "") => {
    console.log(s);
    lines.push(s);
  };

  log(`# Rewrite eval — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
  log();
  log(`${CASES.length} cases · ${RUNS} runs each · ${HAIKU} · variant = ${EARLIER_QUESTIONS} earlier questions`);
  log();
  log(`| case | current | variant |`);
  log(`|---|---|---|`);

  const totals: Record<string, number> = { current: 0, variant: 0 };
  const examples: string[] = [];

  for (const c of CASES) {
    const history = toMessages(c.history);
    const cells: string[] = [];
    for (const v of VARIANTS) {
      let pass = 0;
      for (let r = 0; r < RUNS; r++) {
        const out = await rewriteQuestion(c.question, history, HAIKU, undefined, v.earlier);
        const ok = c.right.test(out) && !(c.wrong && c.wrong.test(out));
        if (ok) pass++;
        if (VERBOSE) console.log(`  ${c.name} · ${v.name} · ${ok ? "pass" : "FAIL"} · ${out}`);
        if (r === 0) examples.push(`- **${c.name}** · ${v.name}: ${out}`);
      }
      totals[v.name] += pass;
      cells.push(`${pass}/${RUNS}`);
    }
    log(`| ${c.name} | ${cells.join(" | ")} |`);
  }

  const max = CASES.length * RUNS;
  log(`| **total** | **${totals.current}/${max}** | **${totals.variant}/${max}** |`);
  log();
  log(`## Rewrites (first run)`);
  log();
  for (const e of examples) log(e);

  const u = getUsage();
  const cost = ((u.inputTokens + u.cacheWriteTokens) * PRICE.input + u.outputTokens * PRICE.output) / 1_000_000;
  log();
  log(`Cost: $${cost.toFixed(3)} (${u.inputTokens} input, ${u.outputTokens} output tokens)`);

  const dir = join(process.cwd(), "evals", "results");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})/, "$1-");
  const file = join(dir, `rewrite-${stamp}.md`);
  writeFileSync(file, lines.join("\n") + "\n");
  console.log(`\nReport: ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});