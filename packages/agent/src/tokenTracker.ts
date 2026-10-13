import Anthropic from "@anthropic-ai/sdk";
import { recordTokens } from "./budget.js";

// --- Types ---

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

// --- Costs per 1M tokens, per model family (USD, https://platform.claude.com/docs/en/about-claude/pricing) ---
// The price depends on the model that answered, so usage is kept per model. A model that is not
// listed is priced as Sonnet: an unknown model shows a cost that is too high, never too low.

interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const HAIKU_PRICE: Price = { input: 1.0, output: 5.0, cacheRead: 0.1, cacheWrite: 1.25 };
const SONNET_PRICE: Price = { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 };

function priceOf(model: string | undefined): Price {
  return model && /haiku/i.test(model) ? HAIKU_PRICE : SONNET_PRICE;
}

// --- Warning thresholds ---

const THRESHOLDS = {
  warn: 0.5, // ⚠️  soft warning
  danger: 1.0, // 🔴 danger warning
};

// --- Session state ---

const emptyUsage = (): TokenUsage => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });

let session: TokenUsage = emptyUsage();
const byModel = new Map<string, TokenUsage>(); // key: model id, "" when the caller gave none

// --- Track usage from API response ---

export function trackUsage(usage: Anthropic.Usage, model?: string): void {
  const cacheRead = (usage as any).cache_read_input_tokens ?? 0;
  const cacheWrite = (usage as any).cache_creation_input_tokens ?? 0;
  session.inputTokens += usage.input_tokens;
  session.outputTokens += usage.output_tokens;
  session.cacheReadTokens += cacheRead;
  session.cacheWriteTokens += cacheWrite;

  const m = byModel.get(model ?? "") ?? emptyUsage();
  m.inputTokens += usage.input_tokens;
  m.outputTokens += usage.output_tokens;
  m.cacheReadTokens += cacheRead;
  m.cacheWriteTokens += cacheWrite;
  byModel.set(model ?? "", m);

  // Also counted in the persistent daily budget (budget.ts). Cache reads are cheap and left out.
  recordTokens(
    usage.input_tokens + usage.output_tokens + ((usage as any).cache_creation_input_tokens ?? 0),
  );
}

// --- Estimate session cost ---

export function estimateCost(): number {
  let total = 0;
  for (const [model, u] of byModel) {
    const p = priceOf(model);
    total +=
      (u.inputTokens / 1_000_000) * p.input +
      (u.outputTokens / 1_000_000) * p.output +
      (u.cacheReadTokens / 1_000_000) * p.cacheRead +
      (u.cacheWriteTokens / 1_000_000) * p.cacheWrite;
  }
  return total;
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
  session = emptyUsage();
  byModel.clear();
}