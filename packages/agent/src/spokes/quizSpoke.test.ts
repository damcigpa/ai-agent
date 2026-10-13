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

  describe("disagreement flag (quiz from the student's notes)", () => {
    const question = (disagreement: unknown) => ({
      question: "When did Elizabeth I become Queen?",
      options: { A: "1558", B: "1565", C: "1603", D: "1533" },
      correct: "B",
      explanation: "The notes say 1565.",
      ...(disagreement === undefined ? {} : { disagreement }),
    });

    it("keeps a disagreement that points at another option", async () => {
      reply({ topic: "t", questions: [question({ option: "A", text: "I know 1558." })] });

      const quiz = await quizSpoke(findings, 1, undefined, { notesAreTheBase: true });
      expect(quiz.questions[0].correct).toBe("B");
      expect(quiz.questions[0].disagreement).toEqual({ option: "A", text: "I know 1558." });
    });

    it("drops a disagreement that points at the marked correct option, or at no option, or has no text", async () => {
      reply({
        topic: "t",
        questions: [
          question({ option: "B", text: "same as correct" }),
          question({ option: "Z", text: "not an option" }),
          question({ option: "A", text: "  " }),
        ],
      });

      const quiz = await quizSpoke(findings, 3, undefined, { notesAreTheBase: true });
      expect(quiz.questions).toHaveLength(3);
      for (const q of quiz.questions) expect(q.disagreement).toBeUndefined();
    });

    it("asks for the notes rules only when the notes are the base", async () => {
      reply({ topic: "t", questions: [question(undefined)] });
      await quizSpoke(findings, 1);
      reply({ topic: "t", questions: [question(undefined)] });
      await quizSpoke(findings, 1, undefined, { notesAreTheBase: true });

      const content = (call: number) => create.mock.calls[call][0].messages[0].content as string;
      expect(content(0)).not.toContain("OWN NOTES");
      expect(content(1)).toContain("OWN NOTES");
      expect(content(1)).toContain("MUST be the answer the facts give");
    });
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