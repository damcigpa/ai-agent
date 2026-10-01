import { readFileSync, existsSync, readdirSync, unlinkSync } from "fs";
import { resolve, extname, sep, join } from "path";
import { createError, formatError } from "../errors.js";

const MATERIALS_DIR = resolve(process.cwd(), "materials");

const TEXT_EXTENSIONS = [".txt", ".md"];
const IMAGE_EXTENSIONS: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export type MaterialContent =
  | { kind: "text"; text: string }
  | { kind: "image"; mediaType: string; base64: string };

export interface NamedMaterial {
  filename: string;
  content: MaterialContent;
}

function readOneFile(fullPath: string): MaterialContent | null {
  const ext = extname(fullPath).toLowerCase();

  if (TEXT_EXTENSIONS.includes(ext)) {
    return { kind: "text", text: readFileSync(fullPath, "utf-8") };
  }

  if (ext in IMAGE_EXTENSIONS) {
    const buffer = readFileSync(fullPath);
    return {
      kind: "image",
      mediaType: IMAGE_EXTENSIONS[ext],
      base64: buffer.toString("base64"),
    };
  }

  return null;
}

export function readMaterial(filename: string): MaterialContent | null {
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    console.warn(`⚠️  Rejected suspicious material filename: "${filename}"`);
    return null;
  }

  const fullPath = resolve(MATERIALS_DIR, filename);

  if (!fullPath.startsWith(MATERIALS_DIR + sep)) {
    console.warn(`⚠️  Rejected path escaping materials directory: "${filename}"`);
    return null;
  }

  if (!existsSync(fullPath)) {
    return null;
  }

  try {
    const content = readOneFile(fullPath);
    if (!content) {
      console.warn(`⚠️  Unsupported material file type: "${extname(fullPath)}"`);
    }
    return content;
  } catch (e) {
    const error = createError(
      "FILE_READ_FAILED",
      "fileSpoke",
      `Failed to read material: ${filename}`,
      { cause: e },
    );
    console.error(formatError(error));
    return null;
  }
}

// --- Read every supported file in materials/ as one batch ---

export function readAllMaterials(): NamedMaterial[] {
  if (!existsSync(MATERIALS_DIR)) {
    return [];
  }

  const filenames = readdirSync(MATERIALS_DIR).filter(
    (name) => name !== ".gitkeep" && !name.startsWith("."),
  );

  const results: NamedMaterial[] = [];

  for (const filename of filenames) {
    const fullPath = join(MATERIALS_DIR, filename);
    try {
      const content = readOneFile(fullPath);
      if (content) {
        results.push({ filename, content });
      } else {
        console.warn(`⚠️  Skipping unsupported file in materials/: "${filename}"`);
      }
    } catch (e) {
      const error = createError(
        "FILE_READ_FAILED",
        "fileSpoke",
        `Failed to read material: ${filename}`,
        { cause: e },
      );
      console.error(formatError(error));
    }
  }

  return results;
}

// --- Always called after an import attempt, success or failure ---

export function clearMaterials(): void {
  if (!existsSync(MATERIALS_DIR)) {
    return;
  }

  const filenames = readdirSync(MATERIALS_DIR).filter((name) => name !== ".gitkeep");

  for (const filename of filenames) {
    try {
      unlinkSync(join(MATERIALS_DIR, filename));
    } catch (e) {
      const error = createError(
        "FILE_WRITE_FAILED",
        "fileSpoke",
        `Failed to delete material: ${filename}`,
        { cause: e },
      );
      console.error(formatError(error));
    }
  }
}