# Tasks

## 1. Foundations

- [x] 1.1 Spike: Voyage embeddings and LanceDB on Hungarian text (`spikes/voyageLance.ts`)
- [x] 1.2 Dependencies: LangChain core, community and textsplitters, LanceDB, apache-arrow

## 2. Library

- [x] 2.1 `files.ts` with tests: inbox to library, listing, file-type rules
- [x] 2.2 `manifest.ts` with tests: content-hash cache, sync plan
- [x] 2.3 `extract.ts` with tests: text files and photos
- [x] 2.4 `vectorStore.ts`: native LanceDB, Voyage embedder
- [x] 2.5 `vectorStore.ts` tests
- [x] 2.6 `sync.ts`: extract, split, embed, index, per-file failures
- [x] 2.7 `sync.ts` integration tests

## 3. CLI

- [x] 3.1 `/add` and `/library`
- [x] 3.2 Startup sync: detect changes made outside the app

## 4. Answers

- [x] 4.1 Coverage judge in `librarySpoke.ts`
- [x] 4.2 Hub material step: full / partial / none routing, targeted web search
- [x] 4.3 Output format: material section, labelled sources
- [x] 4.4 Contradiction check after the web search, verdict gated by web confidence
- [x] 4.5 Notice when the web research fails
- [x] 4.6 Hub routing tests in the repo

## 5. Web

- [x] 5.1 Upload page and API on the shared library
- [x] 5.2 The web chat passes the library search to the hub

## 6. Evals

- [x] 6.1 Add `evals/material.eval.ts`
- [x] 6.2 Run the eval and fix what fails


## 7. Migration to OpenSpec

- [x] 7.1 Rewrite the spec references in code headers and test names: replace "specs/material-library/material-library.md - AC-n" and "plan - TD-n" with the requirement names and design decisions of this change
- [x] 7.2 Remove the old `packages/agent/specs/` folder (material-library and import specs and plans); the history stays in git and in the archive
