# Proposal

## Why

Students prepare from their own notes and textbook pages, but the agent only answered from web research. Answers should start from the student's own material, use the web only for what the material does not cover, and show which part came from where, so the student can trust and check them.

## What Changes

- A personal material library: the student adds photos of notebook or textbook pages and text notes (CLI: `inbox/` + `/add`; web: upload page). `/library` lists it.
- Material is read (photos via vision, never guessing illegible parts), split, embedded and kept in a local vector index that is updated incrementally: unchanged files are never processed again.
- Questions are answered material-first: the library is searched before web research; full coverage skips the web, partial coverage searches the web only for the gaps, no coverage works as before.
- Answers label their sources (📒 material with file name, 🌐 web) and show contradictions between the material and trusted sources instead of silently choosing one.

## Capabilities

### New Capabilities
- `material-library`: adding, listing and indexing the student's own study material, kept up to date incrementally.
- `material-answers`: answering questions from the student's material first, supplementing with web research, labelling sources and showing contradictions.

### Modified Capabilities

## Impact

- Agent: new `src/library/` (files, manifest, extract, vectorStore, sync, commands), new `src/spokes/librarySpoke.ts`, changes in `src/hub/index.ts`, `src/hub/execute.ts`, `src/hub/format.ts`, `src/types.ts`, `src/agent.ts`.
- Web: library page and API route, chat route passes the library search to the hub.
- Dependencies: `@langchain/core`, `@langchain/community` (Voyage embeddings), `@langchain/textsplitters`, `@lancedb/lancedb`, `apache-arrow`; Voyage AI API key.
- Local data: `inbox/`, `library/`, `data/` (manifest and LanceDB), all git-ignored.
