import fs from "node:fs/promises";
import path from "node:path";
import { notesPath } from "./paths.js";
import type { NoteEntry } from "../types/index.js";

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Parses the "# Anotações — <topico>\n\n## <timestamp>\n<body>\n\n## ..." contract. */
function parseNotesMarkdown(raw: string): NoteEntry[] {
  const lines = raw.split(/\r?\n/);
  const entries: NoteEntry[] = [];
  let current: NoteEntry | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (current) {
      current.body = bodyLines.join("\n").trim();
      entries.push(current);
    }
    bodyLines = [];
  };

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      flush();
      current = { time: match[1].trim(), body: "" };
    } else if (current) {
      bodyLines.push(line);
    }
  }
  flush();

  return entries;
}

export async function readNotes(subjectId: string, topicId: string): Promise<NoteEntry[]> {
  try {
    const raw = await fs.readFile(notesPath(subjectId, topicId), "utf-8");
    return parseNotesMarkdown(raw);
  } catch {
    return [];
  }
}

export async function appendNote(
  subjectId: string,
  topicId: string,
  topicLabel: string,
  body: string,
): Promise<NoteEntry> {
  const filePath = notesPath(subjectId, topicId);
  const entry: NoteEntry = { time: formatTimestamp(new Date()), body: body.trim() };
  const newSection = `## ${entry.time}\n${entry.body}\n\n`;

  let existing: string;
  try {
    existing = await fs.readFile(filePath, "utf-8");
  } catch {
    existing = `# Anotações — ${topicLabel}\n\n`;
  }

  const headerMatch = existing.match(/^# .*\n\n?/);
  const header = headerMatch ? headerMatch[0].replace(/\n*$/, "\n\n") : `# Anotações — ${topicLabel}\n\n`;
  const rest = headerMatch ? existing.slice(headerMatch[0].length) : existing;

  const updated = header + newSection + rest;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, updated, "utf-8");

  return entry;
}
