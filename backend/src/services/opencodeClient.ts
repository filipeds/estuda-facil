import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { OPENCODE_MODEL } from "../config.js";
import { appendOpencodeLogEntry } from "./opencodeLog.js";

interface OpencodeEvent {
  type: string;
  part?: { type?: string; text?: string };
}

/**
 * Combines system+user prompt into a temp file attached via `-f`, instead of putting
 * the (large, user-derived) content on argv — sidesteps Windows cmd.exe quoting entirely.
 * Uses the "summary" built-in agent because it's the only one whose permission set denies
 * bash/edit/webfetch by default: content in materias/ is arbitrary user file text, and we
 * don't want the model treating it as instructions to run shell commands or edit files.
 */
export async function askOpencode(subjectId: string, kind: string, system: string, userPrompt: string): Promise<string> {
  const promptFile = path.join(os.tmpdir(), `estuda-facil-prompt-${crypto.randomUUID()}.md`);
  const combinedPrompt = `${system}\n\n${userPrompt}`;
  await fs.writeFile(promptFile, combinedPrompt, "utf-8");
  const startedAt = Date.now();
  try {
    const response = await runOpencode(promptFile);
    await appendOpencodeLogEntry(subjectId, {
      id: crypto.randomUUID(),
      kind,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      request: combinedPrompt,
      response,
      error: null,
    });
    return response;
  } catch (err) {
    await appendOpencodeLogEntry(subjectId, {
      id: crypto.randomUUID(),
      kind,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      request: combinedPrompt,
      response: null,
      error: (err as Error).message,
    });
    throw err;
  } finally {
    await fs.unlink(promptFile).catch(() => {});
  }
}

function quoteArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function runOpencode(promptFile: string): Promise<string> {
  const args = [
    "run",
    "Siga rigorosamente as instruções do arquivo anexado e responda apenas o que for pedido.",
    "-f",
    promptFile,
    "--format",
    "json",
    "--agent",
    "summary",
  ];
  if (OPENCODE_MODEL) args.push("-m", OPENCODE_MODEL);

  return new Promise((resolve, reject) => {
    // shell:true is required on Windows to resolve the opencode.cmd shim; every arg is
    // pre-quoted since Node does not escape array args itself when shell is enabled.
    // stdio[0] must be "ignore" — opencode blocks reading stdin if left as an open, unfed pipe.
    const child = spawn("opencode", args.map(quoteArg), {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", (err) => {
      reject(new Error(`Não foi possível executar o opencode. Ele está instalado e no PATH? (${err.message})`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`opencode saiu com código ${code}: ${stderr.trim() || "(sem mensagem de erro)"}`));
        return;
      }
      resolve(extractText(stdout));
    });
  });
}

function extractText(stdout: string): string {
  let text = "";
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: OpencodeEvent;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (event.type === "text" && event.part?.type === "text" && event.part.text) {
      text += event.part.text;
    }
  }
  return text;
}

/** Extracts a JSON value from an opencode response, tolerating a ```json fenced block around it. */
export function extractJson<T>(text: string): T {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fencedMatch ? fencedMatch[1] : text).trim();
  try {
    return JSON.parse(candidate) as T;
  } catch (err) {
    throw new Error(`Não foi possível interpretar a resposta da IA como JSON: ${(err as Error).message}`);
  }
}
