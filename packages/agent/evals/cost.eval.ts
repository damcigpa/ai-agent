// Cost breakdown: what does one question cost, call by call, and where do the tokens go?
//
// Why: the only cost number so far is the total of one question (CACHE_DEBUG: about 32k input and 4k output tokens).
// It does not say which step spends it. Reading the code, most hub steps are plain code (aggregate, evaluate coverage,
// format) and cost nothing; the model calls are classify/decompose (Haiku), the search spoke (up to 4 turns, each turn sends
// everything gathered so far again), analyze, explain and a few rare ones. This script measures instead of guessing.
//
// How: it runs the hub on each question and records every Anthropic call (it wraps client.messages.create/stream here in
// the eval; nothing in the app changes). Calls are grouped by what they are: the forced tool name if there is one, otherwise
// the start of the system prompt. Each question runs in a fresh temporary folder, so the scratchpad of an earlier
// question is not reused ("Reusing findings from previous turn" would hide the cost) and your data/ folder is not touched.
// It uses the real Tavily and Anthropic keys of your .env. No library is searched (no Voyage).
//
// Default question pair (a simple question and a compound one) shows what decompose does to a compound question:
//   "Ki volt Julius Caesar?"  and  "Ki volt Julius Caesar, és honnan ered a diktatúra?"
//
// Run from packages/agent:  npx tsx --env-file=.env evals/cost.eval.ts
// Env:  EVAL_QUESTIONS="q1|q2|..."  (separate questions with |)
//       EVAL_MODEL=haiku|sonnet     (the model the hub uses, default haiku = the CLI default)
//       EVAL_RUNS (default 1; web research varies, 2-3 shows how much)
//       EVAL_VERBOSE=1              (every call in order: turn by turn)
// Cost: about 5 cents per question and run with Haiku (measured once); the exact cost is printed.
// Prices: Haiku 1/5 and Sonnet 3/15 dollars per million input/output tokens; cache reads 0.1x, cache writes 1.25x input.
// Not counted: Tavily.

import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { client } from "../src/client.js";
import { hub } from "../src/hub/index.js";

const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-6";
const MODEL = process.env.EVAL_MODEL === "sonnet" ? SONNET : HAIKU;
const RUNS = Number(process.env.EVAL_RUNS ?? 1);
const VERBOSE = process.env.EVAL_VERBOSE === "1";
const QUESTIONS = process.env.EVAL_QUESTIONS
  ? process.env.EVAL_QUESTIONS.split("|").map((q) => q.trim()).filter(Boolean)
  : ["Ki volt Julius Caesar?", "Ki volt Julius Caesar, és honnan ered a diktatúra?"];

