// Verifies specs/import.md — Layer 1 (real file system, no API).
// Covers: AC-4, AC-5, AC-6, AC-7, AC-8 (reading part), AC-13 (cleanup part).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let root: string;
let materialsDir: string;

// MATERIALS_DIR is computed from process.cwd() when the module is loaded,
// so cwd must point at the temp dir *during* the import — and only then.
async function loadModule() {
  vi.resetModules();
  const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
  try {
    return await import("./readMaterial.js");
  } finally {
    cwdSpy.mockRestore();
  }
}

function addFile(name: string, content: string | Buffer = "content") {
  writeFileSync(join(materialsDir, name), content);
}

function filenamesOf(results: { filename: string }[]) {
  // readdirSync order is not guaranteed (spec Q-5), so compare sorted.
  return results.map((r) => r.filename).sort();
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "materials-test-"));
  materialsDir = join(root, "materials");
  mkdirSync(materialsDir);
  // the module logs skipped/failed files; keep test output clean
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("readAllMaterials", () => {
  it("AC-4: reads .txt and .md as UTF-8 text", async () => {
    addFile("notes.txt", "Mohács, 1526 – árvíztűrő tükörfúrógép");
    addFile("summary.md", "# Fejezet");
    const { readAllMaterials } = await loadModule();

    const results = readAllMaterials();

    expect(results).toHaveLength(2);
    expect(results).toContainEqual({
      filename: "notes.txt",
      content: { kind: "text", text: "Mohács, 1526 – árvíztűrő tükörfúrógép" },
    });
    expect(results).toContainEqual({
      filename: "summary.md",
      content: { kind: "text", text: "# Fejezet" },
    });
  });

  it("AC-4: reads .jpg, .jpeg and .png as base64 images with the right media type", async () => {
    const bytes = Buffer.from([1, 2, 3]); // base64: "AQID"
    addFile("a.jpg", bytes);
    addFile("b.jpeg", bytes);
    addFile("c.png", bytes);
    const { readAllMaterials } = await loadModule();

    const results = readAllMaterials();

    expect(results).toContainEqual({
      filename: "a.jpg",
      content: { kind: "image", mediaType: "image/jpeg", base64: "AQID" },
    });
    expect(results).toContainEqual({
      filename: "b.jpeg",
      content: { kind: "image", mediaType: "image/jpeg", base64: "AQID" },
    });
    expect(results).toContainEqual({
      filename: "c.png",
      content: { kind: "image", mediaType: "image/png", base64: "AQID" },
    });
  });

  it("AC-4: matches extensions case-insensitively", async () => {
    addFile("PAGE1.PNG", Buffer.from([1, 2, 3]));
    addFile("NOTES.TXT", "x");
    const { readAllMaterials } = await loadModule();

    expect(filenamesOf(readAllMaterials())).toEqual(["NOTES.TXT", "PAGE1.PNG"]);
  });

  it("AC-5: never returns .gitkeep or hidden files", async () => {
    addFile(".gitkeep", "");
    addFile(".DS_Store", "junk");
    addFile("notes.txt", "x");
    const { readAllMaterials } = await loadModule();

    expect(filenamesOf(readAllMaterials())).toEqual(["notes.txt"]);
  });

  it("AC-6: skips unsupported files but still returns the supported ones", async () => {
    addFile("notes.txt", "x");
    addFile("chapter.pdf", "%PDF-1.7");
    const { readAllMaterials } = await loadModule();

    expect(filenamesOf(readAllMaterials())).toEqual(["notes.txt"]);
  });

  it("AC-7: skips an entry that fails to read and keeps going", async () => {
    // a directory with a supported extension: readFileSync throws EISDIR
    mkdirSync(join(materialsDir, "broken.txt"));
    addFile("notes.txt", "x");
    const { readAllMaterials } = await loadModule();

    expect(filenamesOf(readAllMaterials())).toEqual(["notes.txt"]);
  });

  it("AC-8: returns an empty list when the folder holds only unsupported files", async () => {
    addFile("chapter.pdf", "%PDF-1.7");
    addFile(".gitkeep", "");
    const { readAllMaterials } = await loadModule();

    expect(readAllMaterials()).toEqual([]);
  });

  it("AC-8: returns an empty list when the materials folder does not exist", async () => {
    rmSync(materialsDir, { recursive: true });
    const { readAllMaterials } = await loadModule();

    expect(readAllMaterials()).toEqual([]);
  });
});

describe("clearMaterials", () => {
  it("AC-13: deletes supported, unsupported and hidden files but keeps .gitkeep", async () => {
    addFile(".gitkeep", "");
    addFile("notes.txt", "x");
    addFile("page.png", Buffer.from([1]));
    addFile("chapter.pdf", "%PDF-1.7");
    addFile(".DS_Store", "junk");
    const { clearMaterials } = await loadModule();

    clearMaterials();

    expect(readdirSync(materialsDir)).toEqual([".gitkeep"]);
  });

  it("AC-13: does nothing and does not throw when the folder does not exist", async () => {
    rmSync(materialsDir, { recursive: true });
    const { clearMaterials } = await loadModule();

    expect(() => clearMaterials()).not.toThrow();
  });
});