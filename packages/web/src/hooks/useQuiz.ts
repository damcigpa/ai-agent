"use client";

import { useState, useCallback } from "react";

export interface QuizQuestionView {
  question: string;
  options: { A: string; B: string; C: string; D: string };
}

export interface QuizAnswerResult {
  questionIndex: number;
  wasCorrect: boolean;
  correctAnswer: "A" | "B" | "C" | "D";
  explanation: string;
}

export type QuizStatus = "idle" | "in_progress" | "completed";

interface QuizState {
  sessionId: string | null;
  quizId: string | null;
  topic: string;
  totalQuestions: number;
  questions: QuizQuestionView[]; // index-aligned with the backend's questions[]
  unansweredIndices: number[];
  score: number;
  status: QuizStatus;
  lastResult: QuizAnswerResult | null;
  loading: boolean;
  error: string | null;
}

const initialState: QuizState = {
  sessionId: null,
  quizId: null,
  topic: "",
  totalQuestions: 0,
  questions: [],
  unansweredIndices: [],
  score: 0,
  status: "idle",
  lastResult: null,
  loading: false,
  error: null,
};

export function useQuiz() {
  const [state, setState] = useState<QuizState>(initialState);

  const startQuiz = useCallback(
    async (sessionId: string, questionCount?: number) => {
      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const res = await fetch("/api/quiz/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, questionCount }),
        });

        const data = await res.json();

        if (!res.ok) {
          const message =
            typeof data.error === "string"
              ? data.error
              : "Could not start the quiz.";
          setState((s) => ({ ...s, loading: false, error: message }));
          return;
        }

        setState({
          sessionId,
          quizId: data.quizId,
          topic: data.topic,
          totalQuestions: data.totalQuestions,
          questions: data.questions,
          unansweredIndices: data.unansweredIndices,
          score: 0,
          status: "in_progress",
          lastResult: null,
          loading: false,
          error: null,
        });
      } catch {
        setState((s) => ({
          ...s,
          loading: false,
          error: "Network error starting the quiz.",
        }));
      }
    },
    [],
  );

  // Simplest picking rule: always the first unanswered question, in the
  // order the backend returned them. The backend allows answering any
  // index — this just doesn't expose that choice to the UI yet.
  const currentIndex = state.unansweredIndices[0] ?? null;
  const currentQuestion =
    currentIndex !== null ? state.questions[currentIndex] : null;

  const submitAnswer = useCallback(
    async (answer: string) => {
      if (
        !state.sessionId ||
        !state.quizId ||
        currentIndex === null ||
        state.loading
      ) {
        return;
      }

      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const res = await fetch("/api/quiz/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            quizId: state.quizId,
            questionIndex: currentIndex,
            answer,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          // A 409 here means this question was already answered — most
          // likely a duplicate submission (double-click, retried request).
          // Treat it the same as a normal update rather than a hard error:
          // trust the server's returned status and just drop the stale
          // submission, since the real answer already landed.
          if (res.status === 409 && data.status) {
            setState((s) => ({
              ...s,
              loading: false,
              status: data.status,
            }));
            return;
          }

          const message =
            typeof data.error === "string"
              ? data.error
              : "Could not submit the answer.";
          setState((s) => ({ ...s, loading: false, error: message }));
          return;
        }

        setState((s) => ({
          ...s,
          unansweredIndices: data.unansweredIndices,
          score: data.score,
          status: data.status,
          lastResult: {
            questionIndex: data.questionIndex,
            wasCorrect: data.wasCorrect,
            correctAnswer: data.correctAnswer,
            explanation: data.explanation,
          },
          loading: false,
          error: null,
        }));
      } catch {
        setState((s) => ({
          ...s,
          loading: false,
          error: "Network error submitting the answer.",
        }));
      }
    },
    [state.sessionId, state.quizId, state.loading, currentIndex],
  );

  const reset = useCallback(() => setState(initialState), []);

  return {
    ...state,
    currentIndex,
    currentQuestion,
    startQuiz,
    submitAnswer,
    reset,
  };
}