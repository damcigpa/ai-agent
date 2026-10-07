# answer-quality Specification

## Purpose
How the explanation text of an answer is written and shown, so that a student can trust and read it.

## Requirements

### Requirement: The answer is in the language of the question
The explanation SHALL be written in the language of the student's question.

#### Scenario: Hungarian question
- **WHEN** the student asks a question in Hungarian
- **THEN** the explanation is in Hungarian, without English words except names and terms that are written that way in the findings

#### Scenario: English question
- **WHEN** the student asks a question in English
- **THEN** the explanation is in English

### Requirement: The explanation starts with the content
The explanation SHALL start directly with the answer. It SHALL NOT start with a title, a label or a heading line.

#### Scenario: Any question
- **WHEN** an explanation is generated
- **THEN** its first line is a sentence of the answer, not a heading such as "Plain Text Answer"

### Requirement: Names are used exactly as given
Names and terms in the explanation SHALL be written as they are in the findings. The explanation SHALL NOT add numbering, titles or "corrections" to them.

#### Scenario: The wives of Henry VIII
- **WHEN** the findings list Catherine of Aragon and Anne Boleyn as wives of Henry VIII
- **THEN** the explanation does not call them "I. Katerina" or "II. Anna Boleyn"

### Requirement: Only the given facts are used
Every statement in the explanation, including its significance part, SHALL be supported by the findings it was given.

#### Scenario: A fact that is not in the findings
- **WHEN** the findings do not say whether Anne Boleyn had a son
- **THEN** the explanation does not say it

#### Scenario: The findings do not support a significance
- **WHEN** the findings give no basis for why the topic matters
- **THEN** the significance part is empty and is not printed

### Requirement: The explanation text is shown once in the CLI
In the CLI, the explanation text SHALL appear once per answer. The web chat SHALL show the complete formatted answer.

#### Scenario: CLI answer
- **WHEN** the CLI streams the explanation text and then prints the final answer
- **THEN** the explanation text is not repeated in the final answer
- **AND** key points, significance and sources are still printed

#### Scenario: Web answer
- **WHEN** the web chat receives the answer
- **THEN** the formatted answer contains the explanation text
