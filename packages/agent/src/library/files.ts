import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { extname, join, resolve } from "path";

export const SUPPORTED_EXTENSIONS = [".txt", ".md", ".jpg", ".jpeg", ".png"];

export interface LibraryPaths {
  inboxDir: string;
  libraryDir: string;
}

// Resolved at call time, not at import time, so tests can pass their own folders.
export function defaultPaths(): LibraryPaths {
  return {
    inboxDir: resolve(process.cwd(), "inbox"),
    libraryDir: resolve(process.cwd(), "library"),
  };
}

export interface AddResult {
  added: string[];       
  unsupported: string[]; 
  duplicates: string[];  
  failed: string[];
}

const isHidden = (name: string) => name.startsWith("."); // also covers .gitkeep
const byName = (a: string, b: string) => a.localeCompare(b, "hu");

export const isSupported = (name: string) =>
  SUPPORTED_EXTENSIONS.includes(extname(name).toLowerCase());

// "Oldal1.JPG" and "oldal1.jpg" count as the same name on every OS
// (macOS treats them as the same file anyway; Linux would not).
const sameNameKey = (name: string) => name.normalize("NFC").toLocaleLowerCase("hu");

// AC-8: supported files in the library, sorted by name.
export function listLibrary(paths: LibraryPaths = defaultPaths()): string[] {
  if (!existsSync(paths.libraryDir)) return [];
  return readdirSync(paths.libraryDir, { withFileTypes: true })
    .filter((e) => e.isFile() && !isHidden(e.name) && isSupported(e.name))
    .map((e) => e.name)
    .sort(byName);
}

// AC-1 – AC-5: move every supported file from the inbox into the library.
export function moveInboxToLibrary(paths: LibraryPaths = defaultPaths()): AddResult {
  const result: AddResult = { added: [], unsupported: [], duplicates: [], failed: [] };
  if (!existsSync(paths.inboxDir)) return result;

  mkdirSync(paths.libraryDir, { recursive: true });
  const existing = new Set(
    readdirSync(paths.libraryDir).map(sameNameKey),
  );

  const entries = readdirSync(paths.inboxDir, { withFileTypes: true })
    .filter((e) => !isHidden(e.name))
    .sort((a, b) => byName(a.name, b.name));

  for (const entry of entries) {
    const name = entry.name;

    if (!entry.isFile()) {
      result.unsupported.push(`${name}/`);
      continue;
    }
    if (!isSupported(name)) {
      result.unsupported.push(name);
      continue;
    }
    if (existing.has(sameNameKey(name))) {
      result.duplicates.push(name);
      continue;
    }

    try {
      // COPYFILE_EXCL: fail instead of overwriting, even if a file appeared meanwhile (AC-4)
      copyFileSync(join(paths.inboxDir, name), join(paths.libraryDir, name), constants.COPYFILE_EXCL);
      unlinkSync(join(paths.inboxDir, name));
      existing.add(sameNameKey(name));
      result.added.push(name);
    } catch {
      result.failed.push(name);
    }
  }

  return result;
}