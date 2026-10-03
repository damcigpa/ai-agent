"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface LibraryFile {
  name: string;
  indexed: boolean;
}

async function fetchLibraryFiles(): Promise<LibraryFile[] | null> {
  const res = await fetch("/api/library");
  if (!res.ok) return null;
  return (await res.json()).files;
}

export default function LibraryPage() {
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [selected, setSelected] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  // Changing the key gives a fresh, empty file picker after a successful upload.
  const [pickerKey, setPickerKey] = useState(0);

  const refresh = useCallback(async () => {
    const nextFiles = await fetchLibraryFiles();
    if (nextFiles) setFiles(nextFiles);
  }, []);

  useEffect(() => {
    let active = true;
    fetchLibraryFiles().then((nextFiles) => {
      if (active && nextFiles) setFiles(nextFiles);
    });
    return () => {
      active = false;
    };
  }, []);

  async function upload() {
    if (selected.length === 0 || busy) return;

    setBusy(true);
    setResult("");
    try {
      const form = new FormData();
      selected.forEach((file) => form.append("files", file));

      const res = await fetch("/api/library", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setResult(`⚠️ ${data.error ?? "Upload failed."}`);
      } else {
        const rejected = data.rejected?.length
          ? `\n⚠️ Not accepted (unsupported type or unsafe name): ${data.rejected.join(", ")}`
          : "";
        setResult(data.message + rejected);
        setSelected([]);
        setPickerKey((k) => k + 1);
      }
    } catch (e) {
      setResult(`⚠️ ${e instanceof Error ? e.message : "Upload failed."}`);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Library</h1>
        <Link href="/" className="text-sm text-blue-500 hover:underline">
          ← Chat
        </Link>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          key={pickerKey}
          type="file"
          multiple
          accept=".txt,.md,.jpg,.jpeg,.png"
          onChange={(e) => setSelected(Array.from(e.target.files ?? []))}
          disabled={busy}
          className="flex-1 border rounded-xl px-4 py-2"
        />
        <button
          onClick={upload}
          disabled={selected.length === 0 || busy}
          className="bg-blue-500 text-white px-4 py-2 rounded-xl hover:bg-blue-600 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>

      {busy && (
        <p className="text-sm text-gray-500 mb-4">
          Reading and indexing the files. A photo can take several seconds.
        </p>
      )}

      {result && (
        <pre className="whitespace-pre-wrap text-sm bg-gray-50 border rounded-xl p-3 mb-4">
          {result}
        </pre>
      )}

      <h2 className="font-medium mb-2">Files ({files.length})</h2>
      {files.length === 0 ? (
        <p className="text-sm text-gray-500">
          The library is empty. Choose .txt, .md, .jpg, .jpeg or .png files above.
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {files.map((file) => (
            <li key={file.name}>
              {file.indexed ? "✓" : "⚠️"} {file.name}
              {!file.indexed && <span className="text-gray-500"> — not indexed yet</span>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
