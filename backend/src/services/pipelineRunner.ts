import { scanForChanges, writeManifest, listSourceFiles } from "./fileScanner.js";
import { readTopics, writeTopics, writeResumo, writeQuiz, writeInsights } from "./storage.js";
import {
  updateTopics,
  generateResumo,
  generateQuiz,
  generateInsights,
  loadFile,
  computeMentionCounts,
} from "./aiPipeline.js";
import type { LoadedFile } from "./aiPipeline.js";
import type { Topic } from "../types/index.js";
import type { ProgressFn } from "./aiPipeline.js";

export async function runGenerate(subjectId: string, onProgress: ProgressFn) {
  onProgress("scan", "Procurando arquivos novos ou alterados...");
  const { diff, currentEntries } = await scanForChanges(subjectId);
  const hasFileChanges = diff.added.length > 0 || diff.changed.length > 0 || diff.removed.length > 0;

  let topics: Topic[] = await readTopics(subjectId);
  const existingTopics = topics;

  if (hasFileChanges) {
    onProgress(
      "topics",
      `Atualizando tópicos (${diff.added.length} novos, ${diff.changed.length} alterados, ${diff.removed.length} removidos)...`,
    );
    const touchedPaths = [...diff.added, ...diff.changed];
    const touchedFiles: LoadedFile[] = [];
    for (const relPath of touchedPaths) {
      touchedFiles.push(await loadFile(subjectId, relPath));
    }
    topics = await updateTopics(subjectId, existingTopics, touchedFiles, diff.removed);
    await writeTopics(subjectId, topics);

    const existingIds = new Set(existingTopics.map((t) => t.id));
    const affected = topics.filter((t) => {
      const isNew = !existingIds.has(t.id);
      const touchedThisTopic = t.arquivos.some((f) => diff.added.includes(f) || diff.changed.includes(f));
      return isNew || touchedThisTopic;
    });

    for (const topic of affected) {
      onProgress("resumo", `Gerando resumo: ${topic.nome}`);
      const files: LoadedFile[] = [];
      for (const relPath of topic.arquivos) {
        files.push(await loadFile(subjectId, relPath));
      }
      const resumo = await generateResumo(subjectId, topic, files);
      await writeResumo(subjectId, topic.id, resumo);

      onProgress("quiz", `Gerando quiz: ${topic.nome}`);
      const quiz = await generateQuiz(subjectId, topic, files);
      await writeQuiz(subjectId, topic.id, quiz);
    }
  } else {
    onProgress("topics", "Nenhum arquivo novo — tópicos mantidos como estão.");
  }

  onProgress("mencoes", "Calculando menções de cada tópico no material...");
  const allRelPaths = await listSourceFiles(subjectId);
  const allFiles: LoadedFile[] = [];
  for (const relPath of allRelPaths) {
    allFiles.push(await loadFile(subjectId, relPath));
  }
  const mentionCounts = computeMentionCounts(topics, allFiles);
  topics = topics.map((t) => ({ ...t, mencoes: mentionCounts[t.id] ?? 0 }));
  await writeTopics(subjectId, topics);

  onProgress("insights", "Gerando insights da matéria...");
  const insights = await generateInsights(subjectId, topics);
  await writeInsights(subjectId, insights);

  onProgress("manifest", "Salvando estado do processamento...");
  await writeManifest(subjectId, { files: currentEntries, lastUpdated: new Date().toISOString() });

  onProgress("done", "Atualização concluída.");
  return { topics, diff };
}
