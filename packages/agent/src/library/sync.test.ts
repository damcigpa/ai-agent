// Verifies the material-library spec: Processing with progress, per-file failures; Unchanged material is not processed again; Changes made outside the app are detected; Text in photos is extracted without guessing.
// Design (add-material-library): D4.
// Real files and real LanceDB in temp folders; fake extraction and fake embeddings: no network, no cost.

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";
import { syncLibrary } from "./sync.js";
import { readManifest } from "./manifest.js";
import { openChunkStore, type ChunkStore } from "./vectorStore.js";
import type { ExtractResult } from "./extract.js";
import type { LibraryPaths } from "./files.js";

const WORDS = ["mohács", "petőfi", "fotoszintézis", "reformáció"];
const vectorFor = (text: string) => {
  const t = text.toLowerCase();
  const v = WORDS.map((w) => (t.includes(w) ? 1 : 0));
  return v.some((x) => x) ? v : WORDS.map(() => 0.01);
};

let root: string;
let paths: LibraryPaths;
let manifestPath: string;
let dbDir: string;
let store: ChunkStore;
let embedDocuments: Mock<(texts: string[]) => Promise<number[][]>>;
let extract: Mock<(filePath: string) => Promise<ExtractResult>>;
let progress: string[];

const embedder = () => ({ embedDocuments, embedQuery: async (t: string) => vectorFor(t) });
const addFile = (name: string, content: string) => writeFileSync(join(paths.libraryDir, name), content);
const sync = () => syncLibrary({ store, paths, manifestPath, extract, onProgress: (m) => progress.push(m) });
const filesFor = async (q: string) => (await store.search(q, 50)).map((h) => h.file).sort();
const manifest = () => readManifest(manifestPath);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sync-test-"));
  paths = { inboxDir: join(root, "inbox"), libraryDir: join(root, "library") };
  mkdirSync(paths.libraryDir);
  manifestPath = join(root, "data", "manifest.json");
  dbDir = join(root, "data", "lancedb");

  embedDocuments = vi.fn(async (texts: string[]) => texts.map(vectorFor));
  store = openChunkStore(embedder(), dbDir);

  // Fake extraction: the file content is its text. Names with "homaly" cannot be read,
  // names with "foltos" have an unreadable part.
  extract = vi.fn(async (path: string): Promise<ExtractResult> => {
    if (basename(path).includes("homaly")) return { ok: false, reason: "no readable text found in the image" };
    return {
      ok: true,
      text: readFileSync(path, "utf-8"),
      unreadableParts: basename(path).includes("foltos") ? ["egy szó a második sorban"] : [],
      sourceKind: "text",
    };
  });
  progress = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("first sync", () => {
  it("indexes new files and records them in the manifest", async () => {
    addFile("a.txt", "A mohácsi csata 1526-ban volt.");
    addFile("b.txt", "Petőfi a Nemzeti dalt írta.");

    const report = await sync();

    expect(report).toEqual({ processed: ["a.txt", "b.txt"], unchanged: [], removed: [], failed: [] });
    expect((await store.search("mohács", 1))[0].file).toBe("a.txt");
    expect(Object.keys(manifest())).toEqual(["a.txt", "b.txt"]);
    expect(manifest()["a.txt"]).toMatchObject({ extractedText: "A mohácsi csata 1526-ban volt.", chunkCount: 1 });
  });

  it("an empty library gives an empty report and calls nothing", async () => {
    expect(await sync()).toEqual({ processed: [], unchanged: [], removed: [], failed: [] });
    expect(extract).not.toHaveBeenCalled();
    expect(embedDocuments).not.toHaveBeenCalled();
  });

  it("splits long text into several chunks", async () => {
    addFile("hosszu.txt", Array.from({ length: 60 }, (_, i) => `Mohács ${i}. mondat a csatáról.`).join(" "));

    await sync();

    const chunks = manifest()["hosszu.txt"].chunkCount;
    expect(chunks).toBeGreaterThan(1);
    expect(await store.search("mohács", 50)).toHaveLength(chunks);
  });

  it("Text in photos is extracted without guessing: the unreadable parts are kept", async () => {
    addFile("foltos.txt", "Petőfi [olvashatatlan] verse.");

    await sync();

    expect(manifest()["foltos.txt"].unreadableParts).toEqual(["egy szó a második sorban"]);
  });

  it("Processing with progress, per-file failures: progress is reported per file", async () => {
    addFile("a.txt", "mohács");
    addFile("b.txt", "petőfi");

    await sync();

    expect(progress).toEqual(["Processing 1 of 2: a.txt", "Processing 2 of 2: b.txt"]);
  });
});

