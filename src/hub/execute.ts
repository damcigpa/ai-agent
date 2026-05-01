import { searchSpoke } from "../spokes/searchSpoke.js";
import { explainSpoke, Explanation } from "../spokes/explainSpoke.js";
import { analyzeSpoke, AnalysisFindings } from "../spokes/analyzeSpoke.js";
import { fileSpoke } from "../spokes/fileSpoke.js";
import { ResearchFindings, Subject } from "../types.js";
import { emit } from "../progress.js";
import { evaluateCoverage, needsSimplification } from "./evaluate.js";
import { aggregateFindings } from "./aggregate.js";
import { formatOutput, formatAnalysis } from "./format.js";

const MAX_SEARCH_RETRIES = 2;

export interface StepResult {
  result: string;
  updatedFindings: ResearchFindings | null;
  updatedAnalysis: AnalysisFindings | null;
  updatedExplanation: Explanation | null;
}

// --- Convert AnalysisFindings to ResearchFindings shape for explainSpoke ---

function analysisToResearch(analysis: AnalysisFindings): ResearchFindings {
  return {
    author: analysis.author,
    work: analysis.title,
    date: analysis.period,
    context: analysis.synopsis,
    confidence: analysis.confidence,
    sources: analysis.sources,
    keyFacts: analysis.themes,
  };
}

// --- Individual step executors ---

export async function executeSearchStep(
  userMessage: string,
  subject: Subject,
  searchFindings: ResearchFindings | null,
  analysisFindings: AnalysisFindings | null,
  explanation: Explanation | null,
): Promise<StepResult> {
  emit("searching");
  const context = buildSearchContext({
    userMessage,
    alreadyFound: searchFindings,
    missing: [],
  });

  let findings = await searchSpoke(context, subject);

  // Handle escalation
  if (findings.escalate) {
    emit("escalating");
    console.log(`  🔺 Escalation: ${findings.escalateReason}`);
    console.log("  🔄 Retrying with broader strategy...");
    const retryFindings = await searchSpoke(
      buildSearchContext({ userMessage, alreadyFound: null, missing: [] }),
      subject,
    );
    findings = retryFindings.escalate
      ? { ...retryFindings, escalate: false }
      : retryFindings;
  }

  // Coverage + retry loop
  let { complete, missing } = evaluateCoverage(findings, userMessage);
  console.log(
    complete
      ? `  ✅ Coverage complete (confidence: ${findings.confidence})`
      : `  ⚠️  Missing: ${missing.join(", ")} — retrying...`,
  );

  let retryCount = 0;
  while (!complete && missing.length > 0 && retryCount < MAX_SEARCH_RETRIES) {
    emit("retrying");
    const retryFindings = await searchSpoke(
      buildSearchContext({ userMessage, alreadyFound: findings, missing }),
      subject,
    );
    findings = aggregateFindings(findings, retryFindings);
    ({ complete, missing } = evaluateCoverage(findings, userMessage));
    retryCount++;
    console.log(
      complete
        ? `  ✅ Coverage complete after retry ${retryCount}`
        : `  ⚠️  Still missing: ${missing.join(", ")} (retry ${retryCount}/${MAX_SEARCH_RETRIES})`,
    );
  }

  return {
    result: JSON.stringify(findings),
    updatedFindings: findings,
    updatedAnalysis: analysisFindings,
    updatedExplanation: explanation,
  };
}

export async function executeAnalyzeStep(
  userMessage: string,
  searchFindings: ResearchFindings | null,
  analysisFindings: AnalysisFindings | null,
  explanation: Explanation | null,
): Promise<StepResult> {
  emit("analyzing");
  console.log("  [hub → analyze_spoke]");
  const analysis = await analyzeSpoke(userMessage);

  const complex = await needsSimplification(analysis);
  console.log(
    complex
      ? "  🔬 Analysis is complex — will run explainSpoke"
      : "  ✅ Analysis is accessible — skipping explainSpoke",
  );

  return {
    result: JSON.stringify(analysis),
    updatedFindings: searchFindings,
    updatedAnalysis: analysis,
    // null signals hub to insert explain step
    updatedExplanation: complex ? null : explanation,
  };
}

export async function executeExplainStep(
  userMessage: string,
  searchFindings: ResearchFindings | null,
  analysisFindings: AnalysisFindings | null,
  explanation: Explanation | null,
): Promise<StepResult> {
  const findingsToExplain = analysisFindings
    ? analysisToResearch(analysisFindings)
    : searchFindings;

  if (!findingsToExplain) {
    return {
      result: "No findings to explain",
      updatedFindings: searchFindings,
      updatedAnalysis: analysisFindings,
      updatedExplanation: null,
    };
  }

  emit("explaining");
  console.log("  [hub → explain_spoke]");
  const exp = await explainSpoke(findingsToExplain, userMessage);

  return {
    result: exp.summary,
    updatedFindings: searchFindings,
    updatedAnalysis: analysisFindings,
    updatedExplanation: exp,
  };
}

export async function executeFileStep(
  userMessage: string,
  searchFindings: ResearchFindings | null,
  analysisFindings: AnalysisFindings | null,
  explanation: Explanation | null,
): Promise<StepResult> {
  emit("writing");
  const emptyFindings: ResearchFindings = {
    author: "",
    work: "",
    date: "",
    context: "",
    confidence: "low",
    sources: [],
  };

  const content = analysisFindings
    ? formatAnalysis(analysisFindings, explanation, userMessage)
    : formatOutput(searchFindings ?? emptyFindings, explanation, userMessage);

  const result = await fileSpoke(
    `Write the following to output.txt:\n\n${content}`,
  );

  return {
    result,
    updatedFindings: searchFindings,
    updatedAnalysis: analysisFindings,
    updatedExplanation: explanation,
  };
}

// --- Router ---

export async function executeStep(
  step: string,
  userMessage: string,
  subject: Subject,
  searchFindings: ResearchFindings | null,
  analysisFindings: AnalysisFindings | null,
  explanation: Explanation | null,
): Promise<StepResult> {
  const stepLower = step.toLowerCase();

  if (stepLower.includes("search") || stepLower.includes("find")) {
    return executeSearchStep(
      userMessage,
      subject,
      searchFindings,
      analysisFindings,
      explanation,
    );
  }

  if (stepLower.includes("analyz")) {
    return executeAnalyzeStep(
      userMessage,
      searchFindings,
      analysisFindings,
      explanation,
    );
  }

  if (stepLower.includes("explain")) {
    return executeExplainStep(
      userMessage,
      searchFindings,
      analysisFindings,
      explanation,
    );
  }

  if (stepLower.includes("write") || stepLower.includes("file")) {
    return executeFileStep(
      userMessage,
      searchFindings,
      analysisFindings,
      explanation,
    );
  }

  return {
    result: `Unknown step: ${step}`,
    updatedFindings: searchFindings,
    updatedAnalysis: analysisFindings,
    updatedExplanation: explanation,
  };
}
