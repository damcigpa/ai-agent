// The text behind the /add and /library commands.
// Implements specs/material-library/material-library.md — AC-1 to AC-6, AC-8.
//
// agent.ts only routes the command here and prints the returned message.
// Everything is injectable (paths, store, extraction), so it can be tested without an API.

import { join } from "path";
import type { ExtractResult } from "./extract.js";
import { defaultPaths, listLibrary, moveInboxToLibrary, type LibraryPaths } from "./files.js";
import { defaultManifestPath, hashFile, planSync, readManifest } from "./manifest.js";
import { syncLibrary } from "./sync.js";
import type { ChunkStore } from "./vectorStore.js";

const SUPPORTED_HINT = ".txt, .md, .jpg, .jpeg or .png";

export interface CommandOptions {
  paths?: LibraryPaths;
  manifestPath?: string;
}

export interface AddOptions extends CommandOptions {
  // Called only when there is something to index, so a missing API key
  // does not break a plain /add of files that are already indexed.
  getStore: () => Promise<ChunkStore>;
  extract?: (filePath: string) => Promise<ExtractResult>;
  onProgress?: (message: string) => void;
}

// What the index still has to do: files that are new or changed, and files that are gone.
function pendingWork({ paths = defaultPaths(), manifestPath = defaultManifestPath() }: CommandOptions) {
  const files = listLibrary(paths).map((name) => ({
    name,
    sha256: hashFile(join(paths.libraryDir, name)),
  }));
  return planSync(files, readManifest(manifestPath));
}

const names = (list: string[]) => list.join(", ");

// AC-1 – AC-6: move the inbox into the library, then index what is new.
export async function handleAdd(options: AddOptions): Promise<string> {
  const { paths = defaultPaths(), manifestPath = defaultManifestPath() } = options;

  const moved = moveInboxToLibrary(paths);
  const pending = pendingWork({ paths, manifestPath });
  const hasPending = pending.toProcess.length > 0 || pending.removed.length > 0;
  const inboxHadNothing =
    !moved.added.length && !moved.unsupported.length && !moved.duplicates.length && !moved.failed.length;

  // AC-5: an empty inbox says where to put files
  if (inboxHadNothing && !hasPending) {
    return `Nothing to add. Put ${SUPPORTED_HINT} files into inbox/ and run /add again.`;
  }

  const lines: string[] = [];
  if (moved.added.length) {
    lines.push(`✅ Added ${moved.added.length} file(s) to the library: ${names(moved.added)}`);
  }

  if (hasPending) {
    try {
      const store = await options.getStore();
      const report = await syncLibrary({
        store,
        paths,
        manifestPath,
        extract: options.extract,
        onProgress: options.onProgress,
      });

      if (report.processed.length) lines.push(`📚 Indexed ${report.processed.length} file(s).`);
      if (report.removed.length) lines.push(`🗑️  No longer in the library, removed from the index: ${names(report.removed)}`);
      for (const { file, reason } of report.failed) {
        lines.push(`⚠️  Could not process ${file}: ${reason} (it stays in the library and is retried on the next /add)`);
      }
    } catch (e) {
      lines.push(
        `⚠️  Could not index the new files: ${e instanceof Error ? e.message : "unknown error"}. ` +
          `They are in the library and are indexed on the next /add.`,
      );
    }
  }

  // AC-3, AC-4: what stayed in the inbox, and why
  if (moved.unsupported.length) {
    lines.push(`⚠️  Not added (unsupported, still in inbox/): ${names(moved.unsupported)} — supported: ${SUPPORTED_HINT}`);
  }
  if (moved.duplicates.length) {
    lines.push(`⚠️  Not added (a file with this name is already in the library, still in inbox/): ${names(moved.duplicates)}`);
  }
  if (moved.failed.length) {
    lines.push(`⚠️  Could not move (still in inbox/): ${names(moved.failed)}`);
  }

  lines.push(`Library: ${listLibrary(paths).length} file(s).`);
  return lines.join("\n");
}

// AC-8: what is in the library, and whether each file is searchable yet.
export function handleLibrary(options: CommandOptions = {}): string {
  const { paths = defaultPaths() } = options;
  const files = listLibrary(paths);

  if (files.length === 0) {
    return `The library is empty. Put ${SUPPORTED_HINT} files into inbox/ and run /add.`;
  }

  const notIndexed = new Set(pendingWork(options).toProcess);
  const lines = files.map((f) => (notIndexed.has(f) ? `  ⚠️  ${f} — not indexed yet (run /add)` : `  ✓ ${f}`));

  return [`📚 Library (${files.length} file(s)):`, ...lines].join("\n");
}