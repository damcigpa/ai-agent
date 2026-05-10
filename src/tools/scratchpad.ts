import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { createError, formatError } from "../errors.js";
import { ResearchFindings, Subject } from "../types.js";
import { AnalysisFindings } from "../spokes/analyzeSpoke.js";

const SCRATCHPAD_PATH = "./scratchpad.json";

export interface Scratchpad {
  sessionId: string;
  subject: Subject;
  topic: string;
  findings: ResearchFindings[];
  analysis: AnalysisFindings[];
  conversationTopics: string[];
  lastUpdated: string;
}

export function readScratchpad(): Scratchpad | null {
  try {
    if (!existsSync(SCRATCHPAD_PATH)) return null;
    const raw = readFileSync(SCRATCHPAD_PATH, "utf-8");
    return JSON.parse(raw) as Scratchpad;
  } catch (e) {
    const error = createError(
      "FILE_READ_FAILED",
      "fileSpoke",
      "Failed to read scratchpad",
      { cause: e },
    );
    console.error(formatError(error));
    return null;
  }
}

export function writeScratchpad(data: Scratchpad): void {
  try {
    writeFileSync(SCRATCHPAD_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    const error = createError(
      "FILE_WRITE_FAILED",
      "fileSpoke",
      "Failed to write scratchpad",
      { cause: e },
    );
    console.error(formatError(error));
  }
}

export function resetScratchpad(): void {
  try {
    if (existsSync(SCRATCHPAD_PATH)) {
      unlinkSync(SCRATCHPAD_PATH);
      console.log("  🗑️  Scratchpad reset — new topic detected");
    }
  } catch (e) {
    const error = createError(
      "FILE_WRITE_FAILED",
      "fileSpoke",
      "Failed to reset scratchpad",
      { cause: e },
    );
    console.error(formatError(error));
  }
}

export function updateScratchpad(
  current: Scratchpad | null,
  updates: Partial<Scratchpad>,
): Scratchpad {
  const base: Scratchpad = current ?? {
    sessionId: Date.now().toString(),
    subject: "general",
    topic: "",
    findings: [],
    analysis: [],
    conversationTopics: [],
    lastUpdated: new Date().toISOString(),
  };

  const updated: Scratchpad = {
    ...base,
    ...updates,
    lastUpdated: new Date().toISOString(),
  };

  writeScratchpad(updated);
  return updated;
}
