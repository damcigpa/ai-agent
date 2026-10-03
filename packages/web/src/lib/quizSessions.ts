import { randomUUID } from "crypto";
import type { Quiz, QuizQuestion } from "@exam-prep/agent/src/spokes/quizSpoke";

export type QuizStatus = "in_progress" | "completed";

export interface QuestionState {
  status: "unanswered" | "answered";
  wasCorrect?: boolean; // only set once status is "answered"
}

export interface QuizSessionItem {
  sessionID: string; 
  quizId: string;
  userId: string;
  topic: string;
  questions: QuizQuestion[];
  answers: QuestionState[];
  score: number;
  createdAt: string;
  updatedAt: string;
}

// Keep one process-local store shared across route bundles and Next dev reloads.
const globalStore = globalThis as typeof globalThis & {
  __quizSessions?: Map<string, QuizSessionItem>;
};
const sessions = (globalStore.__quizSessions ??= new Map());

function storageKey(sessionId: string, quizId: string): string {
  return JSON.stringify([sessionId, quizId]);
}

// --- Derive quiz status from answers ---
// NOT stored on the item — computed fresh every time from whichever copy
// of `answers` is freshest (a write's ALL_NEW result, or a GetCommand read).
// Storing this separately would mean either a second read after every write
// (defeats the point of the atomic update below) or a second counter that
// has to be kept in lockstep with `answers` by hand — the same class of
// drift bug as the SessionIndex/sessionIndex casing mismatch.

export function getQuizStatus(answers: QuestionState[]): QuizStatus {
  const answeredCount = answers.filter((a) => a.status === "answered").length;
  return answeredCount === answers.length ? "completed" : "in_progress";
}

// --- Create a new quiz session ---

export async function createQuizSession(
  userId: string,
  sessionId: string,
  quiz: Quiz,
): Promise<QuizSessionItem> {
  const now = new Date().toISOString();

  const item: QuizSessionItem = {
    sessionID: sessionId, // function param stays sessionId; the stored attribute is sessionID to match the table
    quizId: randomUUID(),
    userId,
    topic: quiz.topic,
    questions: quiz.questions,
    answers: quiz.questions.map(() => ({ status: "unanswered" as const })),
    score: 0,
    createdAt: now,
    updatedAt: now,
  };

  sessions.set(storageKey(sessionId, item.quizId), item);
  return item;
}

// --- Get a single quiz session ---
// Returns null if not found. Does NOT check ownership — callers (API routes)
// must check userId themselves, same pattern as the chatHistoryBySession resolver.

export async function getQuizSession(
  sessionId: string,
  quizId: string,
): Promise<QuizSessionItem | null> {
  return sessions.get(storageKey(sessionId, quizId)) ?? null;
}

// --- Thrown when the targeted question is already answered ---
// Means a duplicate/racing submission — e.g. a double-click, or a retry
// after a slow response whose first attempt actually succeeded. Callers
// should treat this as "already answered", not as a generic 500.

export class StaleQuizAnswerError extends Error {
  constructor(sessionId: string, quizId: string, questionIndex: number) {
    super(
      `Quiz answer rejected — question ${questionIndex} is already answered (sessionId=${sessionId}, quizId=${quizId})`,
    );
    this.name = "StaleQuizAnswerError";
  }
}

// --- Record an answer for a specific question, atomically ---
//
// questionIndex identifies which question this answer applies to — the
// client must send it explicitly now that questions can be answered in
// any order (no more single "current" pointer to imply it). wasCorrect
// is computed by the caller by comparing the submission to
// questions[questionIndex].correct, using the same read the caller does
// to fetch the quiz for display.
//
// The conditional update only succeeds if answers[questionIndex].status
// is still "unanswered" — so if two requests race for the same question,
// only the first lands; the second gets a StaleQuizAnswerError instead of
// silently double-counting the score.
//
// Note: questionIndex is embedded directly in the expression strings
// because DynamoDB doesn't support parameterizing list indices via
// ExpressionAttributeValues — only a literal integer works there. Safe
// here because questionIndex always comes from server-side validation
// against questions.length, never spliced in from raw user text.

export async function recordQuizAnswer(
  sessionId: string,
  quizId: string,
  questionIndex: number,
  wasCorrect: boolean,
): Promise<QuizSessionItem> {
  const now = new Date().toISOString();

  const key = storageKey(sessionId, quizId);
  const item = sessions.get(key);
  if (!item || item.answers[questionIndex]?.status !== "unanswered") {
    throw new StaleQuizAnswerError(sessionId, quizId, questionIndex);
  }

  const updated: QuizSessionItem = {
    ...item,
    answers: item.answers.map((answer, index) =>
      index === questionIndex
        ? { status: "answered", wasCorrect }
        : answer,
    ),
    score: item.score + (wasCorrect ? 1 : 0),
    updatedAt: now,
  };
  sessions.set(key, updated);
  return updated;
}

// --- List all quiz sessions for a user, newest first ---
// Powers a future "quiz history" view, same shape as getChatHistory.

export async function getQuizHistoryByUser(
  userId: string,
): Promise<QuizSessionItem[]> {
  return Array.from(sessions.values())
    .filter((item) => item.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}