import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { aulasDir, atividadesDir, anotacoesDir, manifestPath, subjectDir } from "./paths.js";
import type { Manifest, FileDiff, ManifestFileEntry } from "../types/index.js";

const SOURCE_EXTENSIONS = new Set([".md", ".pdf"]);

async function walkDir(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      files.push(...(await walkDir(full)));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

async function hashFile(absPath: string): Promise<string> {
  const buffer = await fs.readFile(absPath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function readManifest(subjectId: string): Promise<Manifest> {
  try {
    const raw = await fs.readFile(manifestPath(subjectId), "utf-8");
    return JSON.parse(raw) as Manifest;
  } catch {
    return { files: {}, lastUpdated: null };
  }
}

export async function writeManifest(subjectId: string, manifest: Manifest): Promise<void> {
  await fs.mkdir(path.dirname(manifestPath(subjectId)), { recursive: true });
  await fs.writeFile(manifestPath(subjectId), JSON.stringify(manifest, null, 2), "utf-8");
}

/** All source files (aulas, atividades, anotacoes) as paths relative to the subject directory. */
export async function listSourceFiles(subjectId: string): Promise<string[]> {
  const base = subjectDir(subjectId);
  const dirs = [aulasDir(subjectId), atividadesDir(subjectId), anotacoesDir(subjectId)];
  const all = (await Promise.all(dirs.map(walkDir))).flat();
  return all.map((abs) => path.relative(base, abs).split(path.sep).join("/"));
}

export interface ScanResult {
  diff: FileDiff;
  currentEntries: Record<string, ManifestFileEntry>;
}

/** Scans source files and diffs them against the stored manifest. Does not persist the manifest. */
export async function scanForChanges(subjectId: string): Promise<ScanResult> {
  const base = subjectDir(subjectId);
  const relFiles = await listSourceFiles(subjectId);
  const manifest = await readManifest(subjectId);

  const currentEntries: Record<string, ManifestFileEntry> = {};
  const diff: FileDiff = { added: [], changed: [], removed: [], unchanged: [] };

  for (const rel of relFiles) {
    const abs = path.join(base, rel);
    const stat = await fs.stat(abs);
    const hash = await hashFile(abs);
    currentEntries[rel] = { hash, size: stat.size, mtimeMs: stat.mtimeMs };

    const previous = manifest.files[rel];
    if (!previous) {
      diff.added.push(rel);
    } else if (previous.hash !== hash) {
      diff.changed.push(rel);
    } else {
      diff.unchanged.push(rel);
    }
  }

  for (const rel of Object.keys(manifest.files)) {
    if (!(rel in currentEntries)) diff.removed.push(rel);
  }

  return { diff, currentEntries };
}
