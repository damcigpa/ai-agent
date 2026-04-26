import { writeFileSync } from "fs";

export function writeFile(path: string, content: string): string {
  try {
    writeFileSync(path, content, "utf-8");
    return `File written successfully to ${path}`;
  } catch (e) {
    return `Error writing file: ${(e as Error).message}`;
  }
}
