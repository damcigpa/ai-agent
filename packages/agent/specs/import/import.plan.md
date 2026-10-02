# Plan: `/import` — verification against `specs/import.md`

This plan does not change the feature's design. It maps every acceptance
criterion to the code that implements it and to the test that proves it.
Fixes for the known deviations are listed separately, as optional tasks.

## Code map

| Concern | File | Function |
|---|---|---|
| Command routing, scratchpad update, user messages | `src/agent.ts` | `chat()` — `/import` branch |
| Reading the folder, file types, cleanup | `src/tools/readMaterial.ts` | `readAllMaterials()`, `clearMaterials()` |
| Building the model request, `sources`, error handling | `src/spokes/materialSpoke.ts` | `materialSpoke()` |
| Model instructions | `src/prompts.ts` | `PROMPTS.material` |

## Test infrastructure (prerequisite)

The agent package has no test runner yet. Add Vitest, mirroring `packages/web`:

- `devDependencies`: `vitest`
- `package.json` script: `"test": "vitest run"`
- `vitest.config.mts` with `environment: "node"`, `include: ["src/**/*.test.ts"]`
- Check that Vitest resolves the `./x.js` import specifiers to the `.ts` sources (the agent uses NodeNext-style `.js` imports).

## Test layers

### Layer 1 — `readMaterial.test.ts` (real file system, no API)

Setup: create a temp directory with a `materials/` subfolder, point
`process.cwd()` at it (`vi.spyOn(process, "cwd")`), then **dynamically import**
`readMaterial.ts` after `vi.resetModules()`. `MATERIALS_DIR` is computed at
module load, so the order matters.

| AC | Test |
|---|---|
| AC-4 | `.txt`/`.md` → `kind: "text"` with UTF-8 content; `.jpg`/`.jpeg`/`.png` → `kind: "image"` with correct `mediaType` and base64; `.PNG` (uppercase) also accepted |
| AC-5 | `.gitkeep` and `.DS_Store` are not in the result |
| AC-6 | folder with `a.txt` + `b.pdf` → only `a.txt` returned |
| AC-7 | unreadable entry (e.g. a directory named `x.txt`) is skipped, other files still returned |
| AC-8 (part) | missing folder or only unsupported files → `[]` |
| AC-13 (part) | `clearMaterials()` deletes supported, unsupported and hidden files, keeps `.gitkeep` |

### Layer 2 — `materialSpoke.test.ts` (mocked Anthropic client)

Setup: `vi.mock("../client.js", () => ({ client: { messages: { create: vi.fn() } } }))`,
and mock `trackUsage` to a no-op.

| AC | Test |
|---|---|
| AC-9 | three materials → `create` called exactly **once**; content contains three material blocks plus the instruction |
| AC-10 | the `model` argument is passed through to `create` |
| AC-11 | `sources` equals the file names in `user-provided material: <name>` form, even if the model's tool input contains its own `sources` |
| AC-18 | `create` rejects → function resolves (does not throw) with `context: ""`; response without a `tool_use` block → same |

### Layer 3 — `agent.import.test.ts` (mocked collaborators)

Setup: mock `./tools/readMaterial.js`, `./spokes/materialSpoke.js`,
`./tools/scratchpad.js`, `./classifyInput.js` and `./hub/index.js`.
`agent.ts` keeps module-level state (`messages`, `quizSession`), so
`vi.resetModules()` + dynamic import before each test.

| AC | Test |
|---|---|
| AC-1 | `/import`, `/IMPORT`, `"  /import  "` all reach `readAllMaterials` |
| AC-2 | `classifyInput` and `hub` are never called |
| AC-3 | a following normal question sends `hub` a history without `/import` in it |
| AC-8 | `readAllMaterials` → `[]`: exact message, `materialSpoke` and `updateScratchpad` not called |
| AC-13 | `clearMaterials` called on success **and** on empty-context result |
| AC-14 | empty `context`: exact message, `updateScratchpad` not called |
| AC-15 | success: `updateScratchpad` receives appended findings, `topic`/`subject` fallbacks, `"imported N file(s)"` |
| AC-16 | success message contains N and the confidence |
| D-2 | `/quiz` → `/import` while awaiting the count — documents current behavior |
| D-3 | only-unsupported files: `clearMaterials` called — **expected to fail until fixed** (`it.fails` or `it.todo`) |

### Layer 4 — evals (real API, run manually)

AC-12 and AC-17 depend on model behavior, so they are checked with
`materialSpoke.evals.ts` in the style of `searchSpoke.evals.ts`, not in
`npm test`:

- clear text note → `confidence` high/medium, `keyFacts` traceable to the text
- blurred or near-empty image → `confidence` low, no invented facts
- `/import` → `/quiz` with a known text → every question answerable from that text

## Tasks

**Verification (no behavior change)**
- [ ] T1 Add Vitest to `packages/agent`
- [ ] T2 Layer 1 tests (`readMaterial.test.ts`)
- [ ] T3 Layer 2 tests (`materialSpoke.test.ts`)
- [ ] T4 Layer 3 tests (`agent.import.test.ts`), with D-3 marked as a known failure
- [ ] T5 Layer 4 eval script

**Fixes (optional, each needs a decision first)**
- [ ] F1 D-3: call `clearMaterials()` in the empty-result branch as well
- [ ] F2 D-4: distinguish "folder empty" from "only unsupported files" in the message (links to Q-6)
- [ ] F3 D-5: mention `.jpeg` in the user messages
- [ ] F4 D-2: decide whether commands should interrupt a pending quiz prompt

## Notes outside this spec

- `materialSpoke` does not accept or pass an `AbortSignal`, unlike the other spokes and the project convention that every Anthropic call takes `signal`. Irrelevant for the CLI, but required before reuse in the web upload route.
- The `media_type` cast in `materialSpoke` assumes only JPEG/PNG. If `readMaterial.ts` gains another image type, the cast would hide the mismatch; keep the two lists in sync.