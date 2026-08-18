"use client";

import { useState } from "react";
import { useQuiz } from "../hooks/useQuiz";

interface QuizPanelProps {
  sessionId: string;
}

const OPTION_KEYS = ["A", "B", "C", "D"] as const;

export function QuizPanel({ sessionId }: QuizPanelProps) {
  const {
    status,
    topic,
    totalQuestions,
    score,
    currentQuestion,
    lastResult,
    loading,
    error,
    startQuiz,
    submitAnswer,
    reset,
  } = useQuiz();

  // Local, UI-only state — NOT part of useQuiz's state, because it controls
  // when the feedback screen for the *previous* answer stops being shown,
  // not anything the server needs to know about. By the time submitAnswer
  // resolves, the hook has already moved on to the next unanswered
  // question — this flag is what holds the feedback screen up until the
  // user clicks past it, rather than the UI jumping straight to question 2
  // before they've seen how question 1 went.
  const [awaitingContinue, setAwaitingContinue] = useState(false);

  const handleAnswer = async (letter: string) => {
    await submitAnswer(letter);
    setAwaitingContinue(true);
  };

  const handleContinue = () => setAwaitingContinue(false);

  const handleRestart = () => {
    setAwaitingContinue(false);
    reset();
  };

  if (status === "idle") {
    return (
      <div className="border rounded-xl p-4 flex flex-col gap-3">
        <p className="text-sm text-gray-500">
          Test yourself on this conversation with a quick quiz.
        </p>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          onClick={() => startQuiz(sessionId)}
          disabled={loading}
          className="w-full bg-blue-500 text-white px-4 py-2 rounded-xl hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? "Starting quiz..." : "Start Quiz"}
        </button>
      </div>
    );
  }

  // Feedback screen for the just-answered question — shown regardless of
  // whether the quiz is now completed, since the user still needs to see
  // how their last answer went before moving to "Continue" / "See results".
  if (awaitingContinue && lastResult) {
    return (
      <div className="border rounded-xl p-4 flex flex-col gap-3">
        <p className={lastResult.wasCorrect ? "text-green-600" : "text-red-500"}>
          {lastResult.wasCorrect ? "✅ Correct!" : "❌ Not quite."}
        </p>
        {!lastResult.wasCorrect && (
          <p className="text-sm text-gray-600">
            Correct answer: {lastResult.correctAnswer}
          </p>
        )}
        <p className="text-sm text-gray-600">{lastResult.explanation}</p>
        <p className="text-xs text-gray-400">
          Score: {score}/{totalQuestions}
        </p>
        <button
          onClick={handleContinue}
          className="w-full bg-blue-500 text-white px-4 py-2 rounded-xl hover:bg-blue-600"
        >
          {status === "completed" ? "See results" : "Next question"}
        </button>
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div className="border rounded-xl p-4 flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Quiz complete 🏁</h3>
        <p>
          Score: {score}/{totalQuestions}
        </p>
        <button
          onClick={handleRestart}
          className="w-full bg-blue-500 text-white px-4 py-2 rounded-xl hover:bg-blue-600"
        >
          Take another quiz
        </button>
      </div>
    );
  }

  if (!currentQuestion) {
    // in_progress but no question resolved yet — brief gap right after
    // startQuiz's state update, before the first render with data settles.
    return (
      <div className="border rounded-xl p-4">
        <p className="text-sm text-gray-500">Loading question...</p>
      </div>
    );
  }

  return (
    <div className="border rounded-xl p-4 flex flex-col gap-3">
      <p className="text-xs text-gray-400">{topic}</p>
      <p className="font-medium">{currentQuestion.question}</p>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex flex-col gap-2">
        {OPTION_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => handleAnswer(key)}
            disabled={loading}
            className="text-left border rounded-xl px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
          >
            <span className="font-semibold mr-2">{key})</span>
            {currentQuestion.options[key]}
          </button>
        ))}
      </div>
    </div>
  );
}