import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("../client.js", () => ({ client: { messages: { create } } }));
vi.mock("../tokenTracker.js", () => ({ trackUsage: vi.fn() }));

import { compareWithWeb, judgeMaterial } from "./librarySpoke.js";
import type { SearchHit } from "../library/vectorStore.js";

// Real file names: screenshots and generic names, which a model tends to shorten or rewrite.
const SHOT = "Képernyőfotó 2026-10-13 11.20.03.png";
const NOTE = "jegyzet (2).txt";
const hit = (file: string, text: string): SearchHit => ({ file, text, chunkIndex: 0, sourceKind: "text", distance: 0.1 });
const HITS = [hit(SHOT, "Erzsébet 1558-ban lett királynő."), hit(NOTE, "Mária anyja Aragóniai Katalin volt.")];

const reply = (name: string, input: unknown) =>
  create.mockResolvedValueOnce({
    content: [{ type: "tool_use", id: "t", name, input }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });

beforeEach(() => {
  create.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("judgeMaterial — sources by excerpt id", () => {
  it("sends each excerpt with an id and maps the id back to the real file name", async () => {
    reply("judge_material", {
      coverage: "full",
      materialFacts: [
        { fact: "Erzsébet 1558-ban lett királynő.", source: 1 },
        { fact: "Mária anyja Aragóniai Katalin volt.", source: 2 },
      ],
      missing: [],
    });

    const j = await judgeMaterial("q", HITS, "m");
    expect(j.materialFacts.map((f) => f.file)).toEqual([SHOT, NOTE]);

    const sent = create.mock.calls[0][0].messages[0].content as string;
    expect(sent).toContain('<material id="1"');
    expect(sent).toContain('<material id="2"');
  });

  it("accepts an id given as a string", async () => {
    reply("judge_material", { coverage: "full", materialFacts: [{ fact: "x", source: "2" }], missing: [] });
    expect((await judgeMaterial("q", HITS, "m")).materialFacts[0].file).toBe(NOTE);
  });

  it("drops a fact whose id is not one of the excerpts (nothing is wrongly attributed)", async () => {
    reply("judge_material", {
      coverage: "partial",
      materialFacts: [
        { fact: "kept", source: 1 },
        { fact: "unknown id", source: 7 },
        { fact: "no id", source: "Képernyőfotó.png" },
      ],
      missing: ["y"],
    });

    const j = await judgeMaterial("q", HITS, "m");
    expect(j.materialFacts).toEqual([{ fact: "kept", file: SHOT }]);
  });
});

describe("judgeMaterial — two notes that disagree", () => {
  const conflict = { point: "Mária anyja", firstFact: "Mária anyja Boleyn Anna volt.", firstSource: 1, secondFact: "Mária anyja Aragóniai Katalin volt.", secondSource: 2 };

  it("maps both statements of a conflict back to their files", async () => {
    reply("judge_material", { coverage: "full", materialFacts: [{ fact: "x", source: 1 }], missing: [], conflicts: [conflict] });
    const j = await judgeMaterial("q", HITS, "m");
    expect(j.conflicts).toEqual([
      { point: "Mária anyja", first: { fact: "Mária anyja Boleyn Anna volt.", file: SHOT }, second: { fact: "Mária anyja Aragóniai Katalin volt.", file: NOTE } },
    ]);
  });

  it("drops a conflict with an unknown id, with the same excerpt twice, or with an empty text", async () => {
    reply("judge_material", {
      coverage: "full",
      materialFacts: [{ fact: "x", source: 1 }],
      missing: [],
      conflicts: [{ ...conflict, secondSource: 9 }, { ...conflict, secondSource: 1 }, { ...conflict, point: "  " }],
    });
    expect((await judgeMaterial("q", HITS, "m")).conflicts).toEqual([]);
  });

  it("has no conflicts when the model sends none", async () => {
    reply("judge_material", { coverage: "full", materialFacts: [{ fact: "x", source: 1 }], missing: [] });
    expect((await judgeMaterial("q", HITS, "m")).conflicts).toEqual([]);
  });

  it("tells the model what a conflict is, and what is not one", async () => {
    reply("judge_material", { coverage: "full", materialFacts: [{ fact: "x", source: 1 }], missing: [], conflicts: [] });
    await judgeMaterial("q", HITS, "m");
    const call = create.mock.calls[0][0];
    expect(call.system).toContain("conflicts");
    expect(call.tools[0].input_schema.required).toContain("conflicts");
  });
});

describe("judgeMaterial — a list that arrives as text", () => {
  it("parses materialFacts sent as a JSON text instead of a list", async () => {
    reply("judge_material", {
      coverage: "partial",
      materialFacts: JSON.stringify([{ fact: "A „Nincs a teremtésben vesztes” sorokat Madách írta.", source: 2 }]),
      missing: JSON.stringify(["x"]),
    });

    const j = await judgeMaterial("q", HITS, "m");
    expect(j.coverage).toBe("partial");
    expect(j.materialFacts).toEqual([{ fact: "A „Nincs a teremtésben vesztes” sorokat Madách írta.", file: NOTE }]);
    expect(j.missing).toEqual(["x"]);
  });

  it("treats a text that is not a JSON list as no facts", async () => {
    reply("judge_material", { coverage: "partial", materialFacts: "some prose", missing: [] });
    expect((await judgeMaterial("q", HITS, "m")).coverage).toBe("none");
  });
});

describe("compareWithWeb — sources by note id", () => {
  it("maps the note id of a contradiction back to the real file name", async () => {
    reply("report_contradictions", {
      contradictions: [
        { material: "Mária anyja Boleyn Anna.", source: 2, web: "Aragóniai Katalin", likelyCorrect: "web", reason: "r" },
        { material: "bad id", source: 9, web: "w", likelyCorrect: "web", reason: "r" },
      ],
    });

    const facts = [
      { fact: "Erzsébet 1558-ban lett királynő.", file: SHOT },
      { fact: "Mária anyja Boleyn Anna.", file: NOTE },
    ];
    const web = { author: "", work: "", date: "", context: "c", confidence: "high" as const, sources: [], keyFacts: ["k"] };
    const found = await compareWithWeb("q", facts, web, "m");
    expect(found).toHaveLength(1);
    expect(found[0].file).toBe(NOTE);
  });
});