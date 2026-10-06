// Sync: brings the search index in line with the files in library/.
// Implements the material-library spec: Processing with progress, per-file failures; Unchanged material is not processed again; Changes made outside the app are detected; Text in photos is extracted without guessing.
// Design (add-material-library): D4.
//
// For each library file: unchanged → skipped (no API calls); new or changed → text is
// extracted, split into chunks, embedded and indexed; removed → its chunks are deleted.
// Never throws because of a single file: failures are reported by name and the rest goes on.

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { join } from "path";
import { extractText, type ExtractResult } from "./extract.js";
import { defaultPaths, listLibrary, type LibraryPaths } from "./files.js";
import {
  defaultManifestPath,
  hashFile,
  planSync,
  readManifest,
  writeManifest,
  type Manifest,
} from "./manifest.js";
import type { ChunkStore } from "./vectorStore.js";

// Tuned later with the evals (plan T10). Handwritten notes are short and dense.
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

export interface SyncOptions {
  store: ChunkStore;
  paths?: LibraryPaths;
  manifestPath?: string;
  extract?: (filePath: string) => Promise<ExtractResult>;
  onProgress?: (message: string) => void;
}

export interface SyncReport {
  processed: string[]; // new or changed files that are now indexed
  unchanged: string[]; // skipped — no extraction, no embedding (Unchanged material is not processed again)
  removed: string[];   // gone from library/, chunks deleted (Changes made outside the app are detected)
  failed: { file: string; reason: string }[]; // reported by name (Processing with progress, per-file failures)
}

export async function syncLibrary(options: SyncOptions): Promise<SyncReport> {
  const {
    store,
    paths = defaultPaths(),
    manifestPath = defaultManifestPath(),
    extract = (filePath: string) => extractText(filePath),
    onProgress = () => {},
  } = options;

  const files = listLibrary(paths).map((name) => ({
    name,
    sha256: hashFile(join(paths.libraryDir, name)),
  }));
  const manifest: Manifest = readManifest(manifestPath);
  const plan = planSync(files, manifest);
  const hashOf = new Map(files.map((f) => [f.name, f.sha256]));

  const report: SyncReport = { processed: [], unchanged: plan.unchanged, removed: [], failed: [] };

  // A file whose index entry cannot be trusted any more is dropped completely,
  // so answers never come from text that no longer matches the file.
  const forget = async (file: string) => {
    try {
      await store.deleteFile(file);
    } catch {
      // nothing more can be done here; the file is reprocessed on the next sync anyway
    }
    delete manifest[file];
    writeManifest(manifest, manifestPath);
  };

  // Changes made outside the app are detected: removed by hand outside the app
  for (const file of plan.removed) {
    await forget(file);
    report.removed.push(file);
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  for (const [i, file] of plan.toProcess.entries()) {
    onProgress(`Processing ${i + 1} of ${plan.toProcess.length}: ${file}`);

    const extracted = await extract(join(paths.libraryDir, file));
    // `=== false` instead of `!extracted.ok`: without "strict" in tsconfig, TypeScript only
    // narrows the result type this way.
    if (extracted.ok === false) {
      await forget(file);
      report.failed.push({ file, reason: extracted.reason });
      continue;
    }

    try {
      const pieces = await splitter.splitText(extracted.text);
      await store.replaceFile(
        file,
        hashOf.get(file)!,
        pieces.map((text) => ({ text, sourceKind: extracted.sourceKind })),
      );

      // Written after every file: a crash halfway keeps the progress made so far.
      manifest[file] = {
        sha256: hashOf.get(file)!,
        extractedText: extracted.text,
        unreadableParts: extracted.unreadableParts,
        chunkCount: pieces.length,
        processedAt: new Date().toISOString(),
      };
      writeManifest(manifest, manifestPath);
      report.processed.push(file);
    } catch (e) {
      await forget(file);
      report.failed.push({ file, reason: e instanceof Error ? e.message : "unknown error" });
    }
  }

  return report;
}