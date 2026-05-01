import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { ResearchFindings, Subject } from "../types.js";
import { PROMPTS } from "../prompts.js";

export async function detectSubjectAndDecompose(
  userMessage: string,
): Promise<{ subject: Subject; steps: string[] }> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: PROMPTS.hub,
    messages: [
      {
        role: "user",
        content: `Classify this question into a subject and break it into ordered steps.

Available subjects: literature, history, science, literary_analysis, general

Available agents:
- search_spoke: searches the web for accurate information
- analyze_spoke: performs deep literary analysis of novels and poems
- explain_spoke: turns research or analysis findings into a clear explanation
- file_spoke: writes the final explanation to output.txt

Question: "${userMessage}"

Reply with only a JSON object, no explanation:
{
  "subject": "history",
  "steps": ["search for information about the topic", "explain the findings clearly", "write explanation to output.txt"]
}`,
      },
    ],
  });

  const text = (response.content[0] as Anthropic.TextBlock).text
    .trim()
    .replace(/```json|```/g, "")
    .trim();

  try {
    const parsed = JSON.parse(text) as { subject: Subject; steps: string[] };
    return parsed;
  } catch {
    return {
      subject: "general",
      steps: [
        `search for information about: ${userMessage}`,
        "explain the findings clearly",
        "write explanation to output.txt",
      ],
    };
  }
}

export async function replan(
  remainingSteps: string[],
  completedStep: string,
  findings: ResearchFindings,
): Promise<string[]> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: PROMPTS.hub,
    messages: [
      {
        role: "user",
        content: `You are a task planner. Given the completed step and current findings, decide if the remaining steps need to change.

Remaining steps: ${JSON.stringify(remainingSteps)}
Completed step: "${completedStep}"
Current findings: ${JSON.stringify(findings, null, 2)}

Rules:
- If confidence is low, add another search step before explaining
- If confidence is high, keep remaining steps as is
- Always end with file_spoke to write to output.txt

Reply with only a JSON array of remaining steps, nothing else.`,
      },
    ],
  });

  const text = (response.content[0] as Anthropic.TextBlock).text.trim();
  try {
    return JSON.parse(text);
  } catch {
    return remainingSteps;
  }
}
