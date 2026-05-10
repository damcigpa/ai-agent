import Anthropic from "@anthropic-ai/sdk";
import { client } from "../client.js";
import { ResearchFindings, Subject } from "../types.js";
import { PROMPTS } from "../prompts.js";
import { trackUsage } from "../tokenTracker.js";

export async function detectSubjectAndDecompose(
  userMessage: string,
  previousTopic: string = ""
): Promise<{ subject: Subject; steps: string[]; newTopic: boolean; topic: string }> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: [
      {
        type: "text",
        text: PROMPTS.hub,
        cache_control: { type: "ephemeral" },
      }
    ],
    messages: [
      {
        role: "user",
        content: `Classify this question into a subject, break it into ordered steps, identify the topic, and determine if it's a new topic compared to the previous one.

Available subjects: literature, history, science, literary_analysis, hungarian_history, hungarian_literature, general

Available agents:
- search_spoke: searches the web for accurate information
- analyze_spoke: performs deep literary analysis of novels and poems
- explain_spoke: turns research or analysis findings into a clear explanation

Rules for including explain_spoke:
- SKIP explain_spoke for simple factual questions where search results are sufficient
  Examples: "When did X happen?", "Who was X?", "What year was X?", "Where is X?"
- INCLUDE explain_spoke for complex questions requiring deeper understanding
  Examples: "Why did X happen?", "What were the causes of X?", "How did X affect Y?", "What is the significance of X?"
- ALWAYS include explain_spoke for literary_analysis questions

Previous topic: "${previousTopic || "none"}"
Current question: "${userMessage}"

Reply with only a JSON object, no explanation. Examples:
{ "subject": "history", "topic": "Caesar crossing Rubicon date", "newTopic": true, "steps": ["search for information about: when did Caesar cross the Rubicon", "explain the findings clearly"] }
{ "subject": "history", "topic": "Napoleon's laws", "newTopic": true, "steps": ["search for information about: Napoleon's laws", "explain the findings clearly"] }
{ "subject": "literary_analysis", "topic": "Hamlet soliloquy", "newTopic": true, "steps": ["analyze the work", "explain the analysis in accessible terms"] }
{ "subject": "hungarian_history", "topic": "Rákóczi szabadságharc", "newTopic": true, "steps": ["search for information about: Rákóczi Ferenc szabadságharca", "explain the findings clearly"] }
{ "subject": "hungarian_literature", "topic": "Petőfi Sándor", "newTopic": true, "steps": ["search for information about: Petőfi Sándor élete és munkássága", "explain the findings clearly"] }
{ "subject": "history", "topic": "Napoleon's laws", "newTopic": false, "steps": ["search for information about: economic effects of Napoleon's laws", "explain the findings clearly"] }`,
      },
    ],
  });

  trackUsage(response.usage);

  const text = (response.content[0] as Anthropic.TextBlock).text
    .trim()
    .replace(/```json|```/g, "")
    .trim();

  try {
    const parsed = JSON.parse(text) as {
      subject: Subject;
      steps: string[];
      newTopic: boolean;
      topic: string;
    };
    return parsed;
  } catch {
    return {
      subject: "general",
      topic: userMessage,
      newTopic: true,
      steps: [
        `search for information about: ${userMessage}`,
        "explain the findings clearly",
      ],
    };
  }
}

export async function replan(
  remainingSteps: string[],
  completedStep: string,
  findings: ResearchFindings
): Promise<string[]> {
  if (remainingSteps.length <= 1) return remainingSteps;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 128,
    system: [
      {
        type: "text",
        text: PROMPTS.hub,
        cache_control: { type: "ephemeral" },
      }
    ],
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

Reply with only a JSON array of remaining steps, nothing else.`,
      },
    ],
  });

  trackUsage(response.usage);

  const text = (response.content[0] as Anthropic.TextBlock).text.trim();
  try {
    return JSON.parse(text);
  } catch {
    return remainingSteps;
  }
}