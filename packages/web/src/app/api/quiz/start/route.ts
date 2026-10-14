import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { startQuizSchema } from "../../../../lib/schemas";
import { getChatHistoryBySession } from "../../../../lib/chatHistory";
import { createQuizSession } from "../../../../lib/quizSessions";
import { quizSpoke, type Quiz } from "@exam-prep/agent/src/spokes/quizSpoke";
import { judgeMaterial } from "@exam-prep/agent/src/spokes/librarySpoke";
import type { ResearchFindings } from "@exam-prep/agent/src/types";
import { sanitizeInput } from "@exam-prep/agent/src/security";
import { getStore } from "../../../../lib/library";

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

// The topic quiz is the CLI's `/quiz <topic>` (agent.ts, notesOnTopic), with the same settings and the
// reasons for them: 8 note chunks, Haiku judges the notes, Sonnet writes the questions.
const TOPIC_QUIZ_CHUNKS = 8;
const TOPIC_QUIZ_MODEL = "claude-sonnet-4-6";
const JUDGE_MODEL = "claude-haiku-4-5-20251001";

// The student's own notes on a topic, as findings the quiz can be built from; null = nothing on this
// topic. A failed search (for example a missing Voyage key) reads as "nothing found".
async function notesOnTopic(topic: string): Promise<ResearchFindings | null> {
  let hits;
  try {
    hits = await (await getStore()).search(topic, TOPIC_QUIZ_CHUNKS);
  } catch (error) {
    console.error("[topic quiz] library search failed:", error);
    return null;
  }
  if (hits.length === 0) return null;

  const judgement = await judgeMaterial(`What do the notes say about ${topic}?`, hits, JUDGE_MODEL);
  if (judgement.coverage === "none") return null;

  const facts = judgement.materialFacts.map((m) => m.fact);
  return {
    author: "",
    work: topic,
    date: "",
    context: facts.join(" "),
    confidence: "high",
    sources: [],
    keyFacts: facts,
    materialFacts: judgement.materialFacts,
  };
}

// No "current" question anymore — any question can be answered first,
// so the client gets the full list (options only, correct/explanation
// withheld until each is individually answered via /api/quiz/answer)
// plus which indices are still unanswered (all of them, at creation).
async function startedQuiz(userId: string, sessionId: string, quiz: Quiz) {
  const quizSession = await createQuizSession(userId, sessionId, quiz);
  return {
    quizId: quizSession.quizId,
    topic: quizSession.topic,
    totalQuestions: quizSession.questions.length,
    questions: quizSession.questions.map((q) => ({
      question: q.question,
      options: q.options,
    })),
    unansweredIndices: quizSession.questions.map((_, i) => i),
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

  const { sessionId, questionCount, topic: rawTopic } = parsed.data;

  // A quiz from the student's notes on a topic: the notes are the base, written with Sonnet,
  // and a disagreement with the model's own knowledge is shown after the answer (like /quiz <topic>).
  if (rawTopic) {
    const topic = sanitizeInput(rawTopic);
    if (!topic) {
      return NextResponse.json({ error: "I'm sorry, I cannot process that request." }, { status: 400 });
    }

    const topicFindings = await notesOnTopic(topic);
    if (!topicFindings) {
      return NextResponse.json(
        { error: `I found nothing about "${topic}" in your notes. Add material in the Library, or leave the topic empty to quiz on this conversation.` },
        { status: 404 },
      );
    }

    const topicQuiz = await quizSpoke(topicFindings, questionCount ?? 5, TOPIC_QUIZ_MODEL, {
      notesAreTheBase: true,
    });
    if (!Array.isArray(topicQuiz?.questions) || topicQuiz.questions.length === 0) {
      return NextResponse.json(
        { error: "Could not generate quiz questions. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json(await startedQuiz(session.user.id, sessionId, topicQuiz));
  }

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

  if (!Array.isArray(quiz?.questions) || quiz.questions.length === 0) {
    return NextResponse.json(
      { error: "Could not generate quiz questions. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(await startedQuiz(session.user.id, sessionId, quiz));
}