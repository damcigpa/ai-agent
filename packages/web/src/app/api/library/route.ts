import { NextRequest, NextResponse } from "next/server";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { getLibraryStatus, handleAdd } from "@exam-prep/agent/src/library/commands";
import {
  LibraryBusyError,
  getStore,
  isValidUploadName,
  libraryOptions,
  withLibraryLock,
} from "../../../lib/library";

export const runtime = "nodejs";

// Lists the library files and whether each one is searchable yet.
export async function GET() {
  return NextResponse.json({ files: getLibraryStatus(libraryOptions()) });
}

// Uploads files into the library and indexes them: the web version of /add.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files were sent." }, { status: 400 });
  }

  // Names go onto the disk, so anything that is not a plain, supported file name is refused.
  const accepted = files.filter((f) => isValidUploadName(f.name));
  const rejected = files.filter((f) => !isValidUploadName(f.name)).map((f) => f.name);

  if (accepted.length === 0) {
    return NextResponse.json(
      { error: "None of the files can be used (supported: .txt, .md, .jpg, .jpeg, .png).", rejected },
      { status: 400 },
    );
  }

  try {
    const message = await withLibraryLock(async () => {
      const options = libraryOptions();
      mkdirSync(options.paths.inboxDir, { recursive: true });

      for (const file of accepted) {
        writeFileSync(join(options.paths.inboxDir, file.name), Buffer.from(await file.arrayBuffer()));
      }

      const result = await handleAdd({ ...options, getStore });

      // A file that is still in the inbox was not taken into the library (a duplicate name).
      // The web user cannot see the inbox, so it must not be left lying there.
      for (const file of accepted) {
        rmSync(join(options.paths.inboxDir, file.name), { force: true });
      }

      return result;
    });

    return NextResponse.json({ message, rejected });
  } catch (e) {
    if (e instanceof LibraryBusyError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    console.error("[library upload]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed." },
      { status: 500 },
    );
  }
}