describe("later syncs", () => {
  it("Unchanged material is not processed again: no extraction and no embedding", async () => {
    addFile("a.txt", "A mohácsi csata 1526-ban volt.");
    await sync();
    extract.mockClear();
    embedDocuments.mockClear();

    expect(await sync()).toEqual({ processed: [], unchanged: ["a.txt"], removed: [], failed: [] });
    expect(extract).not.toHaveBeenCalled();
    expect(embedDocuments).not.toHaveBeenCalled();
  });

  it("Unchanged material is not processed again: also after a restart", async () => {
    addFile("a.txt", "mohács");
    await sync();
    extract.mockClear();

    store = openChunkStore(embedder(), dbDir);

    expect((await sync()).unchanged).toEqual(["a.txt"]);
    expect(extract).not.toHaveBeenCalled();
  });

  it("Changes made outside the app are detected: a changed file is processed again, its old text is gone", async () => {
    addFile("a.txt", "A mohácsi csata régi szöveg.");
    await sync();
    addFile("a.txt", "Petőfi új szöveg.");

    expect((await sync()).processed).toEqual(["a.txt"]);
    expect((await store.search("mohács", 10)).map((h) => h.text)).toEqual(["Petőfi új szöveg."]);
    expect(manifest()["a.txt"].extractedText).toBe("Petőfi új szöveg.");
  });

  it("Changes made outside the app are detected: a removed file leaves search and the manifest", async () => {
    addFile("a.txt", "mohács");
    addFile("b.txt", "mohács más");
    await sync();
    rmSync(join(paths.libraryDir, "a.txt"));

    expect((await sync()).removed).toEqual(["a.txt"]);
    expect(await filesFor("mohács")).toEqual(["b.txt"]);
    expect(Object.keys(manifest())).toEqual(["b.txt"]);
  });

  it("only the new file is processed when one is added", async () => {
    addFile("a.txt", "mohács");
    await sync();
    extract.mockClear();
    addFile("b.txt", "petőfi");

    expect(await sync()).toMatchObject({ processed: ["b.txt"], unchanged: ["a.txt"] });
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("a lost manifest means processing again, but never duplicates in the index", async () => {
    addFile("a.txt", "A mohácsi csata.");
    await sync();
    rmSync(manifestPath);

    expect((await sync()).processed).toEqual(["a.txt"]);
    expect(await store.search("mohács", 10)).toHaveLength(1);
  });
});

describe("failures", () => {
  it("Processing with progress, per-file failures: an unreadable file is reported by name, the others are indexed", async () => {
    addFile("a.txt", "A mohácsi csata.");
    addFile("homalyos.txt", "nem olvasható");
    addFile("z.txt", "Petőfi.");

    const report = await sync();

    expect(report.processed).toEqual(["a.txt", "z.txt"]);
    expect(report.failed).toEqual([{ file: "homalyos.txt", reason: "no readable text found in the image" }]);
    expect(Object.keys(manifest())).toEqual(["a.txt", "z.txt"]);
  });

  it("Processing with progress, per-file failures: an embedding failure hits only that file", async () => {
    addFile("a.txt", "mohács");
    addFile("b.txt", "petőfi");
    embedDocuments.mockRejectedValueOnce(new Error("429 rate limit"));

    const report = await sync();

    expect(report.failed).toEqual([{ file: "a.txt", reason: "429 rate limit" }]);
    expect(report.processed).toEqual(["b.txt"]);
    expect(await filesFor("petőfi")).toContain("b.txt");
  });

  it("a failed file is tried again on the next sync", async () => {
    addFile("a.txt", "mohács");
    embedDocuments.mockRejectedValueOnce(new Error("429 rate limit"));
    await sync();

    expect((await sync()).processed).toEqual(["a.txt"]);
    expect(await filesFor("mohács")).toEqual(["a.txt"]);
  });

  it("a changed file that now fails does not leave its outdated text searchable", async () => {
    addFile("a.txt", "A mohácsi csata régi szöveg.");
    await sync();
    addFile("a.txt", "mohács, de ezt már nem tudja kiolvasni");
    extract.mockResolvedValueOnce({ ok: false, reason: "no readable text found in the image" });

    const report = await sync();

    expect(report.failed.map((f) => f.file)).toEqual(["a.txt"]);
    expect(await store.search("mohács", 10)).toEqual([]);
    expect(manifest()["a.txt"]).toBeUndefined();
  });
});
