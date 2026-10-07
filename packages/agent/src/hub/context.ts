import { ResearchFindings } from "../types.js";

export function buildSearchContext({
  userMessage,
  alreadyFound,
  missing,
}: {
  userMessage: string;
  alreadyFound: ResearchFindings | null;
  missing: string[];
}): string {
  // The question is wrapped in a tag so that an injected instruction inside it
  // (and inside any findings from an earlier turn) is recognisable as external
  // content to the search spoke's prompt.
  const parts = [`<question>${userMessage}</question>`];

  if (alreadyFound) {
    parts.push(`Already found:\n${JSON.stringify(alreadyFound, null, 2)}`);
  }

  if (missing.length > 0) {
    parts.push(`Still missing — find specifically: ${missing.join(", ")}`);
  } else {
    parts.push(`Task: Find accurate information to answer the question.`);
  }

  return parts.join("\n\n");
}