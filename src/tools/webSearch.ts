import { tavily } from "@tavily/core";
import { createError, formatError } from "../errors.js";

const client = tavily({ apiKey: process.env.TAVILY_API_KEY ?? "" });

export async function webSearch(query: string): Promise<string> {
  try {
    const response = await client.search(query, {
      maxResults: 5,
      searchDepth: "advanced",
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
