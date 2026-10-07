// Verifies the material-library spec: Unchanged material is not processed again; Changes made outside the app are detected.
// Verifies the material-answers spec: No relevant material changes nothing.
// Design (add-material-library): D2.
// Real LanceDB in a temp folder, fake embeddings: no network, no cost.

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { openChunkStore, type ChunkStore } from "./vectorStore.js";

// Fake "meaning": one dimension per topic word. Text mentioning a word points that way.
const WORDS = ["mohács", "petőfi", "fotoszintézis", "reformáció"];
const vectorFor = (text: string) => {
  const t = text.toLowerCase();
  const v = WORDS.map((w) => (t.includes(w) ? 1 : 0));
  return v.some((x) => x) ? v : WORDS.map(() => 0.01); // never an all-zero vector
};

let root: string;
let dbDir: string;
let store: ChunkStore;
let embedDocuments: Mock<(texts: string[]) => Promise<number[][]>>;
let embedQuery: Mock<(text: string) => Promise<number[]>>;

const text = (t: string) => ({ text: t, sourceKind: "text" as const });
const filesFor = async (query: string, k = 10) => (await store.search(query, k)).map((h) => h.file).sort();

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "vectorstore-test-"));
  dbDir = join(root, "lancedb");
  embedDocuments = vi.fn(async (texts: string[]) => texts.map(vectorFor));
  embedQuery = vi.fn(async (t: string) => vectorFor(t));
  store = openChunkStore({ embedDocuments, embedQuery }, dbDir);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("search", () => {
  it("finds the chunk closest in meaning first", async () => {
    await store.replaceFile("a.txt", "h1", [text("A mohácsi csata 1526-ban volt.")]);
    await store.replaceFile("b.txt", "h2", [text("Petőfi a Nemzeti dalt írta.")]);
    await store.replaceFile("c.txt", "h3", [text("A fotoszintézis a növényekben zajlik.")]);

    const hits = await store.search("mi történt Mohács mellett?", 3);

    expect(hits[0]).toMatchObject({ file: "a.txt", chunkIndex: 0, sourceKind: "text", text: "A mohácsi csata 1526-ban volt." });
    expect(hits[0].distance).toBeLessThan(hits[1].distance);
  });

  it("returns at most k hits", async () => {
    await store.replaceFile("a.txt", "h1", [text("mohács 1"), text("mohács 2"), text("mohács 3")]);

    expect(await store.search("mohács", 2)).toHaveLength(2);
  });

  it("No relevant material changes nothing: an empty index returns no hits and embeds nothing", async () => {
    expect(await store.search("mohács", 5)).toEqual([]);
    expect(embedQuery).not.toHaveBeenCalled();
  });

  it("returns no hits for k = 0", async () => {
    await store.replaceFile("a.txt", "h1", [text("mohács")]);

    expect(await store.search("mohács", 0)).toEqual([]);
  });

  it("keeps the order and the kind of the chunks of one file", async () => {
    await store.replaceFile("oldal.jpg", "h1", [
      { text: "petőfi első rész", sourceKind: "image" },
      { text: "petőfi második rész", sourceKind: "image" },
    ]);

    const hits = await store.search("petőfi", 5);

    expect(hits.map((h) => h.chunkIndex).sort()).toEqual([0, 1]);
    expect(hits.every((h) => h.sourceKind === "image")).toBe(true);
  });
});

describe("replaceFile", () => {
  it("Changes made outside the app are detected: a changed file replaces its old chunks", async () => {
    await store.replaceFile("a.txt", "h1", [text("mohács régi szöveg")]);
    await store.replaceFile("a.txt", "h2", [text("petőfi új szöveg")]);

    expect((await store.search("mohács", 10)).map((h) => h.text)).toEqual(["petőfi új szöveg"]);
  });

  it("indexing the same file twice never leaves duplicates (a lost manifest is harmless)", async () => {
    await store.replaceFile("a.txt", "h1", [text("mohács"), text("mohács 2")]);
    await store.replaceFile("a.txt", "h1", [text("mohács"), text("mohács 2")]);

    expect(await store.search("mohács", 10)).toHaveLength(2);
  });

  it("does not touch the chunks of other files", async () => {
    await store.replaceFile("a.txt", "h1", [text("mohács")]);
    await store.replaceFile("b.txt", "h2", [text("petőfi")]);
    await store.replaceFile("a.txt", "h3", [text("reformáció")]);

    expect(await filesFor("petőfi")).toContain("b.txt");
  });

  it("an empty chunk list removes the file's chunks", async () => {
    await store.replaceFile("a.txt", "h1", [text("mohács")]);
    await store.replaceFile("a.txt", "h2", []);

    expect(await store.search("mohács", 10)).toEqual([]);
  });

  it("if embedding fails, the old chunks stay", async () => {
    await store.replaceFile("a.txt", "h1", [text("mohács régi")]);
    embedDocuments.mockRejectedValueOnce(new Error("429 rate limit"));

    await expect(store.replaceFile("a.txt", "h2", [text("új")])).rejects.toThrow("429");
    expect((await store.search("mohács", 10))[0].text).toBe("mohács régi");
  });

  it("fails loudly if the embedder returns the wrong number of vectors", async () => {
    embedDocuments.mockResolvedValueOnce([[1, 0, 0, 0]]);

    await expect(store.replaceFile("a.txt", "h1", [text("egy"), text("kettő")])).rejects.toThrow("2 chunks");
  });
});

describe("deleteFile", () => {
  it("Changes made outside the app are detected: a removed file disappears from search", async () => {
    await store.replaceFile("a.txt", "h1", [text("mohács")]);
    await store.replaceFile("b.txt", "h2", [text("mohács más")]);

    await store.deleteFile("a.txt");

    expect(await filesFor("mohács")).toEqual(["b.txt"]);
  });

  it("is a no-op for an unknown file, also before anything is indexed", async () => {
    await expect(store.deleteFile("nincs.txt")).resolves.toBeUndefined();
    await store.replaceFile("a.txt", "h1", [text("mohács")]);
    await expect(store.deleteFile("nincs.txt")).resolves.toBeUndefined();

    expect(await filesFor("mohács")).toEqual(["a.txt"]);
  });

  it("handles file names with apostrophes", async () => {
    await store.replaceFile("Lajos' jegyzete.txt", "h1", [text("mohács")]);
    await store.replaceFile("b.txt", "h2", [text("mohács más")]);

    await store.deleteFile("Lajos' jegyzete.txt");

    expect(await filesFor("mohács")).toEqual(["b.txt"]);
  });
});

describe("persistence", () => {
  it("Unchanged material is not processed again: the index survives a restart", async () => {
    await store.replaceFile("a.txt", "h1", [text("A mohácsi csata 1526-ban volt.")]);

    const afterRestart = openChunkStore({ embedDocuments, embedQuery }, dbDir);

    expect((await afterRestart.search("mohács", 5)).map((h) => h.file)).toEqual(["a.txt"]);
  });
});
