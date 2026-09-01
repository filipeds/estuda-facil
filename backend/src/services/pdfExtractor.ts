import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
// pdf-parse ships no ESM types; default import works under esModuleInterop.
import pdfParse from "pdf-parse";
import { pdfCacheDir } from "./paths.js";

export async function extractPdfText(subjectId: string, absPdfPath: string): Promise<string> {
  const buffer = await fs.readFile(absPdfPath);
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const cacheFile = path.join(pdfCacheDir(subjectId), `${hash}.txt`);

  try {
    return await fs.readFile(cacheFile, "utf-8");
  } catch {
    // not cached yet
  }

  const parsed = await pdfParse(buffer);
  const text = parsed.text.trim();

  await fs.mkdir(pdfCacheDir(subjectId), { recursive: true });
  await fs.writeFile(cacheFile, text, "utf-8");

  return text;
}
