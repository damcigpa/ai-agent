import Anthropic from "@anthropic-ai/sdk";
import { recordTokens } from "./budget.js";

// --- Types ---

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

// --- Costs per 1M tokens for claude-sonnet-4-6 ---

const COSTS = {
  input: 3.0,
  output: 15.0,
  cacheRead: 0.3,
  cacheWrite: 3.75,
};

// --- Warning thresholds ---

const THRESHOLDS = {
  warn: 0.5, // ⚠️  soft warning
  danger: 1.0, // 🔴 danger warning
};

// --- Session state ---

let session: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

// --- Track usage from API response ---

export function trackUsage(usage: Anthropic.Usage): void {
  session.inputTokens += usage.input_tokens;
  session.outputTokens += usage.output_tokens;
  session.cacheReadTokens += (usage as any).cache_read_input_tokens ?? 0;
  session.cacheWriteTokens += (usage as any).cache_creation_input_tokens ?? 0;

  // Also counted in the persistent daily budget (budget.ts). Cache reads are cheap and left out.
  recordTokens(
    usage.input_tokens + usage.output_tokens + ((usage as any).cache_creation_input_tokens ?? 0),
  );
}

// --- Estimate session cost ---

export function estimateCost(): number {
  return (
    (session.inputTokens / 1_000_000) * COSTS.input +
    (session.outputTokens / 1_000_000) * COSTS.output +
    (session.cacheReadTokens / 1_000_000) * COSTS.cacheRead +
    (session.cacheWriteTokens / 1_000_000) * COSTS.cacheWrite
  );
}

// --- Get warning message to append to response if needed ---

export function getUsageWarning(): string | null {
  const cost = estimateCost();

  if (cost >= THRESHOLDS.danger) {
    return `\n\n🔴 Session cost is $${cost.toFixed(4)} — you are likely running low on credits. Please check console.anthropic.com/settings/billing.`;
  }

  if (cost >= THRESHOLDS.warn) {
    return `\n\n⚠️  Session cost is $${cost.toFixed(4)} — keep an eye on your credit balance.`;
  }

  return null;
}

// --- Read the session's token counts (used by the eval report to price each model) ---

export function getUsage(): TokenUsage {
  return { ...session };
}

// --- Reset session ---

export function resetSession(): void {
  session = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}