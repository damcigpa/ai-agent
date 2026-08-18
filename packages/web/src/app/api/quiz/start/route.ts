import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { startQuizSchema } from "../../../../lib/schemas";
import { getChatHistoryBySession } from "../../../../lib/chatHistory";
import { createQuizSession } from "../../../../lib/quizSessions";
import { quizSpoke } from "@exam-prep/agent/src/spokes/quizSpoke";

// The web app has no scratchpad/ResearchFindings — quizSpoke needs a
// ResearchFindings-shaped object, so we build a minimal one from the
// session's chat history (question/answer pairs) instead.
function findingsFromHistory(history: { question: string; answer: string }[]) {
  return {
    author: "",
    work: history[0]?.question ?? "",
    date: "",
    context: history.map((h) => h.answer).join("\n\n"),
    confidence: "high" as const,
    sources: [],
    keyFacts: history.map((h) => h.answer),
  };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = startQuizSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { sessionId, questionCount } = parsed.data;

  const history = await getChatHistoryBySession(sessionId);

  // Ownership check — chatHistoryBySession's GSI is keyed by sessionId alone,
  // same gap the resolver already guards against.
  if (history.some((item) => item.userId !== session.user?.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (history.length === 0) {
    return NextResponse.json(
      { error: "No chat history found for this session. Ask a question first." },
      { status: 400 },
    );
  }

  const findings = findingsFromHistory(history);
  const quiz = await quizSpoke(findings, questionCount ?? 5);

  if (!quiz.questions.length) {
    return NextResponse.json(
      { error: "Could not generate quiz questions. Please try again." },
      { status: 500 },
    );
  }

  const quizSession = await createQuizSession(session.user.id, sessionId, quiz);

  // No "current" question anymore — any question can be answered first,
  // so the client gets the full list (options only, correct/explanation
  // withheld until each is individually answered via /api/quiz/answer)
  // plus which indices are still unanswered (all of them, at creation).
  return NextResponse.json({
    quizId: quizSession.quizId,
    topic: quizSession.topic,
    totalQuestions: quizSession.questions.length,
    questions: quizSession.questions.map((q) => ({
      question: q.question,
      options: q.options,
    })),
    unansweredIndices: quizSession.questions.map((_, i) => i),
  });
}