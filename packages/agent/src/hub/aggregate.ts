import { ResearchFindings } from "../types.js";

function mergeConfidence(
  a: ResearchFindings["confidence"],
  b: ResearchFindings["confidence"]
): ResearchFindings["confidence"] {
  if (a === "high" || b === "high") return "high";
  if (a === "medium" || b === "medium") return "medium";
  return "low";
}

export function aggregateFindings(
  initial: ResearchFindings,
  retry: ResearchFindings,
): ResearchFindings {
  return {
    author: initial.author || retry.author,
    work: initial.work || retry.work,
    date: initial.date || retry.date,
    context: initial.context || retry.context,
    confidence: mergeConfidence(initial.confidence, retry.confidence),
    sources: [...new Set([...initial.sources, ...retry.sources])],
    subject: initial.subject,
    keyFacts: [
      ...new Set([...(initial.keyFacts ?? []), ...(retry.keyFacts ?? [])]),
    ],
  };
}
