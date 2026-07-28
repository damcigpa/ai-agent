import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { ResearchFindings } from "../types.js";
import { PROMPTS } from "../prompts.js";
import { trackUsage } from "../tokenTracker.js";
import { createError, formatError } from "../errors.js";

export interface QuizQuestion {
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correct: "A" | "B" | "C" | "D";
  explanation: string;
}

export interface Quiz {
  topic: string;
  questions: QuizQuestion[];
}

const tools: Anthropic.Tool[] = [
  {
    name: "generate_quiz",
    description:
      "Generate multiple choice quiz questions from research findings",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              options: {
                type: "object",
                properties: {
                  A: { type: "string" },
                  B: { type: "string" },
                  C: { type: "string" },
                  D: { type: "string" },
                },
                required: ["A", "B", "C", "D"],
              },
              correct: { type: "string", enum: ["A", "B", "C", "D"] },
              explanation: { type: "string" },
            },
            required: ["question", "options", "correct", "explanation"],
          },
        },
      },
      required: ["topic", "questions"],
    },
  },
];

export async function quizSpoke(
  findings: ResearchFindings,
  questionCount: number = 5,
  model: string = "claude-haiku-4-5-20251001",
): Promise<Quiz> {
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: `${PROMPTS.explain}

You are generating quiz questions for an eighth grade student preparing for a high school exam.
Rules:
- Questions must be based strictly on the provided research findings
- Each question must have exactly 4 options (A, B, C, D)
- Only one option is correct
- Wrong options must be plausible but clearly incorrect
- Explanation must clarify why the correct answer is right
- Use exam-relevant vocabulary but keep language accessible`,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools,
    tool_choice: { type: "tool", name: "generate_quiz" },
    messages: [
      {
        role: "user",
        content: `Generate ${questionCount} multiple choice questions based on these research findings:

Topic: ${findings.work || findings.author || "General topic"}
Context: ${findings.context}
Key facts: ${JSON.stringify(findings.keyFacts)}
Date: ${findings.date}

Generate exactly ${questionCount} questions.`,
      },
    ],
  });

  trackUsage(response.usage);

  const toolUse = response.content.find((b) => b.type === "tool_use") as
    | Anthropic.ToolUseBlock
    | undefined;

  if (toolUse) {
    return toolUse.input as Quiz;
  }

  const error = createError(
    "PARSE_FAILED",
    "searchSpoke",
    "quizSpoke failed to generate quiz",
  );
  console.error(formatError(error));

  return {
    topic: findings.work || "Unknown topic",
    questions: [],
  };
}