interface Call {
  label: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

function price(model: string): { input: number; output: number } {
  return /haiku/i.test(model) ? { input: 1, output: 5 } : { input: 3, output: 15 };
}

function cost(c: Call): number {
  const p = price(c.model);
  return (c.input * p.input + c.output * p.output + c.cacheRead * p.input * 0.1 + c.cacheWrite * p.input * 1.25) / 1e6;
}

// --- Recording: wraps the shared client, only inside this eval ---

let calls: Call[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function labelOf(params: any): string {
  const tool = params?.tool_choice?.name;
  if (tool) return `tool: ${tool}`;
  const sys = typeof params?.system === "string" ? params.system : JSON.stringify(params?.system ?? "");
  return sys ? sys.replace(/\s+/g, " ").slice(0, 46) : "(no system prompt)";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function record(params: any, message: any): void {
  const u = message?.usage ?? {};
  calls.push({
    label: labelOf(params),
    model: String(message?.model ?? params?.model ?? ""),
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const messages: any = client.messages;
const originalCreate = messages.create.bind(messages);
// Returns the SDK's own promise object (not a new async one), so extras such as .withResponse() keep working.
// Recording is a side branch of that promise.
messages.create = (params: unknown, ...rest: unknown[]) => {
  const pending = originalCreate(params, ...rest);
  pending.then(
    (response: unknown) => record(params, response),
    () => {}, // the caller handles the error; this side branch must not raise it again
  );
  return pending;
};
const originalStream = messages.stream.bind(messages);
messages.stream = (params: unknown, ...rest: unknown[]) => {
  const stream = originalStream(params, ...rest);
  stream.on("finalMessage", (m: unknown) => record(params, m));
  return stream;
};

const totalCost = (list: Call[]) => list.reduce((s, c) => s + cost(c), 0);

// --- Running one question ---

async function runQuestion(question: string) {
  const previous = process.cwd();
  process.chdir(mkdtempSync(join(tmpdir(), "cost-eval-")));
  calls = [];
  const progress: string[] = [];
  let answer = "";
  let error = "";
  try {
    const reader = hub([{ role: "user", content: question }], MODEL).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === "progress") progress.push(value.data);
      else if (value.type === "done") answer = value.data;
      else if (value.type === "error") error = value.data;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    process.chdir(previous);
  }
  return { calls: [...calls], progress, answer, error };
}

const pad = (v: string | number, n: number, right = false) => (right ? String(v).padStart(n) : String(v).padEnd(n));

async function main() {
  console.log(`\nCost eval — hub on ${MODEL.includes("haiku") ? "Haiku" : "Sonnet"}, ${RUNS} run(s) per question\n`);
  const summary: string[][] = [];
  let grandTotal = 0;

  for (const question of QUESTIONS) {
    for (let run = 1; run <= RUNS; run++) {
      const r = await runQuestion(question);
      console.log(`Question: ${question}  (run ${run})`);
      const plan = r.progress.find((p) => p.includes("Plan:"));
      if (plan) console.log(`  ${plan.trim()}`);
      console.log(`  searches announced: ${r.progress.filter((p) => /🌐|Searching/i.test(p)).length}, answer: ${r.answer.length} characters${r.error ? `, ERROR: ${r.error}` : ""}`);

      if (VERBOSE) {
        r.calls.forEach((c, i) =>
          console.log(`    #${pad(i + 1, 2)} ${pad(c.label, 48)} ${pad(/haiku/i.test(c.model) ? "Haiku" : "Sonnet", 6)} in ${pad(c.input, 6, true)}  out ${pad(c.output, 5, true)}  $${cost(c).toFixed(4)}`),
        );
      }

      const groups = new Map<string, Call[]>();
      for (const c of r.calls) {
        const key = `${c.label}|${/haiku/i.test(c.model) ? "Haiku" : "Sonnet"}`;
        groups.set(key, [...(groups.get(key) ?? []), c]);
      }
      console.log(`  ${pad("call (grouped)", 48)} ${pad("model", 6)} ${pad("calls", 5, true)} ${pad("input", 7, true)} ${pad("output", 7, true)} ${pad("cost", 8, true)}`);
      let total = 0;
      let inputTotal = 0;
      let outputTotal = 0;
      for (const [key, list] of [...groups.entries()].sort((a, b) => totalCost(b[1]) - totalCost(a[1]))) {
        const [label, model] = key.split("|");
        const input = list.reduce((s, c) => s + c.input + c.cacheRead + c.cacheWrite, 0);
        const output = list.reduce((s, c) => s + c.output, 0);
        const sum = list.reduce((s, c) => s + cost(c), 0);
        total += sum;
        inputTotal += input;
        outputTotal += output;
        console.log(`  ${pad(label, 48)} ${pad(model, 6)} ${pad(list.length, 5, true)} ${pad(input, 7, true)} ${pad(output, 7, true)} ${pad("$" + sum.toFixed(4), 8, true)}`);
      }
      console.log(`  ${pad("TOTAL", 55)} ${pad(r.calls.length, 5, true)} ${pad(inputTotal, 7, true)} ${pad(outputTotal, 7, true)} ${pad("$" + total.toFixed(4), 8, true)}\n`);
      grandTotal += total;
      summary.push([question.slice(0, 52), String(run), String(r.calls.length), String(inputTotal), String(outputTotal), "$" + total.toFixed(4)]);
    }
  }

  const head = ["question", "run", "calls", "input", "output", "cost"];
  const width = head.map((h, i) => Math.max(h.length, ...summary.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((v, i) => (i >= 1 ? v.padStart(width[i]) : v.padEnd(width[i]))).join("   ");
  console.log(line(head));
  console.log(width.map((w) => "-".repeat(w)).join("   "));
  summary.forEach((r) => console.log(line(r)));
  console.log(`\nCost of this run: $${grandTotal.toFixed(3)} (Anthropic only; Tavily not counted)\n`);
}

// Sort helper: the total cost of one group.
function list(calls: Call[]): number {
  return calls.reduce((s, c) => s + cost(c), 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});