# Design

## Context

Causes found in the code:
- `PROMPTS.explain` ends with "Always respond with valid JSON only", while `explainSpoke` asks for plain text first and a tool call after it. The contradiction produces the made-up "# Plain Text Answer" title.
- The CLI prints the streamed text (`chunk` events) and then the final formatted output, which contains the same summary under "## Explanation".
- No prompt says which language to answer in; the headings in `format.ts` are hard-coded English.
- The prompt says "do not add outside information", but the `significance` tool field asks "why this matters", which invites the model's own knowledge.
- Nothing forbids "improving" names.

## Goals / Non-Goals

**Goals:**
- Each requirement of `answer-quality` holds in the CLI and in the web chat.

**Non-Goals:**
- Translating the headings (decision: they stay English).
- Changing what is researched, how the material is judged, or the web layout.

## Decisions

### D1: Fix the contradicting instruction
Remove "Always respond with valid JSON only" from the explain prompt and say what the model really does: write the answer as plain text starting with the content, then call the tool. The user message also says: no title, no label.

### D2: Language of the question
The prompt says: answer in the language of the question. Terms keep their original form where a term is needed for the exam (the existing rule about defining terms stays).

### D3: Names exactly as given
The prompt says: use names and terms exactly as in the findings; do not add numbering, titles or translations.

### D4: Only the given facts
The prompt says: every statement must be in the findings. The `significance` field description changes from "Why this matters" to "Why this matters, using only the given facts; empty string if they do not say". `format.ts` already prints Significance only when it is not empty.

### D5: Show the text once in the CLI
`HubOptions` gets `explanationAlreadyShown?: boolean`. The CLI sets it to true (it streams the text), the web does not. `formatOutput` and `formatAnalysis` then leave out the explanation text under "## Explanation" (the heading with nothing under it is dropped too). Key points, significance and sources are still printed.

## Risks / Trade-offs

- Prompt rules reduce but do not guarantee the behavior (a model can still add a fact). They are checked with the real model in an eval (task 4), not with fake answers.
- Without the title line the streamed text is followed directly by the formatted block; this is accepted.