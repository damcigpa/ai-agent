import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkBudget, recordTokens } from "./budget.js";

const now = new Date(2026, 9, 14, 10, 0, 0); // local time, so the date key matches budget.ts

describe("checkBudget", () => {
  let dir: string;
  let path: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "budget-"));
    path = join(dir, "budget.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const used = (tokens: number) => recordTokens(tokens, path, now);

  it("is ok without a warning below 80% of the limit", () => {
    used(799_999);
    expect(checkBudget({ path, limit: 1_000_000, now })).toEqual({ ok: true });
  });

  it("is ok with a warning from 80% of the limit", () => {
    used(800_000);
    const check = checkBudget({ path, limit: 1_000_000, now });
    expect(check.ok).toBe(true);
    expect(check.ok && check.warning).toContain("80% used");
    expect(check.ok && check.warning).toContain("800,000 of 1,000,000");
  });

  it("rounds the percentage down, so 99.9% is never shown as 100%", () => {
    used(999_999);
    const check = checkBudget({ path, limit: 1_000_000, now });
    expect(check.ok && check.warning).toContain("99% used");
  });

  it("blocks at the limit", () => {
    used(1_000_000);
    const check = checkBudget({ path, limit: 1_000_000, now });
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.message).toContain("limit has been reached");
  });

  it("never warns when the limit is off (0)", () => {
    used(5_000_000);
    expect(checkBudget({ path, limit: 0, now })).toEqual({ ok: true });
  });

  it("starts at zero on a new day", () => {
    writeFileSync(path, JSON.stringify({ date: "2026-10-13", tokens: 999_999 }));
    expect(checkBudget({ path, limit: 1_000_000, now })).toEqual({ ok: true });
  });
});