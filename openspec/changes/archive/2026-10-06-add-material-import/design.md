# Design

## Context

Retroactive: `/import` was implemented first (`src/agent.ts`, `src/tools/readMaterial.ts`, `src/spokes/materialSpoke.ts`), and its specification was written afterwards from the agreed decisions and the code. Where the code differs from the agreed behavior, the difference is listed under Known Deviations instead of being written into the spec. The material library (`add-material-library`) is a separate, persistent way to use the student's material; `/import` remains a one-shot path into `/quiz`.

## Goals / Non-Goals

**Goals:**
- One command turns a folder of notes or page photos into findings that the existing `/quiz` flow can use.

**Non-Goals:**
- PDF files.
- An explanation step on the imported material (only the quiz uses it).
- Web search to supplement the material.
- Web upload for `/import` (the web app has the material library instead).
- Selecting individual files (`/import <filename>`).

## Decisions

**One request for all files.** Related pages must be processed together; separate calls would leave `/quiz` seeing only the last file.

**Images are read by the model directly**, without a separate OCR step.

**Sources are built by the code from the file names**, so the model cannot invent sources.

**The folder is emptied in every outcome**, so an old page is never imported again by accident. The extraction step never throws: an API failure or a missing structured result returns findings with empty context, which ends in the unusable-result path and still reaches the cleanup.

**The result is stored as research findings**, so `/quiz` works on it without changes.

### Code map

| Concern | File | Function |
|---|---|---|
| Command routing, findings update, user messages | `src/agent.ts` | `chat()`, `/import` branch |
| Reading the folder, file types, cleanup | `src/tools/readMaterial.ts` | `readAllMaterials()`, `clearMaterials()` |
| Building the model request, sources, error handling | `src/spokes/materialSpoke.ts` | `materialSpoke()` |
| Model instructions | `src/prompts.ts` | `PROMPTS.material` |

### Verification

Four layers; layer 1 is in place, layers 2–4 are tracked in the `harden-material-import` change.

1. `readMaterial.test.ts`: real file system in temp folders, no API (file types, hidden files, unsupported and unreadable files, cleanup). `MATERIALS_DIR` is computed at module load, so `process.cwd()` is mocked and the module imported dynamically after `vi.resetModules()`.
2. `materialSpoke.test.ts`: mocked Anthropic client (one request, model passed through, sources from file names, never throws).
3. `agent.import.test.ts`: mocked collaborators (triggering, history, messages, findings update, cleanup).
4. Evals with the real API, run manually (confidence on clear and blurred material, quiz answerable from the imported text).

## Risks / Trade-offs

### Known deviations (code vs. spec)

| ID | Requirement | Current behavior | Status |
|---|---|---|---|
| D-1 | Folder emptied after every attempt | The cleanup runs only if the extraction returns normally. | Resolved in practice: the extraction never throws. Needs a test. |
| D-2 | Triggering | If a quiz is waiting for the question count, `/import` is read as the count and a 5-question quiz starts; if a quiz is waiting for an answer, the user gets "Please answer with A, B, C, or D." | Open: is this intended? |
| D-3 | Folder emptied after every attempt | If the folder contains only unsupported files, the "nothing to import" branch returns early and the cleanup never runs. | Confirmed in code |
| D-4 | Nothing to import | In the same case the message says "No files found" although files are present; skipped files are only reported in the console. | Confirmed in code |
| D-5 | Reading the material | The user-facing messages list `.jpg` and `.png` but not `.jpeg`, which is accepted. | Cosmetic |

### Open questions

- **Q-2** Size limits per file or in total, given that all images go to the model in one request? Currently none.
- **Q-3** Imported content does not pass through the injection/topic classifier. Acceptable for a local CLI?
- **Q-4** `/import` appends to findings left over from an earlier topic; the next research question may reset them as a new topic and drop the imported material. Is that the desired lifecycle?
- **Q-5** Files are sent in `readdirSync` order, which is not guaranteed to be alphabetical. Should they be sorted by name, since page order matters?
- **Q-6** Should the user be told which files were skipped, not just the console?
- **Q-7** Text files are labeled with their file name in the prompt, images are not. Should images get a label too?
- **Q-8** `max_tokens` is 1024 for the combined extraction. Should it scale with the number of files?
- **Q-9** (new) With the material library in place, should `/import` stay, or be replaced by "add to the library, then quiz"?

### Notes

- The extraction does not accept or pass an `AbortSignal`, unlike the other spokes. Irrelevant for the CLI, required before any reuse in a web route.
- The image `media_type` cast assumes JPEG/PNG only; keep it in sync with the file types `readMaterial.ts` accepts.

### Notes for tests

- `MATERIALS_DIR` is computed from `process.cwd()` at module load time: tests must set the working directory, or mock `process.cwd`, before importing `readMaterial.ts`.
- The cleanup cannot delete subdirectories in `materials/`; they are out of scope.
