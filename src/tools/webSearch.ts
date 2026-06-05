import { tavily } from "@tavily/core";
import { createError, formatError } from "../errors.js";
import { Subject } from "../types.js";
import { sanitizeSearchResults } from "../security.js";

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
  hungarian_history: [
    "rubicon.hu",
    "mult-kor.hu",
    "historia.hu",
    "mek.oszk.hu",
    "tortenelemtanar.hu",
  ],
  hungarian_literature: [
    "mek.oszk.hu",
    "pim.hu",
    "irodalomora.hu",
    "jegyzetem.com",
  ],
  general: [],
};

const SEARCH_TIMEOUT_MS = 15_000;

export async function webSearch(
  query: string,
  subject: Subject = "general"
): Promise<string> {
  try {
    const includeDomains = DOMAIN_MAP[subject];

    const response = await Promise.race([
      client.search(query, {
        maxResults: 5,
        searchDepth: "basic",
        ...(includeDomains.length > 0 && { includeDomains }),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Search timed out after 15s")),
          SEARCH_TIMEOUT_MS,
        ),
      ),
    ]);

    if (!response.results || response.results.length === 0) {
      return `No results found for '${query}'`;
    }

    const formatted = response.results
      .map((r) => `- ${r.title}\n  ${r.url}\n  ${r.content}`)
      .join("\n\n");

    return sanitizeSearchResults(`Search results for '${query}':\n\n${formatted}`);
  } catch (e) {
    const error = createError(
      "SEARCH_FAILED",
      "webSearch",
      `Failed to search for: "${query}"`,
      { cause: e }
    );
    console.error(formatError(error));
    return `Search failed for '${query}': ${(e as Error).message}`;
  }
}