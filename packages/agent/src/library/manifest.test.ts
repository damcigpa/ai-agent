// Verifies specs/material-library/material-library.plan.md — TD-4 (serves AC-9, AC-10).
// Real files in a temp folder, no API.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { hashFile, readManifest, writeManifest, planSync, type Manifest, type ManifestEntry } from "./manifest.js";

let root: string;
let manifestPath: string;

const entry = (sha256: string): ManifestEntry => ({
  sha256,
  extractedText: "szöveg",
  unreadableParts: [],
  chunkCount: 1,
  processedAt: "2026-10-02T12:00:00.000Z",
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "manifest-test-"));
  manifestPath = join(root, "data", "manifest.json");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("hashFile", () => {
  it("gives the same hash for the same content and a different one for changed content", () => {
    const a = join(root, "a.txt");
    const b = join(root, "b.txt");
    writeFileSync(a, "Mohács, 1526");
    writeFileSync(b, "Mohács, 1526");
    const before = hashFile(a);

    expect(hashFile(b)).toBe(before);
    writeFileSync(a, "Mohács, 1527");
    expect(hashFile(a)).not.toBe(before);
  });
});

describe("readManifest / writeManifest", () => {
  it("returns an empty manifest when there is none yet (first run)", () => {
    expect(readManifest(manifestPath)).toEqual({});
  });

  it("A-3: what is written can be read back after a restart", () => {
    const manifest: Manifest = { "jegyzet.txt": entry("abc") };

    writeManifest(manifest, manifestPath); // also creates the data/ folder

    expect(readManifest(manifestPath)).toEqual(manifest);
  });

  it("leaves no temp file behind", () => {
    writeManifest({ "a.txt": entry("abc") }, manifestPath);

    expect(readdirSync(join(root, "data"))).toEqual(["manifest.json"]);
  });

  it("treats a broken manifest as empty, so everything is processed again", () => {
    writeManifest({}, manifestPath);
    writeFileSync(manifestPath, "{ not json");

    expect(readManifest(manifestPath)).toEqual({});
  });
});

describe("planSync", () => {
  it("AC-9: an unchanged file is not processed again", () => {
    const plan = planSync([{ name: "a.txt", sha256: "h1" }], { "a.txt": entry("h1") });

    expect(plan).toEqual({ toProcess: [], unchanged: ["a.txt"], removed: [] });
  });

  it("a new file is processed", () => {
    const plan = planSync([{ name: "uj.txt", sha256: "h1" }], {});

    expect(plan).toEqual({ toProcess: ["uj.txt"], unchanged: [], removed: [] });
  });

  it("AC-10: a file changed by hand is processed again", () => {
    const plan = planSync([{ name: "a.txt", sha256: "uj-hash" }], { "a.txt": entry("regi-hash") });

    expect(plan.toProcess).toEqual(["a.txt"]);
  });

  it("AC-10: a file removed by hand is reported as removed", () => {
    const plan = planSync([], { "torolt.jpg": entry("h1") });

    expect(plan).toEqual({ toProcess: [], unchanged: [], removed: ["torolt.jpg"] });
  });

  it("handles all cases together, with sorted results", () => {
    const plan = planSync(
      [
        { name: "c-uj.txt", sha256: "h3" },
        { name: "b-valtozott.txt", sha256: "uj" },
        { name: "a-ugyanaz.txt", sha256: "h1" },
      ],
      {
        "a-ugyanaz.txt": entry("h1"),
        "b-valtozott.txt": entry("regi"),
        "d-torolt.txt": entry("h4"),
      },
    );

    expect(plan).toEqual({
      toProcess: ["b-valtozott.txt", "c-uj.txt"],
      unchanged: ["a-ugyanaz.txt"],
      removed: ["d-torolt.txt"],
    });
  });

  it("does nothing for an empty library and an empty manifest", () => {
    expect(planSync([], {})).toEqual({ toProcess: [], unchanged: [], removed: [] });
  });
});