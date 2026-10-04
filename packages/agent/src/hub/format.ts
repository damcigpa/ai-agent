import { ResearchFindings } from "../types.js";
import { AnalysisFindings } from "../spokes/analyzeSpoke.js";
import { Explanation } from "../spokes/explainSpoke.js";

export function formatOutput(
  findings: ResearchFindings,
  explanation: Explanation | null,
  userQuestion: string,
): string {
  const lines = [
    `# ${userQuestion}`,
    `**Subject:** ${findings.subject ?? "general"}`,
    `**Date/Period:** ${findings.date || "Unknown"}`,
    findings.author ? `**Key Figure:** ${findings.author}` : "",
    findings.work ? `**Work/Event:** ${findings.work}` : "",
    "",
    "## Explanation",
    explanation?.summary || findings.context,
    "",
  ];

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

  // Facts from the student's own material, with the file they came from (AC-14)
  const materialFacts = findings.materialFacts ?? [];
  if (materialFacts.length) {
    lines.push("## 📒 From your material");
    materialFacts.forEach((m) => lines.push(`- ${m.fact} (${m.file})`));
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

  if (explanation) {
    lines.push("## Explanation");
    lines.push(explanation.summary);
    lines.push("");

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