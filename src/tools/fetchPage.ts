import { createError, formatError } from "../errors.js";

export async function fetchPage(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; research-agent/1.0)",
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const error = createError(
        "SEARCH_FAILED",
        "searchSpoke",
        `Failed to fetch page: ${url} — status ${response.status}`,
      );
      console.error(formatError(error));
      return `Could not fetch page at "${url}": HTTP ${response.status}`;
    }

    const html = await response.text();

    // Strip HTML tags and collapse whitespace for clean text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Truncate to avoid overwhelming context window
    const MAX_CHARS = 8000;
    const truncated =
      text.length > MAX_CHARS
        ? text.slice(0, MAX_CHARS) + "\n\n[content truncated...]"
        : text;

    return `Page content from ${url}:\n\n${truncated}`;
  } catch (e) {
    const error = createError(
      "SEARCH_FAILED",
      "searchSpoke",
      `Failed to fetch page: "${url}"`,
      { cause: e },
    );
    console.error(formatError(error));
    return `Could not fetch page at "${url}": ${(e as Error).message}`;
  }
}
