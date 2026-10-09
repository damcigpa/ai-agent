// Verifies the material-answers spec: The library is searched first; Material-first answers; Sources are labelled; Contradictions are shown, never silently resolved; No relevant material changes nothing; Quiz covers the material.
// Design (add-material-library): D6, D8, D9.
// Hub routing with mocked planner, steps and material judge: no network, no cost.

import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  plan: vi.fn(), replan: vi.fn(), step: vi.fn(), judge: vi.fn(), compare: vi.fn(),
  pad: { value: null as any },
}));
vi.mock("./decompose.js", () => ({ detectSubjectAndDecompose: m.plan, replan: m.replan }));
vi.mock("./execute.js", () => ({ executeStep: m.step }));
vi.mock("../spokes/librarySpoke.js", () => ({ judgeMaterial: m.judge, compareWithWeb: m.compare }));
vi.mock("../tools/scratchpad.js", () => ({
  readScratchpad: () => m.pad.value,
  resetScratchpad: () => { m.pad.value = null; },
  updateScratchpad: (_cur: any, upd: any) => { m.pad.value = { ...(m.pad.value ?? {}), ...upd }; return m.pad.value; },
}));
import { hub } from "./index.js";

const web = { author: "", work: "Tanácsköztársaság", date: "1919", context: "webes szöveg", confidence: "high", sources: ["https://britannica.com/x"], subject: "history", keyFacts: ["webes tény"] };
const facts = [{ fact: "1919. március 21-én kikiáltották a Tanácsköztársaságot.", file: "1000003153.jpg" }];
const hits = [{ text: "jegyzet", file: "1000003153.jpg", chunkIndex: 0, sourceKind: "image", distance: 1.3 }];

// What the fake web search returns; a test can switch it to a failed (empty) search.
const failedWeb = { author: "", work: "", date: "", context: "", confidence: "low", sources: [], subject: "history", keyFacts: [] };
let webResult: any = web;

// fake executeStep: search returns webResult; explain returns an explanation built from what it got
m.step.mockImplementation(async (step: string, _q: string, _s: string, found: any) => {
  const s = step.toLowerCase();
  if (s.includes("explain")) return { result: "", updatedFindings: found, updatedAnalysis: null, updatedExplanation: { summary: `Magyarázat ebből: ${found?.context}`, keyPoints: [], significance: "", furtherReading: [] } };
  return { result: "", updatedFindings: webResult, updatedAnalysis: null, updatedExplanation: null };
});

async function run(opts?: any, steps = ["search for information about: q", "explain the findings clearly"], newTopic = true) {
  m.plan.mockResolvedValueOnce({ subject: "history", steps, newTopic, topic: "T" });
  const events: any[] = [];
  const reader = hub([{ role: "user", content: "Mi volt a Tanácsköztársaság?" }], "m", undefined, opts).getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; events.push(value); }
  const stepsRun = m.step.mock.calls.map((c) => c[0]);
  const gapsPassed = m.step.mock.calls.map((c) => c[9]);
  return { events, done: events.find((e) => e.type === "done")?.data as string, stepsRun, gapsPassed, progress: events.filter((e) => e.type === "progress").map((e) => e.data) };
}

