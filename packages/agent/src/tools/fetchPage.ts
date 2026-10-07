import { createError, formatError } from "../errors.js";
import { isAllowedUrl, sanitizeExternalText } from "../security.js";

export async function fetchPage(url: string): Promise<string> {
  // Refused before any network request so an injected `fetch_page("http://10.0.0.5/admin")`
  // cannot reach a private service on the student's machine or network.
  if (!isAllowedUrl(url)) {
    return `Could not fetch page at "${url}": only public https URLs are allowed.`;
  }
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

    // Sanitize the fetched text — a page can contain phrases aimed at the model.
    // The surrounding content is kept so the research step still has what to extract.
    // The caller wraps the result in <page_content> tags to isolate it from instructions.
    return `<page_content url="${url}">\n${sanitizeExternalText(truncated)}\n</page_content>`;
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