import Anthropic from "@anthropic-ai/sdk";
import { ResearchFindings, Subject } from "../types.js";
import { AnalysisFindings } from "../spokes/analyzeSpoke.js";
import { Explanation } from "../spokes/explainSpoke.js";
import { createError, formatError } from "../errors.js";
import { detectSubjectAndDecompose, replan } from "./decompose.js";
import { executeStep } from "./execute.js";
import { formatOutput, formatAnalysis } from "./format.js";
import { StreamEvent } from "../progress.js";
import { readScratchpad, resetScratchpad, updateScratchpad } from "../tools/scratchpad.js";
import { compareWithWeb, judgeMaterial, MaterialJudgement } from "../spokes/librarySpoke.js";
import type { SearchHit } from "../library/vectorStore.js";

const MAX_TURNS = 10;

const emptyFindings: ResearchFindings = {
  author: "",
  work: "",
  date: "",
  context: "",
  confidence: "low",
  sources: [],
};

export interface HubOptions {
  // Searches the student's own material (the CLI and the web app each pass their own).
  // Optional: without it the hub works exactly as before.
  searchLibrary?: (question: string) => Promise<SearchHit[]>;
}

// Same order as the router in execute.ts: "explain the findings" contains "find",
// but it is an explain step, not a search step.
function isSearchStep(step: string): boolean {
  const s = step.toLowerCase();
  return !s.includes("explain") && !s.includes("analyz") && (s.includes("search") || s.includes("find"));
}

// Adds the student's material to findings. Material facts are kept separately for the
// 📒 labels (Sources are labelled) and also added to keyFacts so /quiz covers them (Quiz covers the material).
function withMaterial(
  base: ResearchFindings | null,
  material: MaterialJudgement,
  subject: Subject,
): ResearchFindings {
  const facts = material.materialFacts.map((m) => m.fact);
  const findings: ResearchFindings = base ?? { ...emptyFindings, subject, confidence: "high" };
  return {
    ...findings,
    context: findings.context || facts.join(" "),
    keyFacts: [...new Set([...facts, ...(findings.keyFacts ?? [])])],
    materialFacts: material.materialFacts,
  };
}

