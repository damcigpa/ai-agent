// The steps every question goes through before the hub: the same for the CLI and the web app,
// so both get the same safety checks and the same follow-up handling.
//
//   1. pattern filter (security.ts)        — blocked phrases stop here, before any model call
//   2. follow-up → standalone question     — "And the third one?" → "Who was Henry VIII's third wife?"
//   3. library search                      — with the standalone question
//   4. classifier (classifyInput.ts)       — manipulation attempts and off-topic questions
//      A question the student's own material answers is always on topic for them.
//
// Never throws for a blocked or off-topic question: it returns { ok: false, message } with
// the text to show the student.

import { sanitizeInput } from "./security.js";
import { classifyInput } from "./classifyInput.js";
import { rewriteQuestion, type HistoryMessage } from "./spokes/rewriteSpoke.js";
import type { SearchHit } from "./library/vectorStore.js";

const BLOCKED_MESSAGE = "I'm sorry, I cannot process that request.";
const OFF_TOPIC_MESSAGE = "This question is outside the scope — please ask about history or literature.";

export type PreparedQuestion =
  | { ok: false; message: string }
  | {
      ok: true;
      question: string; // the student's message, passed the pattern filter
      standaloneQuestion: string; // the same, made self-contained using the conversation
      hits: SearchHit[]; // library search results for the standalone question
    };

export interface PrepareOptions {
  history: HistoryMessage[]; // earlier messages of this conversation, oldest first
  searchLibrary: (question: string) => Promise<SearchHit[]>;
  model?: string; // the small, fast model: these are quick decisions
  onProgress?: (message: string) => void;
}

export async function prepareQuestion(userMessage: string, options: PrepareOptions): Promise<PreparedQuestion> {
  const { history, searchLibrary, model = "claude-haiku-4-5-20251001", onProgress = () => {} } = options;

  // 1. Pattern filter first: a blocked message costs no model call.
  const question = sanitizeInput(userMessage);
  if (!question) return { ok: false, message: BLOCKED_MESSAGE };

  // 2. + 3. Follow-up questions are made self-contained before the library is searched.
  const standaloneQuestion = await rewriteQuestion(question, history, model);
  if (standaloneQuestion !== question) {
    onProgress(`🔎 Searching your material for: "${standaloneQuestion}"`);
  }
  const hits = await searchLibrary(standaloneQuestion).catch(() => [] as SearchHit[]);

  // 4. Classifier: manipulation attempts are refused; off-topic only when the library has nothing.
  const classification = await classifyInput(question, model);
  if (classification.verdict === "suspicious") return { ok: false, message: BLOCKED_MESSAGE };
  if (!classification.onTopic && hits.length === 0) {
    return { ok: false, message: classification.offTopicMessage ?? OFF_TOPIC_MESSAGE };
  }

  return { ok: true, question, standaloneQuestion, hits };
}