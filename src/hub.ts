import Anthropic from "@anthropic-ai/sdk";
import { client } from "./client.js";
import { searchSpoke, ResearchFindings } from "./spokes/searchSpoke.js";
import { fileSpoke } from "./spokes/fileSpoke.js";

const MAX_TURNS = 10;
const MAX_SEARCH_RETRIES = 2;

const tools: Anthropic.Tool[] = [
  {
    name: "search_spoke",
    description:
      "Delegates a research task to the search agent. Use this to find the origin, author, source, or background context of a given text.",
    input_schema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description:
            "The research task to delegate, including the text to investigate.",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "file_spoke",
    description:
      "Delegates a file writing task to the file agent. Use this to write context or research findings to output.txt.",
    input_schema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description:
            "The file writing task, including the full content to write.",
        },
      },
      required: ["task"],
    },
  },
];

// --- Initial task decomposition ---

async function decomposeTask(userMessage: string): Promise<string[]> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `You are a task planner. Break the following task into ordered steps.

Available agents:
- search_spoke: searches the web for information, origins, context
- file_spoke: writes content to output.txt

Task: "${userMessage}"

Reply with only a JSON array of step descriptions, nothing else.
Example: ["search for the origin of the text", "write findings to output.txt"]`,
      },
    ],
  });

  const text = (response.content[0] as Anthropic.TextBlock).text.trim();
  try {
    return JSON.parse(text);
  } catch {
    return [
      "search for the origin and context of the given text",
      "write findings to output.txt",
    ];
  }
}

// --- Dynamic replanning after each step ---

async function replan(
  originalSteps: string[],
  completedStep: string,
  findings: ResearchFindings,
): Promise<string[]> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `You are a task planner. Given the original plan and current findings, decide if the remaining steps need to change.

Original steps: ${JSON.stringify(originalSteps)}
Completed step: "${completedStep}"
Current findings: ${JSON.stringify(findings, null, 2)}

Rules:
- If confidence is low, add another search step targeting weak areas before writing
- If author or work is missing, add a targeted search before writing
- If everything looks complete and confidence is high, keep remaining steps as is
- Always end with a file_spoke step to write findings to output.txt

Reply with only a JSON array of remaining steps, nothing else.`,
      },
    ],
  });

  const text = (response.content[0] as Anthropic.TextBlock).text.trim();
  try {
    return JSON.parse(text);
  } catch {
    return originalSteps;
  }
}

// --- Coverage evaluation ---

interface CoverageResult {
  complete: boolean;
  missing: string[];
}

function evaluateCoverage(findings: ResearchFindings): CoverageResult {
  const fields: (keyof ResearchFindings)[] = [
    "author",
    "work",
    "date",
    "context",
  ];
  const missing = fields.filter((f) => !findings[f]);
  return {
    complete: missing.length === 0,
    missing,
  };
}

// --- Aggregate findings ---

function aggregateFindings(
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
  };
}

// --- Format findings for file spoke ---

function formatFindings(findings: ResearchFindings): string {
  return `## Research Findings

**Author:** ${findings.author || "Unknown"}
**Work:** ${findings.work || "Unknown"}
**Date:** ${findings.date || "Unknown"}
**Confidence:** ${findings.confidence}

**Context:**
${findings.context || "No context found"}

**Sources:**
${findings.sources.length > 0 ? findings.sources.map((s) => `- ${s}`).join("\n") : "No sources found"}`;
}

// --- Build rich context for spoke invocation ---

function buildSearchContext({
  userMessage,
  alreadyFound,
  missing,
}: {
  userMessage: string;
  alreadyFound: ResearchFindings | null;
  missing: string[];
}): string {
  const parts = [`Original user request: "${userMessage}"`];

  if (alreadyFound) {
    parts.push(`Already found:\n${JSON.stringify(alreadyFound, null, 2)}`);
  }

  if (missing.length > 0) {
    parts.push(`Still missing — find specifically: ${missing.join(", ")}`);
  } else {
    parts.push(
      `Task: Find the origin, author, work, date, and context of the text in the user request.`,
    );
  }

  return parts.join("\n\n");
}

