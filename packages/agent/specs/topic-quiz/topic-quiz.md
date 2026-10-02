# Spec: Topic library and "quiz me on topic"

> **Status:** draft, written **before** implementation (spec-first).
> This file says *what* the feature does and *why*. *How* it is built
> (LangChain components, vector store, embedding model) belongs in `topic-quiz.plan.md`.

## Purpose

A student keeps their own study material (photos of notebook pages, textbook
pages, text notes) organized by topic. When preparing for an exam, they ask
to be quizzed on a topic. The quiz is based on their own material, and the
system fills gaps in it with information from trusted sources. Every question
shows which of the two it came from.

## Assumptions (to confirm)

- **A-1** First version runs in the CLI of the new LangChain-based project, with local storage. No web UI.
- **A-2** "Supplementing" means both: questions primarily from the student's material, plus questions on important facts the material is missing, researched on the web, with every question labeled by source.
- **A-3** Material and quiz are in Hungarian (from Q-4, recommended default).
- **A-4** Processed material survives a CLI restart (from Q-6, recommended default).

## Constraints (from requirements)

- **C-1** The retrieval pipeline (splitting, embeddings, vector store, retrieval) uses LangChain. Agent and orchestration logic stays in the project's own code, as in the existing hub and spokes.
- **C-2** Material is retrieved from a vector store (RAG), not by sending every file to the model on every request.

## Concepts

- **Topic:** a folder directly under `topics/`. The folder name is the topic name, e.g. `topics/Mohácsi csata/`.
- **Material:** the supported files inside a topic folder.
- **Topic library:** all topics together. It is persistent: the system never deletes the student's files (unlike `/import`, which clears its folder).

## Scope

**In scope (v1)**
- Listing topics
- Processing new, changed and removed material automatically before a quiz
- `/quiz <topic>` with source-labeled questions and web-based supplementation

**Non-goals (v1)**
- PDF files
- Subfolders inside a topic
- Answering free-form questions about the material (`/ask <topic> <question>`) — candidate for v2
- Web upload, multiple users, sharing topics
- Editing or deleting material from within the app

## Acceptance criteria

### Topic library
- **AC-1** `/topics` lists every topic with the number of supported files in it. If there are no topics, it says how to create one (make a folder under `topics/`).
- **AC-2** Supported material types: `.txt`, `.md`, `.jpg`, `.jpeg`, `.png` (extension, case-insensitive). Hidden files and `.gitkeep` are ignored.
- **AC-3** Unsupported files are skipped, and the user is told **which** files were skipped. (Lesson from the `/import` spec, D-4.)
- **AC-4** The system never modifies, moves or deletes files in `topics/`.

### Processing material
- **AC-5** Before a topic quiz, new and changed files of that topic are processed. Unchanged files are **not** processed again, so a repeated quiz on an unchanged topic makes no extraction or embedding calls.
- **AC-6** Content of a file removed from the topic folder no longer appears in quizzes on that topic.
- **AC-7** Text in images is extracted. Parts that cannot be read are marked as unreadable, not guessed.
- **AC-8** Material of one topic never appears in a quiz on another topic.
- **AC-9** The user sees progress while material is processed (e.g. "Processing 3 new files…").

### Topic quiz
- **AC-10** `/quiz <topic>` starts a quiz on the named topic. The name is matched against the folder names case-insensitively, and may contain spaces and accented letters.
- **AC-11** An unknown topic name gives a message listing the available topics. No quiz starts.
- **AC-12** A topic without supported files gives a message, and no quiz starts.
- **AC-13** The question count and the answering flow are the same as the existing `/quiz`: 1–10 questions, default 5, answers A–D, feedback and explanation after each answer, score at the end.
- **AC-14** Questions cover the topic broadly: in a topic with several files, the questions do not all come from the same file or passage.
- **AC-15** Every question is labeled with its source:
  - 📒 from the student's material, with the file name,
  - 🌐 supplemented, with the web source.
- **AC-16** Most questions come from the student's material. Supplemented questions cover important facts that the material does not contain.
- **AC-17** If a trusted source contradicts the student's material, the contradicted statement is **not** used as a correct answer. After the related question the student is shown the discrepancy, so they can check their notes.
- **AC-18** If web research fails, the quiz still runs from the material alone, and the user is told that no supplementation happened.
- **AC-19** `/quiz` without a topic name keeps its current behavior (quiz on the last research findings).

## Open questions

- **Q-1** Confirm A-1 and A-2.
- **Q-2** What does "most questions" mean in AC-16: a fixed share (e.g. at least 60% from the material), or should the student be able to choose?
- **Q-3** Should there be a size limit per topic (number of files, total size)? Very large topics affect processing time and cost.
- **Q-4** ~~Language~~ → assumed Hungarian, see A-3. Confirm.
- **Q-5** ~~External embedding provider?~~ **Decided: yes.** The material already goes to an external model for image reading and quiz generation, so local embeddings would add little privacy.
- **Q-6** ~~Persistence~~ → assumed yes, see A-4. Confirm.

## How this spec will be verified

- AC-1 – AC-13 and AC-18 – AC-19 are deterministic and get automated tests.
- AC-14 – AC-17 depend on model behavior and get evals: fixed sample topics with known content, known gaps and one deliberate error in the "notes".