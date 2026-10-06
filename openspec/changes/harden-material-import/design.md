# Design

## Context

`material-import` is specified and archived; its design lists the known deviations D-1 to D-5. Verification layer 1 (`readMaterial.test.ts`) exists. This change covers the remaining layers and the fixes.

## Goals / Non-Goals

**Goals:**
- Every requirement of `material-import` is covered by a test or an eval.
- The code matches the spec where the spec is clear (D-3, D-5).

**Non-Goals:**
- New `/import` features (PDF, file selection, web upload).

## Decisions

### Layer 2: `materialSpoke.test.ts` (mocked Anthropic client)

Mock `../client.js` with a `create` spy and `trackUsage` with a no-op.

| Requirement | Test |
|---|---|
| Processing all files together | three materials → `create` called exactly once; the content has three material blocks and the instruction |
| Processing all files together | the selected model is passed through to `create` |
| Sources come from the file names | sources equal `user-provided material: <name>`, even if the model's output contains its own sources |
| Folder emptied after every attempt (no throw) | `create` rejects → resolves with `context: ""`; a response without a tool call → the same |

### Layer 3: `agent.import.test.ts` (mocked collaborators)

Mock `./tools/readMaterial.js`, `./spokes/materialSpoke.js`, `./tools/scratchpad.js`, `./classifyInput.js` and `./hub/index.js`. `agent.ts` keeps module-level state, so `vi.resetModules()` and a dynamic import before each test.

| Requirement | Test |
|---|---|
| Triggering | `/import`, `/IMPORT`, `"  /import  "` reach `readAllMaterials`; `classifyInput` and `hub` are never called; a following question sends `hub` a history without `/import` |
| Reading the material | `readAllMaterials` → `[]`: exact message; `materialSpoke` and `updateScratchpad` not called |
| Folder emptied after every attempt | `clearMaterials` called on success and on an empty-context result; only-unsupported files → `clearMaterials` called (D-3, `it.fails` until fixed) |
| Import result | empty context: exact message, no findings update; success: findings appended, topic and subject fallbacks, `"imported N file(s)"`, message with N and confidence |
| D-2 | `/quiz` then `/import` while the question count is awaited: documents the current behavior |

### Layer 4: eval (real API, run manually)

`materialSpoke.eval.ts` in the style of `searchSpoke.eval.ts`: a clear text note gives high or medium confidence and key facts traceable to the text; a blurred or nearly empty image gives low confidence and no invented facts; `/import` then `/quiz` with a known text gives only questions answerable from that text.

## Risks / Trade-offs

- D-2 and D-4 change what the user sees; they need a decision before coding, and possibly a spec delta.
