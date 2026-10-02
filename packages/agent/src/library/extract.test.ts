// Verifies specs/material-library/material-library.md — AC-11, and AC-6 (per-file failure).
// Mocked Anthropic client: no network, no cost.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const create = vi.hoisted(() => vi.fn());
vi.mock("../client.js", () => ({ client: { messages: { create } } }));
vi.mock("../tokenTracker.js", () => ({ trackUsage: vi.fn() }));

import { extractText, UNREADABLE_MARKER } from "./extract.js";

let root: string;

const file = (name: string, content: string | Buffer) => {
  const path = join(root, name);
  writeFileSync(path, content);
  return path;
};

const reply = (input: unknown) =>
  create.mockResolvedValueOnce({
    content: [{ type: "tool_use", id: "t1", name: "submit_transcription", input }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "extract-test-"));
  create.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("text files", () => {
  it("are read directly, without calling the model", async () => {
    const result = await extractText(file("jegyzet.txt", "  Mohács, 1526 – árvíztűrő tükörfúrógép \n"));

    expect(result).toEqual({
      ok: true,
      text: "Mohács, 1526 – árvíztűrő tükörfúrógép",
      unreadableParts: [],
      sourceKind: "text",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("an empty text file is reported, not indexed", async () => {
    const result = await extractText(file("ures.md", "  \n"));

    expect(result).toEqual({ ok: false, reason: "the file is empty" });
  });
});

describe("images", () => {
  it("AC-11: sends the photo to the model and returns the transcription", async () => {
    reply({ text: "A mohácsi csata 1526-ban volt.", unreadableParts: [] });

    const result = await extractText(file("oldal1.jpg", Buffer.from([1, 2, 3])), "test-model");

    expect(result).toEqual({
      ok: true,
      text: "A mohácsi csata 1526-ban volt.",
      unreadableParts: [],
      sourceKind: "image",
    });
    const request = create.mock.calls[0][0];
    expect(request.model).toBe("test-model");
    expect(request.tool_choice).toEqual({ type: "tool", name: "submit_transcription" });
    expect(request.messages[0].content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "AQID" },
    });
  });

  it("uses the right media type for .png and .jpeg", async () => {
    reply({ text: "a", unreadableParts: [] });
    reply({ text: "b", unreadableParts: [] });

    await extractText(file("a.PNG", Buffer.from([1])));
    await extractText(file("b.jpeg", Buffer.from([1])));

    expect(create.mock.calls[0][0].messages[0].content[0].source.media_type).toBe("image/png");
    expect(create.mock.calls[1][0].messages[0].content[0].source.media_type).toBe("image/jpeg");
  });

  it("AC-11: keeps the unreadable markers and lists the unreadable parts", async () => {
    reply({
      text: `II. Lajos ${UNREADABLE_MARKER} csatában esett el.`,
      unreadableParts: ["a szó II. Lajos után"],
    });

    const result = await extractText(file("oldal2.png", Buffer.from([1])));

    expect(result).toMatchObject({
      ok: true,
      unreadableParts: ["a szó II. Lajos után"],
    });
    expect(result.ok && result.text).toContain(UNREADABLE_MARKER);
  });

  it("AC-11: the prompt tells the model to transcribe and never guess", async () => {
    reply({ text: "x", unreadableParts: [] });

    await extractText(file("a.jpg", Buffer.from([1])));

    const system = create.mock.calls[0][0].system as string;
    expect(system).toMatch(/never guess/i);
    expect(system).toContain(UNREADABLE_MARKER);
  });

  it("AC-6: a photo without readable text is reported", async () => {
    reply({ text: "   ", unreadableParts: [] });

    expect(await extractText(file("homalyos.jpg", Buffer.from([1])))).toEqual({
      ok: false,
      reason: "no readable text found in the image",
    });
  });

  it("AC-6: an API failure is reported as a result, it does not throw", async () => {
    create.mockRejectedValueOnce(new Error("429 rate limit"));

    const result = await extractText(file("a.jpg", Buffer.from([1])));

    expect(result).toEqual({ ok: false, reason: "429 rate limit" });
  });

  it("AC-6: a response without a tool call is reported", async () => {
    create.mockResolvedValueOnce({ content: [{ type: "text", text: "hm" }], usage: { input_tokens: 1, output_tokens: 1 } });

    expect(await extractText(file("a.jpg", Buffer.from([1])))).toEqual({
      ok: false,
      reason: "the model returned no transcription",
    });
  });

  it("tolerates a malformed tool result instead of crashing", async () => {
    reply({ text: 42, unreadableParts: "nem tömb" });

    expect(await extractText(file("a.jpg", Buffer.from([1])))).toEqual({
      ok: false,
      reason: "no readable text found in the image",
    });
  });
});

describe("other cases", () => {
  it("AC-6: a missing file is reported, it does not throw", async () => {
    const result = await extractText(join(root, "nincs.txt"));

    expect(result.ok).toBe(false);
  });

  it("an unsupported type is rejected", async () => {
    expect(await extractText(file("fejezet.pdf", "%PDF"))).toEqual({
      ok: false,
      reason: 'unsupported file type ".pdf"',
    });
  });
});