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

  if (findings.keyFacts?.length) {
    lines.push("## Key Facts");
    findings.keyFacts.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
  }

  if (findings.sources.length) {
    lines.push("## Sources");
    findings.sources.forEach((s) => lines.push(`- ${s}`));
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
