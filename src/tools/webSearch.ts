import { tavily } from "@tavily/core";
import { createError, formatError } from "../errors.js";
import { Subject } from "../types.js";

const client = tavily({ apiKey: process.env.TAVILY_API_KEY ?? "" });

const DOMAIN_MAP: Record<Subject, string[]> = {
  literature: [
    "britannica.com",
    "poetryfoundation.org",
    "sparknotes.com",
    "litcharts.com",
    "gutenberg.org",
  ],
  literary_analysis: [
    "jstor.org",
    "litcharts.com",
    "sparknotes.com",
    "poetryfoundation.org",
    "theguardian.com",
    "newyorker.com",
  ],
  history: [
    "britannica.com",
    "history.com",
    "smithsonianmag.com",
    "bbc.co.uk",
    "khanacademy.org",
  ],
  science: [
    "britannica.com",
    "khanacademy.org",
    "sciencedaily.com",
    "nature.com",
    "nasa.gov",
  ],
  general: [],
};

export async function webSearch(
  query: string,
  subject: Subject = "general",
): Promise<string> {
  try {
    const includeDomains = DOMAIN_MAP[subject];

    const response = await client.search(query, {
      maxResults: 5,
      searchDepth: "advanced",
      ...(includeDomains.length > 0 && { includeDomains }),
    });

    if (!response.results || response.results.length === 0) {
      return `No results found for '${query}'`;
    }

    const formatted = response.results
      .map((r) => `- ${r.title}\n  ${r.url}\n  ${r.content}`)
      .join("\n\n");

    return `Search results for '${query}':\n\n${formatted}`;
  } catch (e) {
    const error = createError(
      "SEARCH_FAILED",
      "webSearch",
      `Failed to search for: "${query}"`,
      { cause: e },
    );
    console.error(formatError(error));
    return `Search failed for '${query}': ${(e as Error).message}`;
  }
}
