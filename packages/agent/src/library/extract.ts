// Extract: turns one library file into plain text.
// Implements the material-library spec: Text in photos is extracted without guessing.
// (and Processing with progress, per-file failures: a file that cannot be processed is reported, it does not stop the others).
//
// Text files are read directly. Photos are read by the model (vision), which is
// told to transcribe and never guess. Never throws: failures come back as a result.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { basename, extname } from "path";
import { client } from "../client.js";
import { trackUsage } from "../tokenTracker.js";
import { createError, formatError } from "../errors.js";

export const UNREADABLE_MARKER = "[olvashatatlan]";

export type ExtractResult =
  | { ok: true; text: string; unreadableParts: string[]; sourceKind: "text" | "image" }
  | { ok: false; reason: string };

const IMAGE_TYPES: Record<string, "image/jpeg" | "image/png"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

const TEXT_TYPES = [".txt", ".md"];

const SYSTEM_PROMPT = `You transcribe photos of a student's study material (handwritten notes, textbook pages).
Rules:
- Transcribe exactly what is written, in the original language. Do not translate, summarize or explain.
- Never guess. If a word or passage cannot be read with confidence, write ${UNREADABLE_MARKER} in its place and list the surrounding passage in unreadableParts.
- Keep the structure: headings, bullet points, numbered lists, tables as plain text.
- Do not add facts that are not on the page, even if you know them.
- If the image contains no readable text, return an empty text.`;

const tools: Anthropic.Tool[] = [
  {
    name: "submit_transcription",
    description: "Submit the transcription of the photo",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The transcribed text" },
        unreadableParts: {
          type: "array",
          items: { type: "string" },
          description: `Short descriptions of passages replaced by ${UNREADABLE_MARKER}`,
        },
      },
      required: ["text", "unreadableParts"],
    },
  },
];

export async function extractText(
  filePath: string,
  model: string = "claude-haiku-4-5-20251001",
  signal?: AbortSignal,
): Promise<ExtractResult> {
  const name = basename(filePath);
  const ext = extname(filePath).toLowerCase();

  try {
    if (TEXT_TYPES.includes(ext)) {
      const text = readFileSync(filePath, "utf-8").trim();
      return text
        ? { ok: true, text, unreadableParts: [], sourceKind: "text" }
        : { ok: false, reason: "the file is empty" };
    }

    if (ext in IMAGE_TYPES) {
      const data = readFileSync(filePath).toString("base64");

      const response = await client.messages.create(
        {
          model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          tools,
          tool_choice: { type: "tool", name: "submit_transcription" },
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: IMAGE_TYPES[ext], data } },
                { type: "text", text: `Transcribe this page. File name: ${name}` },
              ],
            },
          ],
        },
        { signal },
      );

      trackUsage(response.usage);

      const toolUse = response.content.find((b) => b.type === "tool_use") as
        | Anthropic.ToolUseBlock
        | undefined;
      if (!toolUse) return { ok: false, reason: "the model returned no transcription" };

      const input = toolUse.input as { text?: unknown; unreadableParts?: unknown };
      const text = typeof input.text === "string" ? input.text.trim() : "";
      const unreadableParts = Array.isArray(input.unreadableParts)
        ? input.unreadableParts.filter((p): p is string => typeof p === "string")
        : [];

      if (!text) return { ok: false, reason: "no readable text found in the image" };
      return { ok: true, text, unreadableParts, sourceKind: "image" };
    }

    return { ok: false, reason: `unsupported file type "${ext}"` };
  } catch (e) {
    console.error(
      formatError(createError("API_FAILED", "fileSpoke", `Failed to extract text from ${name}`, { cause: e })),
    );
    return { ok: false, reason: e instanceof Error ? e.message : "unknown error" };
  }
}