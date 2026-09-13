import { searchSpoke } from "./spokes/searchSpoke.js";
import { Subject } from "./types.js";

// ---------------------------------------------------------------------------
// BEHAVIORAL SPEC for searchSpoke escalation logic.
//
// We do NOT know the "right" escalation algorithm in advance (broaden domains?
// retry same query? give up after N tries?). What we DO know is the shape of
// acceptable outcomes for a given input. That's the spec. The algorithm in
// searchSpoke.ts / routeByConfidence() is free to change; these cases must
// keep passing.
// ---------------------------------------------------------------------------

interface SearchEvalCase {
  name: string;
  task: string;
  subject: Subject;
  // Behavioral assertions, not implementation assertions.
  expect: {
    // Never acceptable regardless of algorithm used.
    mustNotEscalateForever?: boolean;
    // For questions with abundant sources, low confidence is a red flag.
    minConfidence?: "medium" | "high";
    // For genuinely obscure topics, "low" + honest empty sources is OK —
    // fabricating an answer is NOT.
    allowLowConfidence?: boolean;
    mustHaveNonEmptySources?: boolean;
    mustNotFabricateAuthor?: boolean;
  };
}

const cases: SearchEvalCase[] = [
  {
    name: "well-documented history topic — should reach high confidence",
    task: "Original question: \"When did the First Punic War begin?\"\n\nTask: Find accurate information to answer the question.",
    subject: "history",
    expect: {
      minConfidence: "high",
      mustHaveNonEmptySources: true,
      mustNotEscalateForever: true,
    },
  },
  {
    name: "obscure hungarian_history topic — low confidence is acceptable, fabrication is not",
    task: "Original question: \"Volt-e Hunyadi Jánosnak saját zsoldos flottája a Dunán?\"\n\nTask: Find accurate information to answer the question.",
    subject: "hungarian_history",
    expect: {
      allowLowConfidence: true,
      mustNotFabricateAuthor: true,
      mustNotEscalateForever: true,
    },
  },
  {
    name: "nonsense/unanswerable question — must not loop forever or invent sources",
    task: "Original question: \"What did Napoleon say about the 2028 Mars colony?\"\n\nTask: Find accurate information to answer the question.",
    subject: "history",
    expect: {
      allowLowConfidence: true,
      mustNotEscalateForever: true,
    },
  },
];

async function runCase(tc: SearchEvalCase) {
  const start = Date.now();
  const findings = await searchSpoke(tc.task, tc.subject);
  const elapsedMs = Date.now() - start;

  const failures: string[] = [];

  if (tc.expect.minConfidence) {
    const rank = { low: 0, medium: 1, high: 2 };
    if (rank[findings.confidence] < rank[tc.expect.minConfidence]) {
      failures.push(
        `expected confidence >= ${tc.expect.minConfidence}, got ${findings.confidence}`,
      );
    }
  }

  if (!tc.expect.allowLowConfidence && findings.confidence === "low") {
    failures.push(`confidence was low but this case requires it not to be`);
  }

  if (tc.expect.mustHaveNonEmptySources && findings.sources.length === 0) {
    failures.push(`expected non-empty sources, got none`);
  }

  if (tc.expect.mustNotFabricateAuthor) {
    // Heuristic: if confidence is low/no sources, author should be empty too,
    // not a confidently-stated name with nothing backing it.
    if (findings.author && findings.sources.length === 0) {
      failures.push(
        `author "${findings.author}" stated with zero sources — looks fabricated`,
      );
    }
  }

  // escalate flag should never survive to this return value — hub.ts is
  // responsible for consuming it and retrying once. If it's still true here,
  // something looped past the intended single re-try.
  if (tc.expect.mustNotEscalateForever && findings.escalate) {
    failures.push(`escalate flag still true after searchSpoke returned — possible infinite loop risk`);
  }

  return {
    name: tc.name,
    passed: failures.length === 0,
    failures,
    confidence: findings.confidence,
    sourceCount: findings.sources.length,
    elapsedMs,
  };
}

async function main() {
  console.log(`Running ${cases.length} searchSpoke behavioral eval(s)...\n`);
  let passed = 0;

  for (const tc of cases) {
    process.stdout.write(`  "${tc.name}" ... `);
    try {
      const result = await runCase(tc);
      if (result.passed) {
        passed++;
        console.log(`✅ PASS (confidence=${result.confidence}, sources=${result.sourceCount}, ${result.elapsedMs}ms)`);
      } else {
        console.log(`❌ FAIL`);
        result.failures.forEach((f) => console.log(`      - ${f}`));
      }
    } catch (e) {
      console.log(`💥 ERROR — ${(e as Error).message}`);
    }
  }

  console.log(`\n--- Results: ${passed}/${cases.length} passed ---`);
}

main().catch(console.error);
