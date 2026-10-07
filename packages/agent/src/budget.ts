// Daily token budget: a hard stop against runaway cost.
//
// tokenTracker.ts only watches one session in memory and never blocks anything. This module
// keeps a per-day total in data/budget.json (so it survives restarts and is shared by the
// CLI and the web app, which both go through the hub) and refuses new questions once the
// day's limit is reached.
//
// Limit: DAILY_TOKEN_LIMIT in .env (tokens per day). Unset = 1,000,000; 0 = no limit.
// Counted: input + output + cache-write tokens of every Anthropic call. Voyage embeddings
// (/add, sync) are not counted here.

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";

export const DEFAULT_DAILY_TOKEN_LIMIT = 1_000_000;

interface BudgetFile {
  date: string; // local date, YYYY-MM-DD
  tokens: number;
}

export function defaultBudgetPath(): string {
  return resolve(process.cwd(), "data", "budget.json");
}

// The limit from the environment; invalid or negative values fall back to the default.
export function dailyLimit(): number {
  const raw = process.env.DAILY_TOKEN_LIMIT;
  if (raw === undefined || raw.trim() === "") return DEFAULT_DAILY_TOKEN_LIMIT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_TOKEN_LIMIT;
}

// Local date, so the day rolls over at the student's midnight, not UTC's.
function today(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// A missing, unreadable or corrupt file counts as "nothing spent today": a broken budget
// file must never stop the app from working.
function read(path: string, date: string): BudgetFile {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<BudgetFile>;
    if (parsed.date === date && typeof parsed.tokens === "number" && parsed.tokens >= 0) {
      return { date, tokens: parsed.tokens };
    }
  } catch {
    // fall through
  }
  return { date, tokens: 0 };
}

export function tokensUsedToday(path: string = defaultBudgetPath(), now: Date = new Date()): number {
  return read(path, today(now)).tokens;
}

// Adds tokens to today's total. Never throws: failing to record must not break an answer.
export function recordTokens(tokens: number, path: string = defaultBudgetPath(), now: Date = new Date()): void {
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  try {
    const current = read(path, today(now));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ date: current.date, tokens: current.tokens + Math.round(tokens) }));
  } catch {
    // ignore
  }
}

export type BudgetCheck = { ok: true } | { ok: false; message: string };

export function checkBudget(
  options: { path?: string; limit?: number; now?: Date } = {},
): BudgetCheck {
  const { path = defaultBudgetPath(), limit = dailyLimit(), now = new Date() } = options;
  if (limit === 0) return { ok: true };
  const used = tokensUsedToday(path, now);
  if (used < limit) return { ok: true };
  return {
    ok: false,
    message:
      `Today's token limit has been reached (${used.toLocaleString("en-US")} of ${limit.toLocaleString("en-US")} tokens). ` +
      `Please try again tomorrow, or raise DAILY_TOKEN_LIMIT in the .env file (0 turns the limit off).`,
  };
}