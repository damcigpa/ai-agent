import { createError, formatError } from "../errors.js";
import { webSearch } from "./webSearch.js";
import { ResearchFindings } from "../types.js";

interface VerificationResult {
  confirmed: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
  sources: string[];
}

export async function verifyFact(
  findings: ResearchFindings,
): Promise<VerificationResult> {
  try {
    // Build a targeted verification query from the findings
    const query = [
      findings.author && `author "${findings.author}"`,
      findings.work && `work "${findings.work}"`,
      findings.date && `date "${findings.date}"`,
    ]
      .filter(Boolean)
      .join(" ");

    if (!query) {
      return {
        confirmed: false,
        confidence: "low",
        reason: "Not enough data to verify",
        sources: [],
      };
    }

    const searchResults = await webSearch(query);

    // Check if results corroborate the findings
    const authorMatch =
      findings.author &&
      searchResults.toLowerCase().includes(findings.author.toLowerCase());
    const workMatch =
      findings.work &&
      searchResults.toLowerCase().includes(findings.work.toLowerCase());

    const matchCount = [authorMatch, workMatch].filter(Boolean).length;
    const totalChecks = [findings.author, findings.work].filter(Boolean).length;

    // Extract URLs from search results as sources
    const urlPattern = /https?:\/\/[^\s]+/g;
    const sources = searchResults.match(urlPattern) ?? [];

    if (matchCount === totalChecks && totalChecks > 0) {
      return {
        confirmed: true,
        confidence: "high",
        reason: `Verified: author and work confirmed by independent search`,
        sources,
      };
    }

    if (matchCount > 0) {
      return {
        confirmed: true,
        confidence: "medium",
        reason: `Partially verified: ${matchCount}/${totalChecks} fields confirmed`,
        sources,
      };
    }

    return {
      confirmed: false,
      confidence: "low",
      reason: "Could not independently confirm the findings",
      sources,
    };
  } catch (e) {
    const error = createError(
      "SEARCH_FAILED",
      "searchSpoke",
      "verify_fact failed during independent search",
      { cause: e },
    );
    console.error(formatError(error));
    return {
      confirmed: false,
      confidence: "low",
      reason: `Verification failed: ${(e as Error).message}`,
      sources: [],
    };
  }
}
