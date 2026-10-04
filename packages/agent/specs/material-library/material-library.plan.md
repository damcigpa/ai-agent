# Plan: Material library — answers from the student's own material

Implements `material-library.md` in this folder. The spec says *what*; this
file says *how*. Every decision names the acceptance criteria (AC) it serves.
TD-1 – TD-5 come from the replaced topic-quiz plan; they were validated by
`spikes/voyageLance.ts` and still apply.

## Technology decisions

### TD-1 Embeddings: Voyage AI through LangChain
- `VoyageEmbeddings` from `@langchain/community/embeddings/voyage`, model `voyage-4` (1024 dimensions). The spike found Hungarian sentences by meaning with no shared content words.
- **Set `modelName` explicitly** — the class defaults to a legacy model.
- Two instances: `inputType: "document"` for material, `inputType: "query"` for questions.
- Key: `VOYAGEAI_API_KEY` in `.env`.

### TD-2 Vector store: LanceDB, native API (AC-9, AC-10, A-3)
- `@lancedb/lancedb` used directly. The LangChain wrapper has no filter and no delete, so it cannot remove a file's chunks (AC-10).
- Database folder: `data/lancedb/`, table `chunks`: `vector`, `text`, `file`, `fileHash`, `chunkIndex`, `sourceKind` (`text` | `image`).
- Delete a file's chunks: `table.delete("file = '…'")`, with `'` escaped as `''`.
- Isolated in `vectorStore.ts`; nothing else sees LanceDB.

### TD-3 Splitting
- `RecursiveCharacterTextSplitter` from `@langchain/textsplitters`.
- Start with ~800 characters and ~100 overlap; tune with the evals (T10).

### TD-4 Manifest for incremental processing (AC-9, AC-10)
- File: `data/manifest.json`. Per library file: `sha256`, `extractedText`, `unreadableParts`, `chunkCount`, `processedAt`.
- Sync algorithm, used by `/add` and at startup:
  1. hash every supported file in `library/`,
  2. unchanged hash → nothing happens,
  3. new or changed → extract (TD-5), split, embed, write chunks; on change delete the old chunks first,
  4. in the manifest but gone from `library/` → delete its chunks and manifest entry.
- File-level hashing, not LangChain's indexing API: the expensive step is reading photos, which happens before splitting, so chunk-level deduplication cannot skip it.

### TD-5 Text extraction from photos (AC-11)
- Claude Haiku vision with forced tool output `{ text, unreadableParts[] }`.
- Prompt rule: transcribe, never guess; illegible passages are marked `[olvashatatlan]` and listed in `unreadableParts`.
- Text files skip the model.

### TD-6 Folders (AC-1 – AC-8)
All under `packages/agent`, all git-ignored except a `.gitkeep`:
- `inbox/` — where the student drops files,
- `library/` — added material, never modified by the app (AC-7),
- `data/` — `manifest.json` and `lancedb/`.

Paths are resolved **at call time** and can be passed in, so tests use temp folders without mocking `process.cwd()` (lesson from `readMaterial.ts`).

### TD-7 Answering: a material step before the existing pipeline (AC-12 – AC-18)
The hub runs a fixed **material step before the planned steps** of every question. It is code, not a planner decision, so it cannot be skipped (AC-12).

1. **Retrieve:** embed the question (query embedding) and take the 5 nearest chunks. An empty library or no chunks → skip to the existing flow unchanged (AC-17).
2. **Judge coverage:** a forced-tool Haiku call gets the question and the chunks and returns:
   - `coverage`: `full` | `partial` | `none`,
   - `materialFacts`: `{ fact, file }[]` — only facts present in the chunks (AC-15),
   - `missing`: what the question asks that the material does not answer.
3. **Route:**
   - `none` → existing flow, as if the library were empty (AC-17),
   - `full` → no web search; the explain step works from the material facts (AC-13),
   - `partial` → the existing search step runs with `buildSearchContext({ alreadyFound, missing })`, which already supports this shape (AC-13).
4. **Contradictions:** when both material facts and web findings exist (partial coverage), a separate compare call lists the disagreements: material statement, web statement, `likelyCorrect` (`material` | `web` | `unclear`) and a reason. `material` or `web` is only allowed when the web findings have `high` confidence; this is enforced in code, not only in the prompt. The output shows them in their own section (AC-16). With full coverage there is no web research and no check.
5. **Web failure:** if the search step returns empty findings, the answer is built from the material alone with a notice (AC-18).

### TD-8 Findings and output format (AC-14, AC-19)
- `ResearchFindings` gets optional fields: `materialFacts?: { fact: string; file: string }[]`, `contradictions?: { material: string; file: string; web: string; likelyCorrect: "material" | "web" | "unclear"; reason: string }[]`, `webSupplementFailed?: boolean`. Optional, so all existing code keeps working.
- `format.ts`: material facts are shown with 📒 and the file name, web sources with 🌐; the sources section lists both; contradictions get their own section.
- `/quiz` reads the last findings; material facts are added to `keyFacts`, so questions cover them (AC-19).

### TD-9 CLI
- `/add` and `/library` in `agent.ts`, next to `/import`, before input sanitization.
- Startup sync (AC-10) in `index.ts`, before the first prompt, with progress output.

## Code layout

| File | Responsibility | ACs |
|---|---|---|
| `src/library/files.ts` | inbox → library move, listing, file-type rules | AC-1 – AC-5, AC-7, AC-8 |
| `src/library/manifest.ts` | read/write `data/manifest.json` | AC-9, AC-10 |
| `src/library/extract.ts` | photo/text → text | AC-11 |
| `src/library/vectorStore.ts` | LanceDB + Voyage: add, delete by file, search | AC-9, AC-10 |
| `src/library/sync.ts` | TD-4 algorithm | AC-6, AC-9, AC-10 |
| `src/spokes/librarySpoke.ts` | TD-7 steps 1–2 | AC-12, AC-15 |
| `src/hub/index.ts`, `execute.ts` | material step + routing | AC-12, AC-13, AC-17, AC-18 |
| `src/hub/format.ts`, `src/types.ts` | TD-8 | AC-14, AC-16, AC-19 |
| `src/agent.ts`, `src/index.ts` | TD-9 | AC-1, AC-8, AC-10 |

## Verification

| Layer | What | ACs |
|---|---|---|
| Unit, real files in temp dirs | `files.ts`, `manifest.ts` | AC-1 – AC-5, AC-7, AC-8 |
| Integration: real LanceDB in a temp dir, fake embeddings, mocked extraction | `sync.ts`, `vectorStore.ts` — second sync makes zero calls; a removed file disappears from search; a changed file is reprocessed | AC-6, AC-9, AC-10 |
| Unit with mocks | hub routing for `none` / `full` / `partial`, web failure | AC-12, AC-13 (routing), AC-17, AC-18 |
| Evals (real API, manual) | small Hungarian sample library; questions fully / partly / not covered; one deliberate error; a blurry photo | AC-11, AC-13 – AC-16, AC-19 |

## Tasks

- [x] T1 Dependencies: `npm install @langchain/core@^1 @langchain/community @lancedb/lancedb apache-arrow@18.1.0 --legacy-peer-deps` (done for the spike; see the commit history for why each flag is needed)
- [x] T2 Spike `spikes/voyageLance.ts`: passed
- [ ] T3 Add `@langchain/textsplitters` (same `--legacy-peer-deps` flag)
- [ ] T4 `files.ts` + tests
- [ ] T5 `manifest.ts` + tests
- [ ] T6 `extract.ts` (+ eval on one clear and one blurry photo)
- [ ] T7 `vectorStore.ts` + `sync.ts` + integration tests
- [ ] T8 `/add`, `/library`, startup sync
- [ ] T9 `librarySpoke.ts` + hub integration + output format
- [ ] T10 Evals