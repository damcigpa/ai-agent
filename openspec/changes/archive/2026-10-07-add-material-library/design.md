# Design

## Context

The agent is a hub-and-spoke research tool: the hub plans steps, spokes search the web (`searchSpoke`) and write the explanation (`explainSpoke`). One student uses it on their own machine, in Hungarian. The CLI came first; the Next.js app uses the same core (it imports the built agent from `dist`). Material is retrieved from a vector index (RAG), not sent to the model in full on every question.

## Goals / Non-Goals

**Goals:**
- Material is read, split, embedded and indexed once; later runs only process what changed.
- Answers start from the material; the web fills only the gaps; every fact shows its source.
- Contradictions between material and trusted sources are visible to the student.
- The CLI and the web app share one library and one answering logic.

**Non-Goals:**
- Topics or folders inside the library; PDF files; size limits.
- Several students or login separation; hosting where local files are not persistent.
- Deleting or renaming material from within the app.
- Steering the source per question ("only from my notes").
- Checking material against web sources when the material fully answers the question. There is no web research then, and a "suspicion check" was rejected: misread handwriting would raise false alarms.
- Material in literary-analysis plans (they have no web search step to replace) — v1.

## Decisions

**D1. Embeddings: Voyage `voyage-4` through LangChain.** `VoyageEmbeddings` with `modelName` set explicitly (the class defaults to a legacy model), one instance with `inputType: "document"` for material and one with `"query"` for questions. The spike (`spikes/voyageLance.ts`) found Hungarian sentences by meaning with no shared content words.

**D2. Vector store: native LanceDB, isolated in `vectorStore.ts`.** The spike showed that the LangChain LanceDB wrapper has no filter and no delete (and reads the wrong distance field), so a changed or removed file's chunks could not be removed. LangChain is used for splitting and embeddings only. The store embeds before it deletes, so a failed embedding leaves the old chunks in place.

**D3. Splitting:** `RecursiveCharacterTextSplitter`, 800 characters with 100 overlap. To be tuned with the evals.

**D4. Incremental processing with a content-hash manifest** (`data/manifest.json`): unchanged hash → nothing happens; new or changed → extract, split, embed, replace the file's chunks; gone from `library/` → delete its chunks. File-level hashing, because the expensive step (reading photos) happens before splitting. The manifest does not record the chunk settings: changing them does not reprocess existing files.

**D5. Text from photos:** Claude Haiku vision with a forced tool output `{ text, unreadableParts[] }`; the prompt says transcribe, never guess, and mark illegible passages `[olvashatatlan]`. Text files skip the model.

**D6. Material step in the hub, before the planned research.** Fixed code, not a planner decision, so it cannot be skipped. The hub receives a `searchLibrary` function from the caller (CLI or web), so it does not depend on LanceDB or Voyage. Steps: retrieve the 5 nearest chunks → a forced-tool Haiku call judges coverage (`full` / `partial` / `none`), extracts the facts the material states with their file names, and lists what is missing → route: `none` = unchanged flow; `full` = search steps removed, the explain step works from the material; `partial` = the search step gets only the missing parts. The material facts are NOT passed to the web search as "already found", so they cannot come back labelled as web sources. Distance thresholds are not used: relevant chunks scored around 1.38–1.55, too close to unrelated ones.

**D7. Attribution guard.** A fact is kept only if it names a retrieved file. The file name is matched tolerantly (the model sometimes returns "x.jpg, part 3"); longest names first.

**D8. Contradiction check: a separate compare call after the web search** (partial coverage only). Input: the material facts and the web findings alone (before merging). Output per contradiction: material statement, file, web statement, `likelyCorrect` (`material` | `web` | `unclear`), reason. `material` or `web` is allowed only when the web findings have `high` confidence; this is enforced in code, not only in the prompt.

**D9. Output format.** `ResearchFindings` gets optional `materialFacts` and `contradictions`. `format.ts` adds a "📒 From your material" section and a "⚠️ Your material and the sources disagree" section; with material, sources are labelled 📒 / 🌐. Without material the output is byte-for-byte the same as before. Material facts are also put into `keyFacts`, so `/quiz` covers them.

**D10. Web app.** The library location comes from `LIBRARY_ROOT` (default `../agent`), so the CLI and the web app share `inbox/`, `library/` and `data/`. The upload route writes into the inbox and runs the same `/add` logic, one operation at a time. The chat route passes a `searchLibrary` built on the same store.

**D11. Folders.** All under `packages/agent`, git-ignored except a `.gitkeep`: `inbox/` (where the student drops files), `library/` (added material, never modified by the app) and `data/` (`manifest.json` and `lancedb/`). Paths are resolved at call time and can be passed in, so tests use temp folders without mocking `process.cwd()`.

**D12. CLI wiring.** `/add` and `/library` sit next to `/import` in the command handling, before input sanitization. A startup sync (detecting changes made outside the app) runs before the first prompt, with progress output; it is not built yet (task 3.2).

## Risks / Trade-offs

- The coverage judge can be too strict or too lenient; the eval (`evals/material.eval.ts`) measures it with known questions.
- Voyage's free tier allows few requests per minute; bursts can hit rate limits.
- A full-coverage answer repeats an error in the notes unchecked (accepted, see Non-Goals).
- The CLI and the web app must not add material at the same time (one manifest).
- The agent emits `done` twice for explained answers, so the web chat saves two history items per such question.
