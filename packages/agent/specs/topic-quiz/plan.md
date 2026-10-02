# Plan: Topic library and "quiz me on topic"

Implements `spec.md` in this folder. The spec says *what*; this file says *how*.
Every decision below names the acceptance criteria (AC) it serves.

## Technology decisions

### TD-1 Embeddings: Voyage AI through LangChain
- Class: `VoyageEmbeddings` from `@langchain/community/embeddings/voyage`.
- Model: `voyage-4` — general-purpose and multilingual, inside the free token allowance. Hungarian retrieval quality is checked by the evals; fall back to `voyage-multilingual-2` if it is weak.
- **Set `modelName` explicitly.** The class defaults to a legacy model (`voyage-01`).
- Two instances: `inputType: "document"` for indexing material, `inputType: "query"` for searching. Voyage optimizes the embedding differently for the two.
- Key: `VOYAGEAI_API_KEY` in `.env`.
- Risk: there are signs that `@langchain/community` is being split up and Voyage may move to another package. Check at install time; only the import path would change.

### TD-2 Vector store: LanceDB, embedded and file-based (AC-5, AC-6, AC-8, A-4)
- `@lancedb/lancedb` with the LangChain wrapper from `@langchain/community/vectorstores/lancedb`.
- No server; the database is a folder: `data/lancedb/`. This satisfies A-4 (survives restart).
- One table, `chunks`, one row per chunk with metadata: `topic`, `file`, `fileHash`, `chunkIndex`, `sourceKind` (`text` | `image`).
- Every search filters on `topic` (AC-8).
- Deleting a file's chunks: by `topic` + `file`. If the LangChain wrapper's `delete` cannot express this, use the native table's `delete(predicate)` — this is the one place we drop below the abstraction, and it is isolated in `vectorStore.ts`.

### TD-3 Splitting
- `RecursiveCharacterTextSplitter` from `@langchain/textsplitters`.
- Start with ~800 characters, ~100 overlap. Tune with the evals; handwritten notes are short and dense, so chunks may need to be smaller than typical document defaults.

### TD-4 Incremental processing: our own manifest, not LangChain's indexing API (AC-5, AC-6)
- File: `data/manifest.json`. Per topic, per file: `sha256`, `extractedText`, `summary`, `unreadableParts`, `chunkIds`, `processedAt`.
- Sync of a topic:
  1. hash every supported file in the folder,
  2. **unchanged** hash → nothing happens (no extraction, no embedding — AC-5),
  3. **new or changed** → extract (TD-5), split, embed, write chunks; on change delete the old chunks first,
  4. file in manifest but **gone** from the folder → delete its chunks and its manifest entry (AC-6).
- Why not LangChain's `index()` + record manager: it deduplicates *chunks*, after splitting. The expensive step here is reading photos with the vision model, which happens *before* splitting — the indexing API cannot skip that. A file-level hash can. (Its JS maturity was also not verified.)

### TD-5 Text extraction from photos (AC-7)
- Claude Haiku vision, forced tool output: `{ text, summary, unreadableParts[] }`.
- Prompt rule: transcribe, never guess; illegible passages go to `unreadableParts` and are marked in the text as `[olvashatatlan]`.
- The `summary` (2–3 sentences per file) is produced in the same call; the quiz outline uses it (TD-6, step 2).
- Text files skip the model and are summarized with a cheap text-only call.

### TD-6 Quiz pipeline — our own code, in hub style (AC-13 – AC-18)
1. **Sync** the topic (TD-4). Report progress (AC-9).
2. **Outline:** from the per-file summaries, the model lists 3–6 subtopics. Using summaries, not raw chunks, keeps this step small regardless of topic size.
3. **Retrieve per subtopic:** `similaritySearch(subtopic, k=4, filter: topic)`. Questions are then spread across subtopics instead of all coming from one passage (AC-14).
4. **Gap and contradiction check:** run the existing `searchSpoke` on the topic. The model compares its key facts with the retrieved material and returns `missing[]` and `contradictions[]` (AC-16, AC-17). If this step fails, continue with material only and set a flag for the user message (AC-18).
5. **Generate questions:** extended quiz schema (TD-7). Most questions from material, supplemented ones from `missing[]`; contradicted statements are never used as correct answers (AC-17).
6. **Run the quiz** with the existing quiz session flow (AC-13).

### TD-7 Quiz question schema extension (AC-15, AC-17, AC-19)
Optional fields on `QuizQuestion`, so the existing `/quiz` keeps working unchanged (AC-19):

```ts
source?: { type: "material"; file: string } | { type: "web"; url: string };
discrepancy?: string; // shown after the answer
```

## Code layout

| File | Responsibility | ACs |
|---|---|---|
| `src/topics/library.ts` | list topics, list/skip files, match topic names | AC-1–4, AC-10–12 |
| `src/topics/manifest.ts` | read/write `data/manifest.json` | AC-5, AC-6 |
| `src/topics/extract.ts` | vision/text extraction + summary | AC-7 |
| `src/topics/vectorStore.ts` | LanceDB + Voyage setup, add/delete/search by topic | AC-6, AC-8 |
| `src/topics/sync.ts` | the TD-4 algorithm | AC-5, AC-6, AC-9 |
| `src/spokes/topicQuizSpoke.ts` | TD-6 steps 2–5 | AC-14–18 |
| `src/agent.ts` | `/topics`, `/quiz <topic>` routing | AC-1, AC-10–13, AC-19 |

`.gitignore`: `topics/*` (keep `topics/.gitkeep`) and `data/`.

## Verification

| Layer | What | ACs |
|---|---|---|
| Unit, real file system in a temp dir (same pattern as `readMaterial.test.ts`) | `library.ts`, `manifest.ts` | AC-1–4, AC-10–12 |
| Integration: real LanceDB in a temp dir, **fake embeddings**, mocked extraction | `sync.ts`, `vectorStore.ts` — e.g. second sync makes zero extraction/embedding calls; removed file disappears from search; topic A never returned for topic B | AC-5, AC-6, AC-8 |
| Unit with mocks | `agent.ts` routing, AC-18 fallback | AC-13, AC-18, AC-19 |
| Evals (real API, manual) | fixture topics in Hungarian with known content, a known gap and **one deliberate error** in the notes; a blurry photo | AC-7, AC-14–17 |

## Tasks

- [ ] T1 Dependencies: `langchain`, `@langchain/core`, `@langchain/community`, `@langchain/textsplitters`, `@lancedb/lancedb`; `VOYAGEAI_API_KEY` in `.env`
- [ ] T2 Spike: embed 3 Hungarian sentences with `voyage-4`, store in LanceDB, search — confirms TD-1/TD-2 before building on them
- [ ] T3 `library.ts` + tests
- [ ] T4 `manifest.ts` + tests
- [ ] T5 `extract.ts` (+ eval on one clear and one blurry photo)
- [ ] T6 `vectorStore.ts` + `sync.ts` + integration tests
- [ ] T7 `/topics` command
- [ ] T8 Quiz schema extension (TD-7), existing `/quiz` tests still pass
- [ ] T9 `topicQuizSpoke.ts`
- [ ] T10 `/quiz <topic>` routing + tests
- [ ] T11 Evals for AC-14–17

## Open points carried from the spec

- Q-2 (share of material vs. supplemented questions) affects the prompt in TD-6 step 5. Default until decided: at least 60% from material.
- Q-3 (topic size limit) affects TD-6 step 2. No limit in v1; revisit after T11 shows cost per topic.