// --- Execute a single step ---

async function executeStep(
  step: string,
  userMessage: string,
  searchFindings: ResearchFindings | null,
): Promise<{ result: string; updatedFindings: ResearchFindings | null }> {
  // Determine which spoke to call based on step description
  if (
    step.toLowerCase().includes("search") ||
    step.toLowerCase().includes("find")
  ) {
    const { complete, missing } = searchFindings
      ? evaluateCoverage(searchFindings)
      : { complete: false, missing: [] };

    const context = buildSearchContext({
      userMessage,
      alreadyFound: searchFindings,
      missing,
    });

    let findings = await searchSpoke(context);

    // Coverage check + retry loop
    let { complete: isComplete, missing: stillMissing } =
      evaluateCoverage(findings);
    console.log(
      isComplete
        ? `  ✅ Coverage complete (confidence: ${findings.confidence})`
        : `  ⚠️  Missing: ${stillMissing.join(", ")} — retrying...`,
    );

    let retryCount = 0;
    while (
      !isComplete &&
      stillMissing.length > 0 &&
      retryCount < MAX_SEARCH_RETRIES
    ) {
      const retryContext = buildSearchContext({
        userMessage,
        alreadyFound: findings,
        missing: stillMissing,
      });
      const retryFindings = await searchSpoke(retryContext);
      findings = aggregateFindings(findings, retryFindings);

      ({ complete: isComplete, missing: stillMissing } =
        evaluateCoverage(findings));
      retryCount++;
      console.log(
        isComplete
          ? `  ✅ Coverage complete after retry ${retryCount}`
          : `  ⚠️  Still missing: ${stillMissing.join(", ")} (retry ${retryCount}/${MAX_SEARCH_RETRIES})`,
      );
    }

    return {
      result: formatFindings(findings),
      updatedFindings: findings,
    };
  }

  if (
    step.toLowerCase().includes("write") ||
    step.toLowerCase().includes("file")
  ) {
    const content = searchFindings
      ? formatFindings(searchFindings)
      : "No findings to write.";
    const result = await fileSpoke(
      `Write the following research findings to output.txt:\n\n${content}`,
    );
    return { result, updatedFindings: searchFindings };
  }

  return { result: `Unknown step: ${step}`, updatedFindings: searchFindings };
}

// --- Hub ---

export async function hub(messages: Anthropic.MessageParam[]): Promise<string> {
  const lastContent = messages[messages.length - 1].content;
  const userMessage =
    typeof lastContent === "string"
      ? lastContent
      : (lastContent as Anthropic.TextBlockParam[])[0].text;

  // 1. Initial decomposition
  let remainingSteps = await decomposeTask(userMessage);
  console.log("\n📋 Initial plan:", remainingSteps);

  let searchFindings: ResearchFindings | null = null;
  let turn = 0;

  while (remainingSteps.length > 0 && turn < MAX_TURNS) {
    turn++;

    // 2. Take next step
    const currentStep = remainingSteps[0];
    remainingSteps = remainingSteps.slice(1);
    console.log(`\n  [hub → executing] "${currentStep}"`);

    // 3. Execute step
    const { result, updatedFindings } = await executeStep(
      currentStep,
      userMessage,
      searchFindings,
    );
    searchFindings = updatedFindings;

    // 4. Replan remaining steps based on findings
    if (searchFindings && remainingSteps.length > 0) {
      const adaptedSteps = await replan(
        remainingSteps,
        currentStep,
        searchFindings,
      );

      if (JSON.stringify(adaptedSteps) !== JSON.stringify(remainingSteps)) {
        console.log("  🔄 Plan adapted:", adaptedSteps);
      }

      remainingSteps = adaptedSteps;
    }
  }

  if (turn >= MAX_TURNS) {
    console.warn(`⚠️  Warning: max turns (${MAX_TURNS}) reached in hub`);
  }

  return searchFindings
    ? `Research complete. Findings written to output.txt.\n\n${formatFindings(searchFindings)}`
    : "Hub could not complete the task.";
}
