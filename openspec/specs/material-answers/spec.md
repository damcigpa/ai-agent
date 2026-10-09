# material-answers Specification

## Purpose
Answers the student's questions from their own material first, uses web research only for what the material does not cover, shows where each part of the answer came from, and points out contradictions.

## Requirements

### Requirement: The library is searched first
For every question whose answer plan includes web research, the system SHALL search the student's library before any web research.

#### Scenario: Research question
- **WHEN** the student asks a question that needs research
- **THEN** the library is searched before the web

### Requirement: Material-first answers
If the material covers the question, the answer SHALL be based on it. Web research SHALL be used only for what the material does not cover.

#### Scenario: The material covers the whole question
- **WHEN** the material answers the whole question
- **THEN** no web research is done
- **AND** the answer is built from the material

#### Scenario: The material covers part of the question
- **WHEN** the material answers only part of the question
- **THEN** web research is done only for the parts the material does not cover
- **AND** the answer combines both

### Requirement: Sources are labelled
Each part of the answer SHALL show where it came from: 📒 with the file name for the student's material, 🌐 for web research. The sources section SHALL list both.

#### Scenario: Answer from material and web
- **WHEN** the answer uses facts from `henry_viii.txt` and from a web source
- **THEN** the material facts are shown with 📒 and the file name
- **AND** the sources section lists `henry_viii.txt` with 📒 and the web source with 🌐

### Requirement: Nothing is wrongly attributed to the material
The system SHALL NOT attribute anything to the student's material that is not in the retrieved material.

#### Scenario: A fact names a file that was not retrieved
- **WHEN** the material check returns a fact that names a file which was not among the retrieved material
- **THEN** that fact is not shown as coming from the student's material

### Requirement: Contradictions are shown, never silently resolved
If a trusted source contradicts the student's material, the answer SHALL show both statements with their sources. When the web research has high confidence, the answer SHALL also say which statement is probably correct and why; otherwise it SHALL say that it is unclear and ask the student to check their notes. Neither statement SHALL be dropped silently.

#### Scenario: Contradiction with highly confident web research
- **WHEN** the notes say Elizabeth I became queen in 1565, the web research says 1558 and the web research has high confidence
- **THEN** the answer shows both statements
- **AND** says which one is probably correct and why

#### Scenario: Contradiction with less confident web research
- **WHEN** the notes and the web research disagree and the web research does not have high confidence
- **THEN** the answer shows both statements
- **AND** says it is unclear and asks the student to check their notes

#### Scenario: Full coverage is not checked against the web
- **WHEN** the material answers the whole question
- **THEN** no web research is done, so the material is not compared with web sources

### Requirement: No relevant material changes nothing
If the library is empty or has nothing relevant to the question, the answer SHALL work exactly as without a library.

#### Scenario: Empty library
- **WHEN** the library is empty
- **THEN** the answer is produced by web research only, unchanged

#### Scenario: Unrelated material
- **WHEN** the library only contains notes on other topics
- **THEN** the answer is produced by web research only and shows no material section

### Requirement: Web research failure
If web research fails, the agent SHALL answer from the material alone and SHALL say that no supplementation happened.

#### Scenario: Web search unavailable
- **WHEN** the material covers part of the question and the web research fails
- **THEN** the answer is built from the material
- **AND** says that it could not be supplemented from the web

### Requirement: Quiz covers the material
`/quiz` after an answer SHALL generate questions from that answer's findings, including the parts that came from the student's material.

#### Scenario: Quiz after a material-based answer
- **WHEN** the student runs `/quiz` after an answer that used their material
- **THEN** the quiz questions can cover the facts from the material

## Verification

How each requirement of this capability is checked:

| What | Where | Uses a real model |
|---|---|---|
| The judge's coverage verdict (full / partial / none), retrieval, cross-language questions | `evals/material.eval.ts` | yes |
| A contradiction between the material and the sources is found; no false alarm when they agree | `evals/material.eval.ts` | yes |
| The written explanation names both versions of a contested fact, and invents no disagreement where there is none | `evals/material.eval.ts` | yes |
| Follow-up questions are made self-contained before the material is searched | `evals/material.eval.ts` | yes |
| The contradiction block: both sides, the reliability of each, the verdict, and its place above the explanation | `src/hub/format.test.ts` | no |
| The uncertainty notice for low and medium research confidence | `src/hub/format.test.ts` | no |
| The hub's routing: partial coverage → web search → comparison → the block appears; full coverage → no web search | `src/hub/hub.material.test.ts` | no |

Not covered automatically: the real web search. The eval compares the material against a fixed
"trusted source" text so that every run gets the same input. That a live search actually returns
the contradicting fact is only shown by running the agent by hand:

1. Put a note with a known error into `library/` (for example "Elizabeth became queen in 1565").
2. Ask a question the note answers only in part ("When did Elizabeth I become queen and how long did she reign?"),
   so the gap triggers a web search and there is something to compare.
3. The answer must open with the `⚠️ CONTRADICTION` block, and the explanation must name both years.