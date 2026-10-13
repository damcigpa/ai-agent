import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./budget.js", () => ({ recordTokens: vi.fn() }));

import { estimateCost, resetSession, trackUsage } from "./tokenTracker.js";

const usage = (input: number, output: number) => ({ input_tokens: input, output_tokens: output }) as never;

describe("tokenTracker cost", () => {
  beforeEach(() => resetSession());

  it("prices Haiku at $1 / $5 per million tokens", () => {
    trackUsage(usage(1_000_000, 1_000_000), "claude-haiku-4-5-20251001");
    expect(estimateCost()).toBeCloseTo(6);
  });

  it("prices Sonnet at $3 / $15 per million tokens", () => {
    trackUsage(usage(1_000_000, 1_000_000), "claude-sonnet-4-6");
    expect(estimateCost()).toBeCloseTo(18);
  });

  it("adds up a session that mixes both models", () => {
    trackUsage(usage(1_000_000, 0), "claude-haiku-4-5-20251001");
    trackUsage(usage(1_000_000, 0), "claude-sonnet-4-6");
    expect(estimateCost()).toBeCloseTo(4);
  });

  it("prices an unknown or missing model as Sonnet (never too low)", () => {
    trackUsage(usage(1_000_000, 0));
    expect(estimateCost()).toBeCloseTo(3);
  });
});