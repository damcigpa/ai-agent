import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("../client.js", () => ({ client: { messages: { create } } }));
vi.mock("../tokenTracker.js", () => ({ trackUsage: vi.fn() }));

import { quizSpoke } from "./quizSpoke.js";

const findings = {
  author: "",
  work: "History",
  date: "",
  context: "The event happened in 1526.",
  confidence: "high" as const,
  sources: [],
  keyFacts: ["The event happened in 1526."],
};

const reply = (input: unknown) =>
  create.mockResolvedValueOnce({
    content: [{ type: "tool_use", id: "t1", name: "generate_quiz", input }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });

beforeEach(() => {
  create.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("quizSpoke", () => {
  it("returns a valid generated quiz", async () => {
    const quiz = {
      topic: "History",
      questions: [
        {
          question: "When did the event happen?",
          options: { A: "1526", B: "1453", C: "1848", D: "1914" },
          correct: "A",
          explanation: "The finding says 1526.",
        },
      ],
    };
    reply(quiz);

    await expect(quizSpoke(findings, 1)).resolves.toEqual(quiz);
  });

  it("returns an empty quiz for a malformed tool payload", async () => {
    reply({ topic: "History" });

    await expect(quizSpoke(findings, 1)).resolves.toEqual({
      topic: "History",
      questions: [],
    });
    expect(console.error).toHaveBeenCalledWith(
      "[quizSpoke] PARSE_FAILED: quizSpoke returned an invalid quiz payload",
    );
  });

  it("returns an empty quiz when no tool result is returned", async () => {
    create.mockResolvedValueOnce({ content: [], usage: { input_tokens: 1, output_tokens: 1 } });

    await expect(quizSpoke(findings, 1)).resolves.toEqual({
      topic: "History",
      questions: [],
    });
  });
});
