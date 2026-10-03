// Where the material library lives, and a few helpers shared by the library API routes.
// The web app and the CLI use the same folders (one user, one shared library).

import { join, resolve } from "path";
import { isSupported } from "@exam-prep/agent/src/library/files";

// LIBRARY_ROOT defaults to the agent package: `next` runs in packages/web, so ../agent.
function root() {
  return resolve(process.env.LIBRARY_ROOT ?? "../agent");
}

export function libraryOptions() {
  const base = root();
  return {
    paths: { inboxDir: join(base, "inbox"), libraryDir: join(base, "library") },
    manifestPath: join(base, "data", "manifest.json"),
  };
}

// Created on demand: listing the library needs no API key, indexing does.
export async function getStore() {
  const { openChunkStore, createVoyageEmbedder } = await import(
    "@exam-prep/agent/src/library/vectorStore"
  );
  return openChunkStore(await createVoyageEmbedder(), join(root(), "data", "lancedb"));
}

// Uploaded names are written to disk, so only plain, visible, supported file names are accepted.
export function isValidUploadName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 200 &&
    !/[\\/\0]/.test(name) &&
    !name.startsWith(".") &&
    isSupported(name)
  );
}

// One library operation at a time (two uploads at once would index the same files twice).
let busy = false;

export class LibraryBusyError extends Error {}

export async function withLibraryLock<T>(work: () => Promise<T>): Promise<T> {
  if (busy) throw new LibraryBusyError("The library is busy, try again in a moment.");
  busy = true;
  try {
    return await work();
  } finally {
    busy = false;
  }
}