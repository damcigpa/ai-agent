import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Quiz } from "@exam-prep/agent/src/spokes/quizSpoke";
import {
  createQuizSession,
  getQuizHistoryByUser,
  getQuizSession,
  getQuizStatus,
  recordQuizAnswer,
  StaleQuizAnswerError,
} from "./quizSessions";

function makeQuiz(topic: string): Quiz {
  return {
    topic,
    questions: [
      {
        question: "Question?",
        options: { A: "One", B: "Two", C: "Three", D: "Four" },
        correct: "A",
        explanation: "Because A is correct.",
      },
    ],
  };
}

describe("quizSessions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a session, records an answer, and rejects a duplicate answer", async () => {
    const userId = randomUUID();
    const sessionId = randomUUID();
    const created = await createQuizSession(userId, sessionId, makeQuiz("Topic"));

    expect(await getQuizSession(sessionId, created.quizId)).toEqual(created);
    expect(getQuizStatus(created.answers)).toBe("in_progress");

    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    const updated = await recordQuizAnswer(sessionId, created.quizId, 0, true);

    expect(updated.answers).toEqual([{ status: "answered", wasCorrect: true }]);
    expect(updated.score).toBe(1);
    expect(updated.updatedAt).toBe("2026-01-01T00:01:00.000Z");
    expect(getQuizStatus(updated.answers)).toBe("completed");
    await expect(
      recordQuizAnswer(sessionId, created.quizId, 0, true),
    ).rejects.toBeInstanceOf(StaleQuizAnswerError);
  });

  it("returns each user's quiz history newest first", async () => {
    const userId = randomUUID();
    const first = await createQuizSession(userId, randomUUID(), makeQuiz("First"));
    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    const second = await createQuizSession(userId, randomUUID(), makeQuiz("Second"));

    const history = await getQuizHistoryByUser(userId);

    expect(history.map((item) => item.quizId)).toEqual([second.quizId, first.quizId]);
    expect(await getQuizSession(randomUUID(), first.quizId)).toBeNull();
  });
});
