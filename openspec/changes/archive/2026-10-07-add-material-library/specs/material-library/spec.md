# Spec Delta

## Purpose
Lets a student keep their own study material (photos of notebook and textbook pages, text notes) in one local library that stays searchable by meaning, so that answers can be based on it.

## ADDED Requirements

### Requirement: Adding material
The `/add` command SHALL move the supported files from `inbox/` into the library and process them. Supported types are `.txt`, `.md`, `.jpg`, `.jpeg` and `.png`, by extension, case-insensitive. Hidden files and `.gitkeep` SHALL be ignored. The user SHALL be told how many files were added.

#### Scenario: Supported files are added
- **WHEN** the inbox contains `notes.txt` and `page1.JPG` and the user runs `/add`
- **THEN** both files are moved into the library
- **AND** the user is told that 2 files were added

#### Scenario: Unsupported file stays in the inbox
- **WHEN** the inbox contains `chapter.pdf` and the user runs `/add`
- **THEN** the file is not added and stays in `inbox/`
- **AND** the user is told which file was not added

#### Scenario: Empty inbox
- **WHEN** the inbox is empty and the user runs `/add`
- **THEN** the user is told where to put files

### Requirement: Material is never overwritten or modified
The app SHALL NOT overwrite, modify or delete material once it is in the library.

#### Scenario: A file with the same name already exists
- **WHEN** the library contains `notes.txt` and the inbox contains another `notes.txt` and the user runs `/add`
- **THEN** the new file is not added and stays in `inbox/`
- **AND** the user is told
- **AND** the library copy is unchanged

### Requirement: Processing with progress, per-file failures
Added material SHALL be processed during `/add` with visible progress. A file that cannot be processed SHALL be reported by name, and the other files SHALL still be added.

#### Scenario: Progress is shown
- **WHEN** five files are added
- **THEN** progress is shown per file, for example "Processing 2 of 5: page2.jpg"

#### Scenario: One file cannot be processed
- **WHEN** one of the added photos cannot be read
- **THEN** that file is reported by name
- **AND** the other files are added and become searchable

### Requirement: Listing the library
The `/library` command SHALL list the files in the library and show whether each one is searchable yet. An empty library SHALL produce a message that explains `/add`.

#### Scenario: Library with files
- **WHEN** the library contains two indexed files and one that could not be processed
- **THEN** all three are listed, the first two marked as searchable and the third as not indexed yet

#### Scenario: Empty library
- **WHEN** the library is empty and the user runs `/library`
- **THEN** the message explains how to add material with `/add`

### Requirement: Unchanged material is not processed again
Material that has not changed SHALL NOT be processed again, neither on later commands nor after a restart. No text extraction or embedding calls SHALL be made for it.

#### Scenario: Second add without changes
- **WHEN** a file was indexed and the user runs `/add` again, or restarts the app, without changing it
- **THEN** no text extraction and no embedding call is made for that file

### Requirement: Changes made outside the app are detected
Material changed or removed by hand outside the app SHALL be detected at startup. Changed files SHALL be processed again; removed files SHALL no longer appear in answers.

#### Scenario: File replaced by hand
- **WHEN** a library file is replaced by a different version outside the app and the app starts
- **THEN** the file is processed again and its old text is no longer searchable

#### Scenario: File removed by hand
- **WHEN** a library file is deleted outside the app and the app starts
- **THEN** its content no longer appears in answers

### Requirement: Text in photos is extracted without guessing
Text in images SHALL be extracted. Parts that cannot be read SHALL be marked as unreadable and SHALL NOT be guessed.

#### Scenario: Partly illegible photo
- **WHEN** a photo contains a word that cannot be read
- **THEN** the extracted text contains `[olvashatatlan]` in its place
- **AND** the passage is listed as unreadable
