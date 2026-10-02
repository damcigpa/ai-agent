// Topic library: which topics exist and which files they contain.
// Implements specs/topic-quiz/topic-quiz.md — AC-1 to AC-4, AC-10 to AC-12.
// Read-only by design (AC-4): nothing in this module writes to topics/.

import { existsSync, readdirSync } from "fs";
import { extname, join, resolve } from "path";

export const SUPPORTED_EXTENSIONS = [".txt", ".md", ".jpg", ".jpeg", ".png"];

export interface TopicInfo {
  name: string;            
  supportedFiles: string[]; 
  skippedFiles: string[];
}

// Resolved at call time, not at import time, so tests can pass their own dir.
export function defaultTopicsDir(): string {
  return resolve(process.cwd(), "topics");
}

const isHidden = (name: string) => name.startsWith("."); // also covers .gitkeep

// Same name typed or stored differently must still match:
// case (AC-10) and Unicode form (macOS may store "á" as "a" + accent).
const normalizeName = (name: string) => name.normalize("NFC").trim().toLocaleLowerCase("hu");

const byName = (a: string, b: string) => a.localeCompare(b, "hu");

function readTopic(topicsDir: string, name: string): TopicInfo {
  const entries = readdirSync(join(topicsDir, name), { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && !isHidden(e.name)) // subfolders are out of scope (non-goal)
    .map((e) => e.name)
    .sort(byName);

  const isSupported = (f: string) => SUPPORTED_EXTENSIONS.includes(extname(f).toLowerCase());

  return {
    name,
    supportedFiles: files.filter(isSupported),
    skippedFiles: files.filter((f) => !isSupported(f)),
  };
}

// AC-1: every topic, with its files.
export function listTopics(topicsDir: string = defaultTopicsDir()): TopicInfo[] {
  if (!existsSync(topicsDir)) return [];

  return readdirSync(topicsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !isHidden(e.name))
    .map((e) => readTopic(topicsDir, e.name))
    .sort((a, b) => byName(a.name, b.name));
}

// AC-10 / AC-11: find a topic by the name the user typed; null if unknown.
export function findTopic(name: string, topicsDir: string = defaultTopicsDir()): TopicInfo | null {
  const wanted = normalizeName(name);
  return listTopics(topicsDir).find((t) => normalizeName(t.name) === wanted) ?? null;
}