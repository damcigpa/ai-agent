import Anthropic from "@anthropic-ai/sdk";
import { ResearchFindings } from "../types.js";
import { AnalysisFindings } from "../spokes/analyzeSpoke.js";
import { Explanation } from "../spokes/explainSpoke.js";
import { createError, formatError } from "../errors.js";
import { detectSubjectAndDecompose, replan } from "./decompose.js";
import { executeStep } from "./execute.js";
import { formatOutput, formatAnalysis } from "./format.js";
import { emit, StreamEvent } from "../progress.js";
import {
  readScratchpad,
  resetScratchpad,
  updateScratchpad,
} from "../tools/scratchpad.js";

const MAX_TURNS = 10;

const emptyFindings: ResearchFindings = {
  author: "",
  work: "",
  date: "",
  context: "",
  confidence: "low",
  sources: [],
};

export function hub(
  messages: Anthropic.MessageParam[],
): ReadableStream<StreamEvent> {
  return new ReadableStream<StreamEvent>({
    async start(controller) {
      const enqueue = (event: StreamEvent) => controller.enqueue(event);

      try {
        const lastContent = messages[messages.length - 1].content;
        const userMessage =
          typeof lastContent === "string"
            ? lastContent
            : (lastContent as Anthropic.TextBlockParam[])[0].text;

        // 1. Read scratchpad
        const scratchpad = readScratchpad();
        const previousTopic = scratchpad?.topic ?? "";

        // 2. Detect subject, decompose, check new topic
        enqueue({
          type: "progress",
          data: "🔍 Detecting subject and planning steps...",
        });
        const { subject, steps, newTopic, topic } =
          await detectSubjectAndDecompose(userMessage, previousTopic);

        if (newTopic) resetScratchpad();

        let remainingSteps = steps;
        enqueue({ type: "progress", data: `📚 Subject: ${subject}` });
        enqueue({ type: "progress", data: `📋 Plan: ${steps.join(" → ")}` });

        // 3. Restore findings from scratchpad if same topic
        let searchFindings: ResearchFindings | null =
          !newTopic && scratchpad?.findings?.length
            ? scratchpad.findings[scratchpad.findings.length - 1]
            : null;

        let analysisFindings: AnalysisFindings | null =
          !newTopic && scratchpad?.analysis?.length
            ? scratchpad.analysis[scratchpad.analysis.length - 1]
            : null;

        if (searchFindings) {
          enqueue({
            type: "progress",
            data: "📦 Reusing findings from previous turn",
          });
        }

        let explanation: Explanation | null = null;
        let turn = 0;

        while (remainingSteps.length > 0 && turn < MAX_TURNS) {
          turn++;
          const currentStep = remainingSteps[0];
          remainingSteps = remainingSteps.slice(1);

          const { updatedFindings, updatedAnalysis, updatedExplanation } =
            await executeStep(
              currentStep,
              userMessage,
              subject,
              searchFindings,
              analysisFindings,
              explanation,
              enqueue,
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
            enqueue({
              type: "progress",
              data: "🔄 Inserted explain step due to complexity",
            });
          }

          analysisFindings = updatedAnalysis;

          // Update scratchpad
          if (updatedFindings || updatedAnalysis) {
            updateScratchpad(readScratchpad(), {
              subject,
              topic,
              findings: updatedFindings
                ? [...(scratchpad?.findings ?? []), updatedFindings]
                : (scratchpad?.findings ?? []),
              analysis: updatedAnalysis
                ? [...(scratchpad?.analysis ?? []), updatedAnalysis]
                : (scratchpad?.analysis ?? []),
              conversationTopics: [
                ...(scratchpad?.conversationTopics ?? []),
                userMessage,
              ],
            });
          }

          // Conditional replan
          const shouldReplan =
            (searchFindings?.confidence === "low" ||
              searchFindings?.escalate === true) &&
            remainingSteps.length > 1;

          if (shouldReplan) {
            const adaptedSteps = await replan(
              remainingSteps,
              currentStep,
              searchFindings!,
            );
            if (
              JSON.stringify(adaptedSteps) !== JSON.stringify(remainingSteps)
            ) {
              enqueue({ type: "progress", data: "🔄 Plan adapted" });
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

        const finalOutput = analysisFindings
          ? formatAnalysis(analysisFindings, explanation, userMessage)
          : formatOutput(
              searchFindings ?? emptyFindings,
              explanation,
              userMessage,
            );

        enqueue({ type: "done", data: finalOutput });
      } catch (e) {
        const error = createError("HUB_FAILED", "hub", "Hub failed", {
          cause: e,
        });
        console.error(formatError(error));
        enqueue({ type: "error", data: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
}
