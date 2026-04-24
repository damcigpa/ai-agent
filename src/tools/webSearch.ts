export function webSearch(query: string): string {
  const results = [
    {
      title: `Result 1 for '${query}'`,
      snippet: `This is a summary about ${query}. It covers the basics and key concepts.`,
    },
    {
      title: `Result 2 for '${query}'`,
      snippet: `An in-depth look at ${query} with examples and use cases.`,
    },
    {
      title: `Result 3 for '${query}'`,
      snippet: `Latest news and updates related to ${query}.`,
    },
  ];

  const formatted = results.map((r) => `- ${r.title}: ${r.snippet}`).join("\n");
  return `Search results for '${query}':\n${formatted}`;
}
