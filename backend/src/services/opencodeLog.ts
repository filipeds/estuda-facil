import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { opencodeLogPath } from "./paths.js";
import type { OpencodeLogEntry } from "../types/index.js";

const MAX_ENTRIES = 200;

/** Emits "entry" with (subjectId, entry) whenever a new opencode call is logged — powers the live chat view. */
export const opencodeLogEvents = new EventEmitter();

export async function readOpencodeLog(subjectId: string): Promise<OpencodeLogEntry[]> {
  try {
    const raw = await fs.readFile(opencodeLogPath(subjectId), "utf-8");
    return JSON.parse(raw) as OpencodeLogEntry[];
  } catch {
    return [];
  }
}

export async function appendOpencodeLogEntry(subjectId: string, entry: OpencodeLogEntry): Promise<void> {
  const entries = await readOpencodeLog(subjectId);
  entries.push(entry);
  const trimmed = entries.slice(-MAX_ENTRIES);
  await fs.mkdir(path.dirname(opencodeLogPath(subjectId)), { recursive: true });
  await fs.writeFile(opencodeLogPath(subjectId), JSON.stringify(trimmed, null, 2), "utf-8");
  opencodeLogEvents.emit("entry", subjectId, entry);
}
