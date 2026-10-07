import Anthropic from "@anthropic-ai/sdk";
import { hub } from "./hub/index.js";
import { createError, formatError, formatUserError } from "./errors.js";
import { getUsageWarning } from "./tokenTracker.js";
import { StreamEvent } from "./progress.js";
import { sanitizeInput } from "./security.js";
import { quizSpoke, Quiz, QuizQuestion } from "./spokes/quizSpoke.js";
import { readScratchpad, updateScratchpad } from "./tools/scratchpad.js";
import { classifyInput } from "./classifyInput.js";
import { readAllMaterials, clearMaterials } from "./tools/readMaterial.js";
import { materialSpoke } from "./spokes/materialSpoke.js";
export const MODEL_HAIKU = "claude-haiku-4-5-20251001";
export const MODEL_SONNET = "claude-sonnet-4-6";
import { handleAdd, handleLibrary, handleStartupSync } from "./library/commands.js";
import { openChunkStore, createVoyageEmbedder } from "./library/vectorStore.js";

const messages: { role: string; content: string }[] = [];
let currentModel = MODEL_HAIKU;

// Lazily created, so the chat still starts without a Voyage key.
// If opening the store fails, library search is skipped for the rest of the session.
let chunkStore: Awaited<ReturnType<typeof openChunkStore>> | null = null;
let libraryDisabled = false;

async function searchLibraryFor(question: string) {
  if (libraryDisabled) return [];
  try {
    chunkStore ??= openChunkStore(await createVoyageEmbedder());
    return await chunkStore.search(question, 5);
  } catch (e) {
    console.log(`  ⚠️  Library search is off for this session: ${e instanceof Error ? e.message : "unknown error"}`);
    libraryDisabled = true;
    return [];
  }
}

// Called once by the CLI before the first prompt (Changes made outside the app are detected).
export async function syncLibraryOnStartup(): Promise<string | null> {
  return handleStartupSync({
    getStore: async () => (chunkStore ??= openChunkStore(await createVoyageEmbedder())),
    onProgress: (m) => console.log(`  · ${m}`),
  });
}

// --- Quiz session state ---
interface QuizSession {
  quiz: Quiz;
  currentIndex: number;
  totalQuestions: number;
  score: number;
  awaitingAnswer: boolean;
  awaitingCount: boolean;
}

let quizSession: QuizSession | null = null;

function formatQuestion(q: QuizQuestion, index: number, total: number): string {
  return [
    `\n❓ Question ${index + 1} of ${total}:`,
    q.question,
    `A) ${q.options.A}`,
    `B) ${q.options.B}`,
    `C) ${q.options.C}`,
    `D) ${q.options.D}`,
    `\n✅ Correct answer: ${q.correct}) ${q.options[q.correct]}`,
  ].join("\n");
}

function handleQuizAnswer(userAnswer: string): string {
  if (!quizSession) return "";

  const current = quizSession.quiz.questions[quizSession.currentIndex];
  const answer = userAnswer.trim().toUpperCase() as "A" | "B" | "C" | "D";
  const isCorrect = answer === current.correct;

  if (isCorrect) quizSession.score++;

  const feedback = isCorrect
    ? `✅ Correct!`
    : `❌ Incorrect. The correct answer was ${current.correct}) ${current.options[current.correct]}`;

  const explanation = `\n💡 ${current.explanation}`;

  quizSession.currentIndex++;
  quizSession.awaitingAnswer = false;

  if (quizSession.currentIndex >= quizSession.totalQuestions) {
    const score = quizSession.score;
    const total = quizSession.totalQuestions;
    quizSession = null;
    return `${feedback}${explanation}\n\n🏁 Quiz complete! Score: ${score}/${total}`;
  }

  const next = quizSession.quiz.questions[quizSession.currentIndex];
  quizSession.awaitingAnswer = true;
  return `${feedback}${explanation}\n${formatQuestion(next, quizSession.currentIndex, quizSession.totalQuestions)}`;
}

function applyCache(
  messages: { role: string; content: string }[],
): Anthropic.MessageParam[] {
  return messages.map((msg, index) => ({
    role: msg.role as "user" | "assistant",
    content: [
      {
        type: "text" as const,
        text: msg.content,
        ...(index === messages.length - 1 && {
          cache_control: { type: "ephemeral" as const },
        }),
      },
    ],
  }));
}