beforeEach(() => { m.plan.mockReset(); m.replan.mockReset(); m.judge.mockReset(); m.compare.mockReset(); m.compare.mockResolvedValue([]); m.step.mockClear(); m.pad.value = null; webResult = web; vi.spyOn(console, "warn").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("hub material step", () => {
  it("no searchLibrary: exactly the old flow", async () => {
    const r = await run(undefined);
    expect(r.stepsRun).toEqual(["search for information about: q", "explain the findings clearly"]);
    expect(m.judge).not.toHaveBeenCalled();
    expect(r.done).not.toContain("📒");
  });
  it("No relevant material changes nothing: empty library → no judge call, old flow", async () => {
    const r = await run({ searchLibrary: async () => [] });
    expect(m.judge).not.toHaveBeenCalled();
    expect(r.stepsRun).toEqual(["search for information about: q", "explain the findings clearly"]);
  });
  it("No relevant material changes nothing: coverage none → old flow, no 📒", async () => {
    m.judge.mockResolvedValueOnce({ coverage: "none", materialFacts: [], missing: [] });
    const r = await run({ searchLibrary: async () => hits });
    expect(r.stepsRun).toEqual(["search for information about: q", "explain the findings clearly"]);
    expect(r.gapsPassed).toEqual([[], []]);
    expect(r.done).not.toContain("📒");
  });
  it("Material-first answers, full coverage: no web search, explanation from the material, 📒 shown", async () => {
    m.judge.mockResolvedValueOnce({ coverage: "full", materialFacts: facts, missing: [] });
    const r = await run({ searchLibrary: async () => hits });
    expect(r.stepsRun).toEqual(["explain the findings clearly"]);
    expect(r.done).toContain("Magyarázat ebből: 1919. március 21-én kikiáltották");
    expect(r.done).toContain("## 📒 From your material");
    expect(r.done).toContain("(1000003153.jpg)");
    expect(r.done).not.toContain("britannica");
    expect(r.progress).toContain("📒 Your material covers the question — no web search needed");
  });
  it("full with a search-only plan: an explain step is added", async () => {
    m.judge.mockResolvedValueOnce({ coverage: "full", materialFacts: facts, missing: [] });
    const r = await run({ searchLibrary: async () => hits }, ["search for information about: q"]);
    expect(r.stepsRun).toEqual(["explain the findings clearly"]);
  });
  it("Material-first answers, partial coverage: the web search gets only the gaps; both sources labelled", async () => {
    m.judge.mockResolvedValueOnce({ coverage: "partial", materialFacts: facts, missing: ["a bukás oka"] });
    const r = await run({ searchLibrary: async () => hits });
    expect(r.stepsRun).toEqual(["search for information about: q", "explain the findings clearly"]);
    expect(r.gapsPassed[0]).toEqual(["a bukás oka"]);
    expect(r.done).toContain("## 📒 From your material");
    expect(r.done).toContain("- 📒 1000003153.jpg");
    expect(r.done).toContain("- 🌐 https://britannica.com/x");
    // the explanation saw the material facts merged into the findings
    expect(m.step.mock.calls[1][3].materialFacts).toEqual(facts);
  });
  it("Quiz covers the material: saved findings carry the material facts (in keyFacts too)", async () => {
    m.judge.mockResolvedValueOnce({ coverage: "full", materialFacts: facts, missing: [] });
    await run({ searchLibrary: async () => hits });
    const saved = m.pad.value.findings.at(-1);
    expect(saved.materialFacts).toEqual(facts);
    expect(saved.keyFacts).toContain(facts[0].fact);
  });
  it("analysis plan: the library is not consulted", async () => {
    const search = vi.fn(async () => hits);
    await run({ searchLibrary: search }, ["analyze the work", "explain the analysis in accessible terms"]);
    expect(search).not.toHaveBeenCalled();
  });
  it("a failing library search does not break the answer", async () => {
    const r = await run({ searchLibrary: async () => { throw new Error("lancedb"); } });
    expect(r.stepsRun).toEqual(["search for information about: q", "explain the findings clearly"]);
    expect(r.done).toBeTruthy();
  });
  it("a new topic does not drag the old topic's findings along", async () => {
    m.pad.value = { topic: "régi", findings: [{ ...web, work: "RÉGI TÉMA" }], analysis: [], conversationTopics: ["régi kérdés"] };
    await run(undefined, ["search for information about: q"], true);
    expect(m.pad.value.findings.map((f: any) => f.work)).toEqual(["Tanácsköztársaság"]);
    expect(m.pad.value.conversationTopics).toEqual(["Mi volt a Tanácsköztársaság?"]);
  });
  it("same topic: earlier findings are kept", async () => {
    m.pad.value = { topic: "T", findings: [{ ...web, work: "ELŐZŐ" }], analysis: [], conversationTopics: ["előző"] };
    await run(undefined, ["search for information about: q"], false);
    expect(m.pad.value.findings.map((f: any) => f.work)).toEqual(["ELŐZŐ", "Tanácsköztársaság"]);
  });
  it("Contradictions are shown, never silently resolved: the web findings alone are compared, and the disagreement is shown", async () => {
    m.judge.mockResolvedValueOnce({ coverage: "partial", materialFacts: facts, missing: ["a bukás oka"] });
    m.compare.mockResolvedValueOnce([{ material: facts[0].fact, file: "1000003153.jpg", web: "Más dátum.", likelyCorrect: "web", reason: "több forrás" }]);
    const r = await run({ searchLibrary: async () => hits });
    expect(m.compare).toHaveBeenCalledTimes(1);
    const [, sentFacts, sentWeb] = m.compare.mock.calls[0];
    expect(sentFacts).toEqual(facts);
    expect(sentWeb.materialFacts).toBeUndefined(); // web only, not merged
    expect(sentWeb.sources).toEqual(["https://britannica.com/x"]);
    expect(r.progress).toContain("⚠️  Your material and the web disagree on 1 point(s)");
    expect(r.done).toContain("## ⚠️ CONTRADICTION — your material and the sources disagree");
    expect(r.done).toContain("**The sources are probably right** — több forrás");
    expect(m.pad.value.findings.at(-1).contradictions).toHaveLength(1); // kept through the explain step and saved
  });
  it("full coverage → no comparison", async () => {
    m.judge.mockResolvedValueOnce({ coverage: "full", materialFacts: facts, missing: [] });
    await run({ searchLibrary: async () => hits });
    expect(m.compare).not.toHaveBeenCalled();
  });
  it("no material → no comparison", async () => {
    await run(undefined);
    expect(m.compare).not.toHaveBeenCalled();
  });
  it("partial without disagreement: no ⚠️ section", async () => {
    m.judge.mockResolvedValueOnce({ coverage: "partial", materialFacts: facts, missing: ["x"] });
    const r = await run({ searchLibrary: async () => hits });
    expect(r.done).not.toContain("⚠️");
  });
  it("Web research failure: partial coverage and a failed web search answer from the material and say so", async () => {
    m.judge.mockResolvedValueOnce({ coverage: "partial", materialFacts: facts, missing: ["a bukás oka"] });
    webResult = failedWeb;
    const r = await run({ searchLibrary: async () => hits });
    expect(r.progress).toContain("⚠️  The web search failed — answering from your material only");
    expect(r.done).toContain("The web search failed, so this answer is based on your material only");
    expect(r.done).toContain("## 📒 From your material");
    expect(r.done).toContain("Magyarázat ebből: 1919. március 21-én kikiáltották"); // explained from the material
    expect(m.compare).not.toHaveBeenCalled(); // nothing to compare with
    expect(m.pad.value.findings.at(-1).webSupplementFailed).toBe(true);
  });
  it("Web research failure: text written from memory without any source counts as a failed search and is not used", async () => {
    m.judge.mockResolvedValueOnce({ coverage: "partial", materialFacts: facts, missing: ["x"] });
    webResult = { ...web, context: "memóriából írt szöveg", sources: [] };
    const r = await run({ searchLibrary: async () => hits });
    expect(r.done).toContain("The web search failed, so this answer is based on your material only");
    expect(r.done).not.toContain("memóriából írt szöveg");
  });
  it("Web research failure: no notice when the web search works", async () => {
    m.judge.mockResolvedValueOnce({ coverage: "partial", materialFacts: facts, missing: ["x"] });
    const r = await run({ searchLibrary: async () => hits });
    expect(r.done).not.toContain("The web search failed");
  });
  it("Web research failure: no notice without material (the old flow is unchanged)", async () => {
    webResult = failedWeb;
    const r = await run(undefined);
    expect(r.done).not.toContain("The web search failed");
  });
  it("Follow-up questions are made self-contained: the standalone question is used to search and judge the material", async () => {
    m.judge.mockResolvedValueOnce({ coverage: "full", materialFacts: facts, missing: [] });
    const search = vi.fn(async () => hits);
    await run({ searchLibrary: search, standaloneQuestion: "Ki volt VIII. Henrik harmadik felesége?" });
    expect(search).toHaveBeenCalledWith("Ki volt VIII. Henrik harmadik felesége?");
    expect(m.judge.mock.calls[0][0]).toBe("Ki volt VIII. Henrik harmadik felesége?");
  });
  it("without a standalone question the raw message is used", async () => {
    m.judge.mockResolvedValueOnce({ coverage: "full", materialFacts: facts, missing: [] });
    const search = vi.fn(async () => hits);
    await run({ searchLibrary: search });
    expect(search).toHaveBeenCalledWith("Mi volt a Tanácsköztársaság?");
  });
});