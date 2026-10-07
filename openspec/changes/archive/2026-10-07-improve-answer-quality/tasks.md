# Tasks

## 1. Prompt

- [x] 1.1 Explain prompt: remove "Always respond with valid JSON only"; add the rules for language, no title, names as given, only the given facts (D1–D4)
- [x] 1.2 `explainSpoke`: user message (no title, no label) and the `significance` field description (D1, D4)

## 2. Output

- [x] 2.1 `HubOptions.explanationAlreadyShown`; `formatOutput` and `formatAnalysis` leave out the explanation text when it is set (D5)
- [x] 2.2 CLI (`agent.ts`) sets the option; the web is unchanged (D5)

## 3. Verification

- [x] 3.2 Manual run in the CLI: one Hungarian question, check the six points of the proposal