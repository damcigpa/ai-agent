import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { answerQuizSchema } from "../../../../lib/schemas";
import {
  getQuizSession,
  recordQuizAnswer,
  getQuizStatus,
  StaleQuizAnswerError,
} from "../../../../lib/quizSessions";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = answerQuizSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { sessionId, quizId, questionIndex, answer } = parsed.data;

  // Read once — used both to grade the answer and to bounds-check questionIndex.
  const quiz = await getQuizSession(sessionId, quizId);
  if (!quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  // Ownership check — same pattern as chatHistoryBySession's resolver.
  if (quiz.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Zod guarantees questionIndex is a non-negative integer, but the upper
  // bound depends on this specific quiz's question count, which the schema
  // can't know — still needs a runtime check against quiz.questions.length.
  if (questionIndex >= quiz.questions.length) {
    return NextResponse.json(
      {
        error: `questionIndex out of range — must be between 0 and ${quiz.questions.length - 1}`,
      },
      { status: 400 },
    );
  }

  // Early check for a friendlier message on the common "already answered"
  // case. Not authoritative by itself — a race between this check and the
  // write below is still possible, which is exactly why recordQuizAnswer
  // does its own atomic conditional check regardless of this.
  if (quiz.answers[questionIndex].status === "answered") {
    return NextResponse.json(
      { error: "This question has already been answered", status: getQuizStatus(quiz.answers) },
      { status: 409 },
    );
  }

  const question = quiz.questions[questionIndex];
  const wasCorrect = answer.trim().toUpperCase() === question.correct;

  try {
    const updated = await recordQuizAnswer(sessionId, quizId, questionIndex, wasCorrect);

    const unansweredIndices = updated.answers
      .map((a, i) => (a.status === "unanswered" ? i : -1))
      .filter((i) => i !== -1);

    return NextResponse.json({
      questionIndex,
      wasCorrect,
      correctAnswer: question.correct,
      explanation: question.explanation,
      score: updated.score,
      status: getQuizStatus(updated.answers),
      unansweredIndices,
    });
  } catch (e) {
    if (e instanceof StaleQuizAnswerError) {
      // Someone else (or a duplicate request) already answered this
      // question between our read above and this write — not a server
      // error, just a race we lost. Re-read for the current true state.
      const current = await getQuizSession(sessionId, quizId);
      return NextResponse.json(
        {
          error: "This question has already been answered",
          status: current ? getQuizStatus(current.answers) : undefined,
        },
        { status: 409 },
      );
    }
    throw e;
  }
}