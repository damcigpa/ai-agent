// Manifest: remembers which library files were processed, and in which version.
// Implements the material-library spec: Unchanged material is not processed again; Changes made outside the app are detected.
// Design (add-material-library): D4.
// The decision "what needs processing" is a pure function (planSync), so it can be
// tested without files, APIs or a vector store.

import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";

export interface ManifestEntry {
  sha256: string;            // content hash of the file when it was processed
  extractedText: string;     // text read from the file (kept so photos are never read twice)
  unreadableParts: string[]; // passages the model could not read (Text in photos is extracted without guessing)
  chunkCount: number;
  processedAt: string;       // ISO date
}

export type Manifest = Record<string, ManifestEntry>; // key: file name in library/

export interface SyncPlan {
  toProcess: string[]; // new or changed files
  unchanged: string[]; // same hash as in the manifest — no API calls for these (Unchanged material is not processed again)
  removed: string[];   // in the manifest but no longer in library/ (Changes made outside the app are detected)
}

// Resolved at call time, not at import time, so tests can pass their own path.
export function defaultManifestPath(): string {
  return resolve(process.cwd(), "data", "manifest.json");
}

export function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

// A missing manifest is normal (first run). A broken one is treated as empty:
// everything gets processed again — slower, but never wrong.
export function readManifest(path: string = defaultManifestPath()): Manifest {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    console.warn(`⚠️  Manifest at ${path} is unreadable — all material will be processed again.`);
    return {};
  }
}

// Written to a temp file first, then renamed: a crash mid-write cannot leave
// a half-written manifest behind.
export function writeManifest(manifest: Manifest, path: string = defaultManifestPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2), "utf-8");
  renameSync(tmp, path);
}

const byName = (a: string, b: string) => a.localeCompare(b, "hu");

// Pure: compares what is in library/ now with what the manifest remembers.
export function planSync(
  libraryFiles: { name: string; sha256: string }[],
  manifest: Manifest,
): SyncPlan {
  const plan: SyncPlan = { toProcess: [], unchanged: [], removed: [] };
  const present = new Set(libraryFiles.map((f) => f.name));

  for (const file of libraryFiles) {
    if (manifest[file.name]?.sha256 === file.sha256) plan.unchanged.push(file.name);
    else plan.toProcess.push(file.name);
  }
  for (const name of Object.keys(manifest)) {
    if (!present.has(name)) plan.removed.push(name);
  }

  plan.toProcess.sort(byName);
  plan.unchanged.sort(byName);
  plan.removed.sort(byName);
  return plan;
}