// Verifies the material-library spec: Adding material; Material is never overwritten or modified; Listing the library.
// Real file system in temp folders, no API.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { listLibrary, moveInboxToLibrary, type LibraryPaths } from "./files.js";

let root: string;
let paths: LibraryPaths;

const inbox = (name: string, content = "x") => writeFileSync(join(paths.inboxDir, name), content);
const library = (name: string, content = "x") => writeFileSync(join(paths.libraryDir, name), content);
const inInbox = () => readdirSync(paths.inboxDir).sort();
const inLibrary = () => readdirSync(paths.libraryDir).sort();

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "library-test-"));
  paths = { inboxDir: join(root, "inbox"), libraryDir: join(root, "library") };
  mkdirSync(paths.inboxDir);
  mkdirSync(paths.libraryDir);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("moveInboxToLibrary", () => {
  it("Adding material: moves files from the inbox into the library, content unchanged", () => {
    inbox("jegyzet.txt", "Mohács, 1526");
    inbox("oldal1.jpg", "kép");

    const result = moveInboxToLibrary(paths);

    expect(result.added).toEqual(["jegyzet.txt", "oldal1.jpg"]);
    expect(inLibrary()).toEqual(["jegyzet.txt", "oldal1.jpg"]);
    expect(inInbox()).toEqual([]);
    expect(readFileSync(join(paths.libraryDir, "jegyzet.txt"), "utf-8")).toBe("Mohács, 1526");
  });

  it("Adding material: creates the library folder if it does not exist yet", () => {
    rmSync(paths.libraryDir, { recursive: true });
    inbox("a.txt");

    expect(moveInboxToLibrary(paths).added).toEqual(["a.txt"]);
    expect(inLibrary()).toEqual(["a.txt"]);
  });

  it("Adding material: accepts the supported types in any letter case", () => {
    for (const f of ["a.TXT", "b.md", "c.JPG", "d.jpeg", "e.Png"]) inbox(f);

    expect(moveInboxToLibrary(paths).added).toEqual(["a.TXT", "b.md", "c.JPG", "d.jpeg", "e.Png"]);
  });

  it("Adding material: ignores hidden files and .gitkeep — they stay in the inbox and are not reported", () => {
    inbox(".gitkeep", "");
    inbox(".DS_Store");
    inbox("a.txt");

    const result = moveInboxToLibrary(paths);

    expect(result).toEqual({ added: ["a.txt"], unsupported: [], duplicates: [], failed: [] });
    expect(inInbox()).toEqual([".DS_Store", ".gitkeep"]);
  });

  it("Adding material: leaves unsupported files and folders in the inbox and reports them", () => {
    inbox("a.txt");
    inbox("fejezet.pdf");
    mkdirSync(join(paths.inboxDir, "fotok"));

    const result = moveInboxToLibrary(paths);

    expect(result.added).toEqual(["a.txt"]);
    expect(result.unsupported).toEqual(["fejezet.pdf", "fotok/"]);
    expect(inInbox()).toEqual(["fejezet.pdf", "fotok"]);
  });

  it("Material is never overwritten or modified: never overwrites — a file with the same name stays in the inbox", () => {
    library("jegyzet.txt", "eredeti");
    inbox("jegyzet.txt", "új");

    const result = moveInboxToLibrary(paths);

    expect(result.duplicates).toEqual(["jegyzet.txt"]);
    expect(readFileSync(join(paths.libraryDir, "jegyzet.txt"), "utf-8")).toBe("eredeti");
    expect(inInbox()).toEqual(["jegyzet.txt"]);
  });

  it("Material is never overwritten or modified: treats names differing only in letter case as the same name", () => {
    library("oldal1.jpg", "eredeti");
    inbox("Oldal1.JPG", "új");

    expect(moveInboxToLibrary(paths).duplicates).toEqual(["Oldal1.JPG"]);
    expect(inLibrary()).toEqual(["oldal1.jpg"]);
  });

  it("Adding material: reports nothing for an empty or missing inbox", () => {
    const empty = { added: [], unsupported: [], duplicates: [], failed: [] };

    expect(moveInboxToLibrary(paths)).toEqual(empty);
    rmSync(paths.inboxDir, { recursive: true });
    expect(moveInboxToLibrary(paths)).toEqual(empty);
  });

  it("Material is never overwritten or modified: leaves existing library files untouched", () => {
    library("regi.txt", "eredeti");
    inbox("uj.txt");

    moveInboxToLibrary(paths);

    expect(inLibrary()).toEqual(["regi.txt", "uj.txt"]);
    expect(readFileSync(join(paths.libraryDir, "regi.txt"), "utf-8")).toBe("eredeti");
  });
});

describe("listLibrary", () => {
  it("Listing the library: lists supported files sorted by name, without hidden files", () => {
    library("b.txt");
    library("a.jpg");
    library(".DS_Store");

    expect(listLibrary(paths)).toEqual(["a.jpg", "b.txt"]);
  });

  it("Listing the library: returns an empty list for an empty or missing library", () => {
    expect(listLibrary(paths)).toEqual([]);
    rmSync(paths.libraryDir, { recursive: true });
    expect(listLibrary(paths)).toEqual([]);
    expect(existsSync(paths.libraryDir)).toBe(false); // listing must not create it
  });
});