# Spec: Material library — answers from the student's own material

> **Status:** draft, written **before** implementation (spec-first).
> Replaces the earlier "topic quiz" draft: material is no longer organized
> into topics and is used to answer questions, not to drive a topic quiz.
> This file says *what* the feature does and *why*. *How* it is built
> belongs in `material-library.plan.md`.

## Purpose

A student adds their own study material (photos of notebook pages, textbook
pages, text notes) to a personal library. When they ask a question in the
normal chat, the agent first looks at what their material says, answers from
it, and supplements it with research from trusted sources only where the
material is missing something. The answer shows which parts came from the
student's material and which from the web.

## Assumptions

- **A-1** One student, on their own machine. No login separation between users, no hosting.
- **A-2** Material and answers are in Hungarian.
- **A-3** Processed material survives a restart.
- **A-4** Two interfaces, one core. The same library and answering logic serves the CLI and the Next.js app. The CLI comes first: it is how the feature is tested before the web interface exists. The web interface gets its own acceptance criteria when its turn comes.

## Constraints (from requirements)

- **C-1** The retrieval pipeline (splitting, embeddings, vector store, retrieval) uses LangChain where it fits. Agent and orchestration logic stays in the project's own code, as in the existing hub and spokes.
- **C-2** Material is retrieved from a vector store (RAG), not by sending every file to the model on every question.

## Concepts

- **Library:** all material the student has added. One library, no topics.
- **Inbox (CLI only):** the folder `inbox/` where the student drops files before adding them. In the web interface, uploading replaces the inbox.

## Scope

**In scope (v1, CLI)**
- Adding material, listing the library
- Answering questions from the material first, supplemented by web research

**Non-goals (v1)**
- Topics or folders inside the library
- PDF files
- Multiple students, login separation
- Hosting on a server (where local files are not persistent)
- Deleting or renaming material from within the app
- Steering the source per question ("only from my notes", "ignore my notes")
- Size limits for the library
- Checking material against web sources when the material fully answers the question (there is no web research then; a     "suspicion check" was rejected because misread handwriting would raise false alarms)

## Acceptance criteria — CLI

### Adding material
- **AC-1** `/add` moves the files from `inbox/` into the library.
- **AC-2** Supported types: `.txt`, `.md`, `.jpg`, `.jpeg`, `.png` (extension, case-insensitive). Hidden files and `.gitkeep` are ignored.
- **AC-3** Unsupported files are not added. They stay in `inbox/`, and the user is told which ones.
- **AC-4** If the library already has a file with the same name, the new file is not added, stays in `inbox/`, and the user is told. Existing material is never overwritten.
- **AC-5** The user is told how many files were added. An empty inbox gives a message saying where to put files.
- **AC-6** Added material is processed during `/add`, with progress shown ("Processing 2 of 5…"). A file that cannot be processed is reported by name; the others are still added.
- **AC-7** The app never modifies or deletes material once it is in the library.

### Listing
- **AC-8** `/library` lists the files in the library. If it is empty, it explains `/add`.

### Keeping the index up to date
- **AC-9** Material that has not changed is never processed again — not after a restart, not on later questions. No extraction or embedding calls are made for it.
- **AC-10** Material changed or removed by hand outside the app is detected at startup; changed files are reprocessed, removed files no longer appear in answers.
- **AC-11** Text in images is extracted. Parts that cannot be read are marked as unreadable, not guessed.

### Answering questions
- **AC-12** For every question that reaches the research pipeline, the library is searched first.
- **AC-13** If the material covers the question, the answer is based on it. Web research is used only for what the material does not cover.
- **AC-14** Each part of the answer shows where it came from: 📒 with the file name for the student's material, 🌐 with the source for web research. The sources section lists both.
- **AC-15** Nothing is attributed to the student's material unless it is actually in the retrieved material.
- **AC-16** If a trusted source contradicts the student's material, the answer shows both statements with their sources.    When the web research has high confidence, the answer also says which one is probably correct and why; otherwise it says it is unclear and asks the student to check their notes. Neither statement is dropped silently.
- **AC-17** If the library has nothing relevant to the question, or is empty, the answer works exactly as today (web research only).
- **AC-18** If web research fails, the agent answers from the material alone and says that no supplementation happened.
- **AC-19** `/quiz` after an answer generates questions from that answer's findings, including the parts that came from the material.

## Web interface (to be specified later)

Same operations through the Next.js app, using the same core as the CLI:
uploading material (instead of the inbox), listing the library, and
material-first answers in the chat. Its acceptance criteria are written
before web work starts.

## Open questions

None at the moment. (Former Q-1 and Q-2 were decided as non-goals for v1.)

## How this spec will be verified

- AC-1 – AC-10, AC-12, AC-17 – AC-18 are deterministic and get automated tests.
- AC-11, AC-13 – AC-16 and AC-19 depend on model behavior and get evals: a small Hungarian sample library with known content, questions it fully covers, partly covers and does not cover, one deliberate error in the "notes", and a blurry photo.
