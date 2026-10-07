# Proposal

## Why

Live runs of the agent showed that the explanation text is not good enough for an eighth grader preparing for an exam: it starts with a made-up title ("# Plain Text Answer"), appears twice in the CLI, invents regnal numbers for names ("I. Katerina", "II. Anna Boleyn" for Catherine of Aragon and Anne Boleyn), adds statements that are in neither the material nor the web findings, and mixes English words into Hungarian answers. This hurts trust in exactly the part the student reads.

## What Changes

- The explanation is written in the language of the question.
- The explanation text is shown once in the CLI: the streamed text stays, the final summary does not repeat it.
- The explanation starts directly with the content: no title or label line.
- Names and terms are used exactly as written in the findings; nothing is added to them (no numbering, no translation or "correction").
- The explanation, including its "significance" part, uses only the facts it was given; if the facts do not support a significance, that part stays empty.
- Section headings (Key Points, Significance, Sources, …) stay in English.

## Capabilities

### New Capabilities
- `answer-quality`: how the explanation text of an answer is written and shown.

### Modified Capabilities

## Impact

- `src/prompts.ts` (explain prompt), `src/spokes/explainSpoke.ts` (user message, tool description), `src/hub/format.ts`, `src/hub/index.ts` (HubOptions), `src/agent.ts` (CLI passes the option).
- The web chat is not changed: it keeps showing the full formatted output.