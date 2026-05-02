import { ResearchFindings } from "../types.js";

export function aggregateFindings(
  initial: ResearchFindings,
  retry: ResearchFindings,
): ResearchFindings {
  return {
    author: initial.author || retry.author,
    work: initial.work || retry.work,
    date: initial.date || retry.date,
    context: initial.context || retry.context,
    confidence:
      initial.confidence === "high" || retry.confidence === "high"
        ? "high"
        : initial.confidence === "medium" || retry.confidence === "medium"
          ? "medium"
          : "low",
    sources: [...new Set([...initial.sources, ...retry.sources])],
    subject: initial.subject,
    keyFacts: [
      ...new Set([...(initial.keyFacts ?? []), ...(retry.keyFacts ?? [])]),
    ],
  };
}
