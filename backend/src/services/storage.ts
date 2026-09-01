import fs from "node:fs/promises";
import path from "node:path";
import { MATERIAS_DIR } from "../config.js";
import {
  topicosPath,
  resumoPath,
  quizPath,
  insightsPath,
  quizHistoryPath,
  generatedDir,
  resumosDir,
  quizzesDir,
} from "./paths.js";
import type { Topic, QuizQuestion, QuizAttempt, QuizHistory } from "../types/index.js";

async function ensureDirFor(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function listSubjects(): Promise<string[]> {
  try {
    const entries = await fs.readdir(MATERIAS_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function readTopics(subjectId: string): Promise<Topic[]> {
  try {
    const raw = await fs.readFile(topicosPath(subjectId), "utf-8");
    return JSON.parse(raw) as Topic[];
  } catch {
    return [];
  }
}

export async function writeTopics(subjectId: string, topics: Topic[]): Promise<void> {
  await ensureDirFor(topicosPath(subjectId));
  await fs.writeFile(topicosPath(subjectId), JSON.stringify(topics, null, 2), "utf-8");
}

export async function readResumo(subjectId: string, topicId: string): Promise<string | null> {
  try {
    return await fs.readFile(resumoPath(subjectId, topicId), "utf-8");
  } catch {
    return null;
  }
}

export async function writeResumo(subjectId: string, topicId: string, content: string): Promise<void> {
  await fs.mkdir(resumosDir(subjectId), { recursive: true });
  await fs.writeFile(resumoPath(subjectId, topicId), content, "utf-8");
}

export async function readQuiz(subjectId: string, topicId: string): Promise<QuizQuestion[]> {
  try {
    const raw = await fs.readFile(quizPath(subjectId, topicId), "utf-8");
    return JSON.parse(raw) as QuizQuestion[];
  } catch {
    return [];
  }
}

export async function writeQuiz(subjectId: string, topicId: string, questions: QuizQuestion[]): Promise<void> {
  await fs.mkdir(quizzesDir(subjectId), { recursive: true });
  await fs.writeFile(quizPath(subjectId, topicId), JSON.stringify(questions, null, 2), "utf-8");
}

export async function readInsights(subjectId: string): Promise<string | null> {
  try {
    return await fs.readFile(insightsPath(subjectId), "utf-8");
  } catch {
    return null;
  }
}

export async function writeInsights(subjectId: string, content: string): Promise<void> {
  await fs.mkdir(generatedDir(subjectId), { recursive: true });
  await fs.writeFile(insightsPath(subjectId), content, "utf-8");
}

export async function readQuizHistory(subjectId: string): Promise<QuizAttempt[]> {
  try {
    const raw = await fs.readFile(quizHistoryPath(subjectId), "utf-8");
    return (JSON.parse(raw) as QuizHistory).attempts;
  } catch {
    return [];
  }
}

export async function appendQuizAttempt(subjectId: string, attempt: QuizAttempt): Promise<void> {
  const attempts = await readQuizHistory(subjectId);
  attempts.push(attempt);
  await ensureDirFor(quizHistoryPath(subjectId));
  await fs.writeFile(quizHistoryPath(subjectId), JSON.stringify({ attempts }, null, 2), "utf-8");
}