export function hub(
  messages: Anthropic.MessageParam[],
  model: string = "claude-haiku-4-5-20251001",
  signal?: AbortSignal,
  options: HubOptions = {}
): ReadableStream<StreamEvent> {
  return new ReadableStream<StreamEvent>({
    async start(controller) {
      const enqueue = (event: StreamEvent) => controller.enqueue(event);

      const checkAborted = () => {
        if (signal?.aborted) {
          throw new DOMException("Request aborted by client", "AbortError");
        }
      };

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
        enqueue({ type: "progress", data: "🔍 Detecting subject and planning steps..." });
        const { subject, steps, newTopic, topic } = await detectSubjectAndDecompose(
          userMessage,
          previousTopic
        );

        if (newTopic) resetScratchpad();
        // After a reset the scratchpad read above is stale: never write its old findings back.
        const baseScratchpad = newTopic ? null : scratchpad;

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
          enqueue({ type: "progress", data: "📦 Reusing findings from previous turn" });
        }

        // 4. Material step (D6): look at the student's own material before the planned
        //    research. Fixed code, not a planner decision, so it always runs (The library is searched first).
        //    Only for research plans: an analysis plan has no search step to replace.
        let material: MaterialJudgement | null = null;
        let gaps: string[] = [];

        if (options.searchLibrary && steps.some(isSearchStep)) {
          checkAborted();
          const hits = await options.searchLibrary(userMessage).catch(() => [] as SearchHit[]);

          if (hits.length) {
            enqueue({ type: "progress", data: "📒 Checking your material..." });
            const judgement = await judgeMaterial(userMessage, hits, model, signal);
            if (judgement.coverage !== "none") material = judgement; // "none" → unchanged flow (No relevant material changes nothing)
          }

          if (material?.coverage === "full") {
            // Material-first answers: the material answers the question — no web research
            remainingSteps = remainingSteps.filter((step) => !isSearchStep(step));
            if (!remainingSteps.some((step) => step.toLowerCase().includes("explain"))) {
              remainingSteps.push("explain the findings clearly");
            }
            searchFindings = withMaterial(null, material, subject);
            enqueue({ type: "progress", data: "📒 Your material covers the question — no web search needed" });
            enqueue({ type: "progress", data: `📋 Plan: ${remainingSteps.join(" → ")}` });
          } else if (material?.coverage === "partial") {
            // Material-first answers: web research only for what the material does not cover
            gaps = material.missing;
            enqueue({ type: "progress", data: "📒 Your material covers part of the question — searching the web for the rest" });
          }
        }

        let explanation: Explanation | null = null;
        let turn = 0;

        while (remainingSteps.length > 0 && turn < MAX_TURNS) {
          checkAborted();

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
              model,
              signal,
              gaps
            );

          searchFindings = material ? withMaterial(updatedFindings, material, subject) : updatedFindings;
          explanation = updatedExplanation;

          // Contradictions are shown, never silently resolved: after a web search, compare the material with what the web found
          // (only with partial coverage: full coverage has no web search to compare with)
          // Web research failure: the search returned no source (the model may still write text from memory), so the answer stays on the
          // material alone and says so; there is nothing to compare either.
          // A real web result has at least one link; after failed searches the model may still list made-up
          // "sources" such as "Tudor dynasty documentation", which are not links.
          const webFound = !!updatedFindings && updatedFindings.sources.some((src) => /^https?:\/\//i.test(src));
          if (material && searchFindings && isSearchStep(currentStep) && !webFound) {
            // Text the model wrote without any source is dropped: only the material is used.
            searchFindings = { ...withMaterial(null, material, subject)!, webSupplementFailed: true };
            enqueue({ type: "progress", data: "⚠️  The web search failed — answering from your material only" });
          } else if (material && searchFindings && updatedFindings && isSearchStep(currentStep)) {
            const contradictions = await compareWithWeb(
              userMessage,
              material.materialFacts,
              updatedFindings, // the web findings alone, before the material was merged in
              model,
              signal
            );
            searchFindings = { ...searchFindings, contradictions };
            if (contradictions.length) {
              enqueue({
                type: "progress",
                data: `⚠️  Your material and the web disagree on ${contradictions.length} point(s)`,
              });
            }
          }

          // Handle analyze step result
          if (currentStep.toLowerCase().includes("analyz")) {
            if (updatedAnalysis?.synopsis) {
              // Analysis succeeded — insert explain step if complex
              if (updatedExplanation === null) {
                remainingSteps = [
                  "explain the analysis in accessible terms",
                  ...remainingSteps,
                ];
                enqueue({ type: "progress", data: "🔄 Inserted explain step due to complexity" });
              }
            } else {
              // Analysis failed — fall back to search
              enqueue({ type: "progress", data: "⚠️  Analysis failed — falling back to search" });
              remainingSteps = [
                `search for information about: ${userMessage}`,
                "explain the findings clearly",
                ...remainingSteps,
              ];
            }
          }

          analysisFindings = updatedAnalysis?.synopsis ? updatedAnalysis : null;

          // Update scratchpad
          if (searchFindings || updatedAnalysis) {
            updateScratchpad(readScratchpad(), {
              subject,
              topic,
              findings: searchFindings
                ? [...(baseScratchpad?.findings ?? []), searchFindings]
                : baseScratchpad?.findings ?? [],
              analysis: updatedAnalysis
                ? [...(baseScratchpad?.analysis ?? []), updatedAnalysis]
                : baseScratchpad?.analysis ?? [],
              conversationTopics: [
                ...(baseScratchpad?.conversationTopics ?? []),
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
            const adaptedSteps = await replan(remainingSteps, currentStep, searchFindings!);
            if (JSON.stringify(adaptedSteps) !== JSON.stringify(remainingSteps)) {
              enqueue({ type: "progress", data: "🔄 Plan adapted" });
            }
            remainingSteps = adaptedSteps;
          }
        }

        if (turn >= MAX_TURNS) {
          const error = createError("MAX_TURNS_REACHED", "hub", `Hub reached max turns (${MAX_TURNS})`);
          console.warn(formatError(error));
        }

        const finalOutput = analysisFindings
          ? formatAnalysis(analysisFindings, explanation, userMessage)
          : formatOutput(searchFindings ?? emptyFindings, explanation, userMessage);

        enqueue({ type: "done", data: finalOutput });
      } catch (e) {
        const error = createError("HUB_FAILED", "hub", "Hub failed", { cause: e });
        console.error(formatError(error));
        enqueue({ type: "error", data: (e as Error).message });
      } finally {
        controller.close();
      }
    },
    cancel(reason) {
      console.warn(`⚠️  hub stream cancelled: ${reason}`);
      // signal already carries the abort upstream to in-flight API calls;
      // this handler acknowledges the cancellation for cleanup/logging.
    },
  });
}