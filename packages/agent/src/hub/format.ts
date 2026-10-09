import { Contradiction, ResearchFindings } from "../types.js";
import { AnalysisFindings } from "../spokes/analyzeSpoke.js";
import { Explanation } from "../spokes/explainSpoke.js";

const VERDICT: Record<Contradiction["likelyCorrect"], string> = {
  web: "The sources are probably right",
  material: "Your material is probably right",
  unclear: "Unclear — please check your notes",
};

const CONFIDENCE: Record<"high" | "medium" | "low", string> = {
  high: "high — several sources agree",
  medium: "medium — not fully confirmed",
  low: "low — little or conflicting information",
};

// Where the material and the sources disagree, the student must see it before anything else in
// the final output: both sides, how reliable each is, and the verdict (Contradictions are shown,
// never silently resolved). The material side has no confidence score: the agent cannot check
// the notes, it can only compare them, so they are shown exactly as written.
export function contradictionBlock(contradictions: Contradiction[]): string[] {
  if (contradictions.length === 0) return [];
  const lines = [
    `## ⚠️ CONTRADICTION — your material and the sources disagree (${contradictions.length})`,
    "",
  ];
  contradictions.forEach((c, i) => {
    if (contradictions.length > 1) lines.push(`**${i + 1}.**`);
    lines.push(`- 📒 **Your material** (${c.file}): ${c.material}`);
    lines.push(`  - Reliability: as written in your notes — the agent cannot check it, only compare it`);
    lines.push(`- 🌐 **The sources**: ${c.web}`);
    lines.push(`  - Reliability: ${c.webConfidence ? CONFIDENCE[c.webConfidence] : "unknown"}`);
    lines.push(`- → **${VERDICT[c.likelyCorrect]}**${c.reason ? ` — ${c.reason}` : ""}`);
    lines.push("");
  });
  return lines;
}

// The research confidence is the model's own estimate, but the student should still see when the
// answer is shaky: a confident-looking answer on weak sources is worse than a visible warning.
// "high" shows nothing; "medium" is a gentle hint; "low" is a clear warning.
export function uncertaintyNotice(confidence: "high" | "medium" | "low" | undefined): string | null {
  if (confidence === "low") {
    return "⚠️ I am not sure about this answer: I found little or conflicting information. Please check it in your textbook or notes before you rely on it.";
  }
  if (confidence === "medium") {
    return "ℹ️ This answer is not fully confirmed by several sources — it is worth checking in your textbook.";
  }
  return null;
}

export function formatOutput(
  findings: ResearchFindings,
  explanation: Explanation | null,
  userQuestion: string,
  // When the CLI already streamed the explanation prose to stdout, the final output
  // skips "## Explanation" so the same text does not appear twice.
  explanationAlreadyShown: boolean = false,
): string {
  const lines = [
    `# ${userQuestion}`,
    `**Subject:** ${findings.subject ?? "general"}`,
    `**Date/Period:** ${findings.date || "Unknown"}`,
    findings.author ? `**Key Figure:** ${findings.author}` : "",
    findings.work ? `**Work/Event:** ${findings.work}` : "",
    "",
  ];

  // Shown first (after the header): a disagreement matters more than anything below it.
  lines.push(...contradictionBlock(findings.contradictions ?? []));

  const notice = uncertaintyNotice(findings.confidence);
  if (notice) lines.push(notice, "");

  if (!explanationAlreadyShown) {
    lines.push("## Explanation", explanation?.summary || findings.context, "");
  }

  if (explanation?.keyPoints?.length) {
    lines.push("## Key Points");
    explanation.keyPoints.forEach((p) => lines.push(`- ${p}`));
    lines.push("");
  }

  if (explanation?.significance) {
    lines.push("## Significance");
    lines.push(explanation.significance);
    lines.push("");
  }

  // Facts from the student's own material, with the file they came from (Sources are labelled)
  const materialFacts = findings.materialFacts ?? [];
  if (materialFacts.length) {
    lines.push("## 📒 From your material");
    materialFacts.forEach((m) => lines.push(`- ${m.fact} (${m.file})`));
    lines.push("");
  }

  // The web research meant to fill the gaps failed: say so (Web research failure)
  if (findings.webSupplementFailed) {
    lines.push("⚠️ The web search failed, so this answer is based on your material only and could not be supplemented.");
    lines.push("");
  }

  // Material facts are also stored in keyFacts (for the quiz): do not show them twice
  const shownAbove = new Set(materialFacts.map((m) => m.fact));
  const webFacts = (findings.keyFacts ?? []).filter((f) => !shownAbove.has(f));
  if (webFacts.length) {
    lines.push("## Key Facts");
    webFacts.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
  }

  // Without material the sources look exactly as before; with material both kinds are labelled.
  const materialFiles = [...new Set(materialFacts.map((m) => m.file))];
  if (materialFiles.length || findings.sources.length) {
    lines.push("## Sources");
    materialFiles.forEach((file) => lines.push(`- 📒 ${file}`));
    findings.sources.forEach((s) => lines.push(materialFiles.length ? `- 🌐 ${s}` : `- ${s}`));
    lines.push("");
  }

  if (explanation?.furtherReading?.length) {
    lines.push("## Further Reading");
    explanation.furtherReading.forEach((t) => lines.push(`- ${t}`));
  }

  return lines.filter((l) => l !== undefined).join("\n");
}

export function formatAnalysis(
  analysis: AnalysisFindings,
  explanation: Explanation | null,
  userQuestion: string,
  // Same purpose as in formatOutput: skip the explanation prose when the CLI streamed it.
  explanationAlreadyShown: boolean = false,
): string {
  const lines = [
    `# ${userQuestion}`,
    `**Title:** ${analysis.title || "Unknown"}`,
    `**Author:** ${analysis.author || "Unknown"}`,
    `**Period:** ${analysis.period || "Unknown"}`,
    "",
    "## Synopsis",
    analysis.synopsis || "No synopsis available",
    "",
  ];

  const notice = uncertaintyNotice(analysis.confidence);
  if (notice) lines.push(notice, "");

  if (explanation) {
    if (!explanationAlreadyShown) {
      lines.push("## Explanation");
      lines.push(explanation.summary);
      lines.push("");
    }

    if (explanation.keyPoints?.length) {
      lines.push("## Key Points");
      explanation.keyPoints.forEach((p) => lines.push(`- ${p}`));
      lines.push("");
    }

    if (explanation.significance) {
      lines.push("## Significance");
      lines.push(explanation.significance);
      lines.push("");
    }
  }

  if (analysis.themes?.length) {
    lines.push("## Themes");
    analysis.themes.forEach((t) => lines.push(`- ${t}`));
    lines.push("");
  }

  if (analysis.literaryDevices?.length) {
    lines.push("## Literary Devices");
    analysis.literaryDevices.forEach((d) => lines.push(`- ${d}`));
    lines.push("");
  }

  if (analysis.criticalPerspectives?.length) {
    lines.push("## Critical Perspectives");
    analysis.criticalPerspectives.forEach((p) => lines.push(`- ${p}`));
    lines.push("");
  }

  if (analysis.significance) {
    lines.push("## Literary Significance");
    lines.push(analysis.significance);
    lines.push("");
  }

  if (analysis.sources?.length) {
    lines.push("## Sources");
    analysis.sources.forEach((s) => lines.push(`- ${s}`));
  }

  return lines.join("\n");
}