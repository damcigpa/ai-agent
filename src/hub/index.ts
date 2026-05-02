import Anthropic from "@anthropic-ai/sdk";
import { ResearchFindings } from "../types.js";
import { AnalysisFindings } from "../spokes/analyzeSpoke.js";
import { Explanation } from "../spokes/explainSpoke.js";
import { createError, formatError } from "../errors.js";
import { detectSubjectAndDecompose, replan } from "./decompose.js";
import { executeStep } from "./execute.js";
import { formatOutput, formatAnalysis } from "./format.js";
import { emit } from "../progress.js";

const MAX_TURNS = 10;

const emptyFindings: ResearchFindings = {
  author: "",
  work: "",
  date: "",
  context: "",
  confidence: "low",
  sources: [],
};

export async function hub(messages: Anthropic.MessageParam[]): Promise<string> {
  const lastContent = messages[messages.length - 1].content;
  const userMessage =
    typeof lastContent === "string"
      ? lastContent
      : (lastContent as Anthropic.TextBlockParam[])[0].text;

  // 1. Detect subject and decompose in one call
  emit("detecting_subject");
  const { subject, steps } = await detectSubjectAndDecompose(userMessage);
  let remainingSteps = steps;
  console.log(`\n📚 Subject detected: ${subject}`);
  emit("planning");
  console.log("📋 Initial plan:", remainingSteps);

  let searchFindings: ResearchFindings | null = null;
  let analysisFindings: AnalysisFindings | null = null;
  let explanation: Explanation | null = null;
  let turn = 0;

  while (remainingSteps.length > 0 && turn < MAX_TURNS) {
    turn++;
    const currentStep = remainingSteps[0];
    remainingSteps = remainingSteps.slice(1);
    console.log(`\n  [hub → executing] "${currentStep}"`);

    const { updatedFindings, updatedAnalysis, updatedExplanation } =
      await executeStep(
        currentStep,
        userMessage,
        subject,
        searchFindings,
        analysisFindings,
        explanation,
      );

    searchFindings = updatedFindings;
    explanation = updatedExplanation;

    // Insert explain step if analyzeSpoke flagged complexity
    if (
      currentStep.toLowerCase().includes("analyz") &&
      updatedAnalysis &&
      updatedExplanation === null
    ) {
      remainingSteps = [
        "explain the analysis in accessible terms",
        ...remainingSteps,
      ];
      console.log("  🔄 Inserted explain step due to complexity");
    }

    analysisFindings = updatedAnalysis;

    // Replan after each step
    if (searchFindings && remainingSteps.length > 0) {
      const adaptedSteps = await replan(
        remainingSteps,
        currentStep,
        searchFindings,
      );
      if (JSON.stringify(adaptedSteps) !== JSON.stringify(remainingSteps)) {
        console.log("  🔄 Plan adapted:", adaptedSteps);
      }
      remainingSteps = adaptedSteps;
    }
  }

  if (turn >= MAX_TURNS) {
    const error = createError(
      "MAX_TURNS_REACHED",
      "hub",
      `Hub reached max turns (${MAX_TURNS})`,
    );
    console.warn(formatError(error));
  }

  return analysisFindings
    ? formatAnalysis(analysisFindings, explanation, userMessage)
    : formatOutput(searchFindings ?? emptyFindings, explanation, userMessage);
}
