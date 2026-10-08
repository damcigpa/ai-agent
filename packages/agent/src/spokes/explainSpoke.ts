import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { createError, formatError } from "../errors.js";
import { ResearchFindings } from "../types.js";
import { PROMPTS } from "../prompts.js";
import { trackUsage } from "../tokenTracker.js";
import { StreamEvent } from "../progress.js";
import { TEMPERATURE } from "../sampling.js";

const MAX_TURNS = 3;

export interface Explanation {
  summary: string;
  keyPoints: string[];
  significance: string;
  furtherReading: string[];
}

const tools: Anthropic.Tool[] = [
  {
    name: "submit_explanation",
    description: "Submit the structured explanation data after writing the plain text answer",
    input_schema: {
      type: "object",
      properties: {
        keyPoints: {
          type: "array",
          items: { type: "string" },
          description: "Key points of the explanation, each supported by the research findings. Empty array if the findings do not support any.",
        },
        significance: {
          type: "string",
          description: "Why this matters historically or literarily, using only facts stated in the research findings. Empty string if the findings do not support a significance — do not invent one.",
        },
        furtherReading: {
          type: "array",
          items: { type: "string" },
          description: "Topics for further reading related to the question. Empty array if none fit.",
        },
      },
      required: ["keyPoints", "significance", "furtherReading"],
    },
  },
];

export async function explainSpoke(
  findings: ResearchFindings,
  userQuestion: string,
  onEvent: (event: StreamEvent) => void,
  analysisMode: boolean = false,
  model: string = "claude-haiku-4-5-20251001",
  signal?: AbortSignal
): Promise<Explanation> {
  const analysisInstructions = analysisMode
    ? `Provide a DEEP literary analysis including:
- Main themes and their significance
- Literary devices (metaphor, symbolism, allegory, imagery, etc.)
- Structure and form (verse type, rhyme scheme, meter if applicable)
- Historical and biographical context
- The author's message and intent
- Why this work matters in literary history`
    : `Provide a clear, accessible explanation appropriate for an eighth grade student preparing for a high school exam.`;

  try {
    const stream = client.messages.stream(
      {
        model,
        max_tokens: 2048,
        temperature: TEMPERATURE.explain,
        system: [
          {
            type: "text",
            text: PROMPTS.explain,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools,
        tool_choice: { type: "auto" },
        messages: [
          {
            role: "user",
            content: `Answer the student's question using only the research findings below.

<question>${userQuestion}</question>

<findings>
${JSON.stringify(findings, null, 2)}
</findings>

${analysisInstructions}

Format reminder:
- Start your reply directly with the first sentence of the explanation. Do not write a title, a label, a heading, "Plain Text Answer", or any introduction such as "Here is the answer".
- Write in the language of the question above.
- After the prose, call submit_explanation with the structured parts. If the findings do not support a significance, pass an empty string.`,
          },
        ],
      },
      { signal }
    );

    let summary = "";

    // Phase 1 — stream text chunks as they arrive (typing effect)
    stream.on("text", (text) => {
      summary += text;
      onEvent({ type: "chunk", data: text });
    });

    stream.on("message", (msg) => {
      trackUsage(msg.usage);
    });

    const response = await stream.finalMessage();

    onEvent({ type: "done", data: summary });

    // Phase 2 — extract structured data from tool use block
    const toolUse = response.content.find(
      (b) => b.type === "tool_use"
    ) as Anthropic.ToolUseBlock | undefined;

    if (toolUse) {
      onEvent({
        type: "structure",
        data: JSON.stringify(toolUse.input),
      });
      return {
        summary,
        ...(toolUse.input as Omit<Explanation, "summary">),
      };
    }

    return {
      summary,
      keyPoints: findings.keyFacts ?? [],
      significance: "",
      furtherReading: [],
    };
  } catch (e) {
    const error = createError(
      "API_FAILED",
      "searchSpoke",
      "API call failed in explain spoke",
      { cause: e }
    );
    console.error(formatError(error));
    onEvent({ type: "error", data: (e as Error).message });

    return {
      summary: findings.context || "Could not generate explanation",
      keyPoints: findings.keyFacts ?? [],
      significance: "",
      furtherReading: [],
    };
  }
}