export async function chat(userMessage: string): Promise<string> {
  // model switch commands
  if (/use sonnet/i.test(userMessage)) {
    currentModel = MODEL_SONNET;
    return `Switched to Sonnet — better quality, slower responses.`;
  }
  if (/use haiku/i.test(userMessage)) {
    currentModel = MODEL_HAIKU;
    return `Switched to Haiku — faster responses.`;
  }

  // --- Quiz session: awaiting question count ---
  if (quizSession?.awaitingCount) {
    const count = parseInt(userMessage.trim());
    const questionCount = isNaN(count) ? 5 : Math.min(Math.max(count, 1), 10);
    quizSession.awaitingCount = false;

    const scratchpad = readScratchpad();
    const findings = scratchpad?.findings?.[scratchpad.findings.length - 1];

    if (!findings) {
      quizSession = null;
      return "No research findings found. Please ask a question first, then use /quiz.";
    }

    console.log(`\n📝 Generating ${questionCount} questions...`);
    const quiz = await quizSpoke(findings, questionCount, currentModel);

    if (!quiz.questions.length) {
      quizSession = null;
      return "Could not generate quiz questions. Please try again.";
    }

    quizSession = {
      quiz,
      currentIndex: 0,
      totalQuestions: quiz.questions.length,
      score: 0,
      awaitingAnswer: true,
      awaitingCount: false,
    };

    const first = quiz.questions[0];
    return `🎯 Quiz: ${quiz.topic}\n${formatQuestion(first, 0, quiz.questions.length)}\n\nType A, B, C, or D to answer.`;
  }

  // --- Quiz session: awaiting answer ---
  if (quizSession?.awaitingAnswer) {
    if (/^[abcdABCD]$/.test(userMessage.trim())) {
      const response = handleQuizAnswer(userMessage);
      messages.push({ role: "user", content: userMessage });
      messages.push({ role: "assistant", content: response });
      return response;
    } else {
      return "Please answer with A, B, C, or D.";
    }
  }

  // --- /quiz command ---
  if (userMessage.trim().toLowerCase() === "/quiz") {
    const scratchpad = readScratchpad();
    if (!scratchpad?.findings?.length) {
      return "No research findings found. Please ask a question first, then use /quiz.";
    }
    quizSession = {
      quiz: { topic: "", questions: [] },
      currentIndex: 0,
      totalQuestions: 0,
      score: 0,
      awaitingAnswer: false,
      awaitingCount: true,
    };
    return `How many questions would you like? (1-10, default: 5)`;
  }

   // --- /import command ---
  if (userMessage.trim().toLowerCase() === "/import") {
    const materials = readAllMaterials();

    if (materials.length === 0) {
      return "No files found in materials/. Add a .txt, .md, .jpg or .png file there first.";
    }

    console.log(`\n📥 Extracting findings from ${materials.length} file(s)...`);
    const findings = await materialSpoke(materials, currentModel);

    clearMaterials();

    if (!findings.context) {
      return "Could not extract usable content from the provided files. Please try clearer photos or different files.";
    }

    const scratchpad = readScratchpad();
    updateScratchpad(scratchpad, {
      subject: findings.subject ?? "general",
      topic: findings.work || "imported material",
      findings: [...(scratchpad?.findings ?? []), findings],
      conversationTopics: [
        ...(scratchpad?.conversationTopics ?? []),
        `imported ${materials.length} file(s)`,
      ],
    });

    return `✅ Imported ${materials.length} file(s) (confidence: ${findings.confidence}).\n\n💡 Type /quiz to generate questions from it.`;
  }

    // --- /library command ---
  if (userMessage.trim().toLowerCase() === "/library") {
    return handleLibrary();
  }

  // --- /add command ---
  if (userMessage.trim().toLowerCase() === "/add") {
    return handleAdd({
      getStore: async () => openChunkStore(await createVoyageEmbedder()),
      onProgress: (m) => console.log(`  · ${m}`),
    });
  }

  // --- Library search ---
  // Done once, here: the hits decide the off-topic override below, and the hub gets them
  // to answer from the student's own material (The library is searched first / Material-first answers).
  const libraryHits = await searchLibraryFor(userMessage);

  const sanitized = sanitizeInput(userMessage);
  if (!sanitized) {
    return "I'm sorry, I cannot process that request.";
  }

  const classification = await classifyInput(sanitized, MODEL_HAIKU);

  if (classification.verdict === "suspicious") {
    return "I'm sorry, I cannot process that request.";
  }

  // The student's own material is always on topic for them (library hit overrides the classifier).
  if (!classification.onTopic && libraryHits.length === 0) {
    return (
      classification.offTopicMessage ??
      "This question is outside the scope — please ask about history or literature."
    );
  }

  messages.push({ role: "user", content: sanitized });

  try {
    const stream = hub(applyCache(messages), currentModel, undefined, {
      searchLibrary: async () => libraryHits,
    });
    const reader = stream.getReader();

    let finalResponse = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const event = value as StreamEvent;

      switch (event.type) {
        case "progress":
          console.log(event.data);
          break;
        case "chunk":
          process.stdout.write(event.data);
          break;
        case "done":
          finalResponse = event.data;
          console.log("\n");
          break;
        case "error":
          console.error(`Error: ${event.data}`);
          break;
      }
    }

    const warning = getUsageWarning();
    const scratchpad = readScratchpad();
    const hasFindings = scratchpad?.findings?.length;
    const quizHint = hasFindings
      ? "\n\n💡 Type /quiz to test yourself on this topic."
      : "";

    const response = warning
      ? `${finalResponse}${warning}${quizHint}`
      : `${finalResponse}${quizHint}`;

    messages.push({ role: "assistant", content: response });
    return response;
  } catch (e) {
    const error = createError(
      "HUB_FAILED",
      "agent",
      "Hub failed to process message",
      { cause: e },
    );
    console.error(formatError(error));
    const userFacing = formatUserError(error);
    messages.push({ role: "assistant", content: userFacing });
    return userFacing;
  }
}