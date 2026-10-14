import { describe, expect, it, vi } from "vitest";

vi.mock("../tokenTracker.js", () => ({ trackUsage: vi.fn() }));

import { capUnlinkedConfidence } from "./searchSpoke.js";
import type { ResearchFindings } from "../types.js";

const base: ResearchFindings = { author: "", work: "", date: "", context: "x", confidence: "high", sources: [] };

describe("capUnlinkedConfidence", () => {
  it("lowers high to medium when no source is a link", () => {
    expect(capUnlinkedConfidence({ ...base, sources: ["Petőfi Irodalmi Múzeum"] }).confidence).toBe("medium");
    expect(capUnlinkedConfidence(base).confidence).toBe("medium");
  });

  it("keeps high when at least one source is a link", () => {
    expect(capUnlinkedConfidence({ ...base, sources: ["Name", "https://mek.oszk.hu/x - title"] }).confidence).toBe("high");
  });

  it("never raises medium or low", () => {
    expect(capUnlinkedConfidence({ ...base, confidence: "medium" }).confidence).toBe("medium");
    expect(capUnlinkedConfidence({ ...base, confidence: "low" }).confidence).toBe("low");
  });
});