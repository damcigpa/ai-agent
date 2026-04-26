import Anthropic from "@anthropic-ai/sdk";
import { client } from "./client.js";
import { tools, runTool } from "./tools/index.js";

// --- Types ---

interface TestCase {
  input: string;
  expectedTool?: string;
  expectedToolInput?: Record<string, string>;
  useGrader?: boolean;
}

interface EvalResult {
  input: string;
  passed: boolean;
  reason: string;
  toolCalled?: string;
  toolInput?: Record<string, string>;
  finalResponse?: string;
}

// --- Test cases ---
// expectedTool     → checks the right tool was called
// expectedToolInput → checks the tool was called with the right input
// useGrader        → asks Claude to judge the final response quality

const testCases: TestCase[] = [
  {
    input: "Search for TypeScript tutorials",
    expectedTool: "web_search",
    expectedToolInput: { query: "TypeScript tutorials" },
    useGrader: true,
  },
  {
    input: "What is the latest news on AI?",
    expectedTool: "web_search",
    useGrader: true,
  },
  {
    input: "What is the capital of France?",
    // No tool expected — Claude should answer from knowledge
    useGrader: true,
  },
];

// --- Grader ---

async function gradeWithClaude(
  input: string,
  finalResponse: string,
): Promise<{ passed: boolean; reason: string }> {
  const grade = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `
          User asked: "${input}"
          Agent responded: "${finalResponse}"

          Did the agent give a helpful and accurate response?
          Reply with only YES or NO, followed by a one sentence reason.
          Example: "YES - the response clearly answered the question."
        `,
      },
    ],
  });

  const text = (grade.content[0] as Anthropic.TextBlock).text.trim();
  const passed = text.startsWith("YES");
  return { passed, reason: text };
}

// --- Run a single test case ---

async function runTestCase(tc: TestCase): Promise<EvalResult> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: tc.input },
  ];

  let toolCalled: string | undefined;
  let toolInput: Record<string, string> | undefined;
  let finalResponse: string | undefined;

  // Agentic loop (up to 5 turns)
  for (let turn = 0; turn < 5; turn++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      tools,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      finalResponse = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("");
      break;
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          toolCalled = block.name;
          toolInput = block.input as Record<string, string>;

          const result = runTool(block.name, toolInput);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  // --- Scoring ---

  // 1. Check tool was called when expected
  if (tc.expectedTool && toolCalled !== tc.expectedTool) {
    return {
      input: tc.input,
      passed: false,
      reason: `Expected tool '${tc.expectedTool}' but got '${toolCalled ?? "none"}'`,
      toolCalled,
      toolInput,
      finalResponse,
    };
  }

  // 2. Check no tool was called when none expected
  if (!tc.expectedTool && toolCalled) {
    return {
      input: tc.input,
      passed: false,
      reason: `Expected no tool but '${toolCalled}' was called`,
      toolCalled,
      toolInput,
      finalResponse,
    };
  }

  // 3. Check tool input contains expected values
  if (tc.expectedToolInput && toolInput) {
    for (const [key, value] of Object.entries(tc.expectedToolInput)) {
      if (!toolInput[key]?.toLowerCase().includes(value.toLowerCase())) {
        return {
          input: tc.input,
          passed: false,
          reason: `Expected tool input '${key}' to include '${value}' but got '${toolInput[key]}'`,
          toolCalled,
          toolInput,
          finalResponse,
        };
      }
    }
  }

  // 4. Grade response quality with Claude
  if (tc.useGrader && finalResponse) {
    const { passed, reason } = await gradeWithClaude(tc.input, finalResponse);
    return {
      input: tc.input,
      passed,
      reason,
      toolCalled,
      toolInput,
      finalResponse,
    };
  }

  return {
    input: tc.input,
    passed: true,
    reason: "All checks passed",
    toolCalled,
    toolInput,
    finalResponse,
  };
}

// --- Run all evals ---

async function runEvals() {
  console.log(`Running ${testCases.length} eval(s)...\n`);

  const results: EvalResult[] = [];

  for (const tc of testCases) {
    process.stdout.write(`  "${tc.input}" ... `);
    try {
      const result = await runTestCase(tc);
      results.push(result);
      console.log(result.passed ? "✅ PASS" : `❌ FAIL — ${result.reason}`);
    } catch (e) {
      console.log(`💥 ERROR — ${(e as Error).message}`);
      results.push({
        input: tc.input,
        passed: false,
        reason: `Exception: ${(e as Error).message}`,
      });
    }
  }

  // --- Summary ---

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  console.log(`\n--- Results ---`);
  console.log(`✅ Passed: ${passed}/${results.length}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}/${results.length}`);
    console.log("\nFailed cases:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`  - "${r.input}": ${r.reason}`));
  }
}

runEvals().catch(console.error);
