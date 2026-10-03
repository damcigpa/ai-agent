# Library upload (web)

## Goal
A logged-in user can upload study material (notes, photos of pages) from the browser
and see what is in the library. It is the web counterpart of the CLI's `/add` and
`/library`, built on the same core (`files.ts`, `sync.ts`, `commands.ts`).

One shared library, one user: the CLI and the web app use the same material.

## Non-goals
- Per-user libraries (a conscious limit: the library is shared by everyone who can log in)
- Drag and drop, upload progress bar, deleting files from the UI
- Answers that use the library (separate spec)
- PDFs, hosting or serverless deployment (the library lives on the local file system)

## Acceptance criteria

### Page
- AC-1: A `/library` page, linked from the header. Logged out, it asks the user to log in
  (same as the history page).
- AC-2: The page lists the library files. Each shows ✓ (indexed) or ⚠️ (not indexed yet).
  An empty library shows a message saying how to add files.

### Uploading
- AC-3: A file picker accepts several files at once (`.txt .md .jpg .jpeg .png`). The upload
  button is disabled while nothing is selected.
- AC-4: The upload endpoint requires a login (401 otherwise) and is rate limited.
- AC-5: Uploaded files go through the same logic as `/add`. The user sees the same outcome:
  what was added, what is a duplicate, what is unsupported, what could not be processed.
- AC-6: Unsupported types are rejected before anything is stored.
- AC-7: An existing library file is never overwritten (duplicates are reported, as in `/add`).
- AC-8: While processing, the UI shows a busy state and blocks a second submit.
  The list refreshes when processing ends.
- AC-9: The server runs one library operation at a time. A second request during that time
  gets a clear "busy" answer (409).
- AC-10: File names are reduced to a safe base name. Names with path parts (`../x.txt`)
  or hidden names (`.env`) are rejected.
- AC-11: If indexing fails (for example the Voyage key is missing), the files stay in the
  library and the user is told they are indexed on the next upload.

### Shared library
- AC-12: The web app and the CLI use the same `inbox/`, `library/` and `data/` folders.
  The location comes from the `LIBRARY_ROOT` setting, and defaults to `packages/agent`.

## Open questions
- Q-1: Maximum file size. Phone photos are several MB, and the vision API has its own limit.
- Q-2: The web app needs `VOYAGEAI_API_KEY` (and the Anthropic key) in `.env.local`.
- Q-3: Does the LanceDB native module need `serverExternalPackages` in `next.config.ts`?
  (Found out during the first run.)