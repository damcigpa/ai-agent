import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { ResearchFindings } from "../types.js";
import { PROMPTS } from "../prompts.js";
import { trackUsage } from "../tokenTracker.js";
import { createError, formatError } from "../errors.js";
import { NamedMaterial } from "../tools/readMaterial.js";
import { TEMPERATURE } from "../sampling.js";

const tools: Anthropic.Tool[] = [
  {
    name: "submit_findings",
    description: "Submit structured findings extracted from the provided material",
    input_schema: {
      type: "object",
      properties: {
        author: { type: "string" },
        work: { type: "string" },
        date: { type: "string" },
        context: { type: "string" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        subject: {
          type: "string",
          enum: ["literature", "history", "hungarian_history", "hungarian_literature", "general"],
        },
        keyFacts: { type: "array", items: { type: "string" } },
      },
      required: ["author", "work", "date", "context", "confidence", "subject", "keyFacts"],
    },
  },
];

function emptyFindings(sources: string[] = ["user-provided material"]): ResearchFindings {
  return {
    author: "",
    work: "",
    date: "",
    context: "",
    confidence: "low",
    sources,
    subject: "general",
    keyFacts: [],
  };
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string } };

export async function materialSpoke(
  materials: NamedMaterial[],
  model: string = "claude-haiku-4-5-20251001",
): Promise<ResearchFindings> {
  if (materials.length === 0) {
    return emptyFindings([]);
  }

  const sources = materials.map((m) => `user-provided material: ${m.filename}`);

  const blocks: ContentBlock[] = [];

  for (const { filename, content } of materials) {
    if (content.kind === "image") {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: content.mediaType as "image/jpeg" | "image/png",
          data: content.base64,
        },
      });
    } else {
      blocks.push({ type: "text", text: `--- ${filename} ---\n${content.text}` });
    }
  }

  const instruction =
    materials.length > 1
      ? `This is a set of ${materials.length} pages or files the student provided together — they likely belong to the same topic or chapter. Read all of them and extract ONE combined set of structured findings covering the whole set. If parts are hard to read, reflect that honestly in the confidence level.`
      : "This is material the student provided. Read it and extract structured findings from it. If parts are hard to read, reflect that honestly in the confidence level.";

  blocks.push({ type: "text", text: instruction });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      temperature: TEMPERATURE.extract,
      system: [
        {
          type: "text",
          text: PROMPTS.material,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools,
      tool_choice: { type: "tool", name: "submit_findings" },
      messages: [{ role: "user", content: blocks }],
    });

    trackUsage(response.usage);

    const toolUse = response.content.find(
      (b) => b.type === "tool_use",
    ) as Anthropic.ToolUseBlock | undefined;

    if (toolUse) {
      const input = toolUse.input as Omit<ResearchFindings, "sources">;
      return { ...input, sources };
    }
  } catch (e) {
    const error = createError(
      "API_FAILED",
      "materialSpoke",
      "Failed to extract findings from material",
      { cause: e },
    );
    console.error(formatError(error));
  }

  return emptyFindings(sources);
}