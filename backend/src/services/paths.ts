import path from "node:path";
import {
  MATERIAS_DIR,
  AULAS_DIR_NAME,
  ATIVIDADES_DIR_NAME,
  ANOTACOES_DIR_NAME,
  ESTUDA_DIR_NAME,
} from "../config.js";

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "topico"
  );
}

export const subjectDir = (subjectId: string) => path.join(MATERIAS_DIR, subjectId);
export const aulasDir = (subjectId: string) => path.join(subjectDir(subjectId), AULAS_DIR_NAME);
export const atividadesDir = (subjectId: string) => path.join(subjectDir(subjectId), ATIVIDADES_DIR_NAME);
export const anotacoesDir = (subjectId: string) => path.join(subjectDir(subjectId), ANOTACOES_DIR_NAME);
export const estudaDir = (subjectId: string) => path.join(subjectDir(subjectId), ESTUDA_DIR_NAME);
export const generatedDir = (subjectId: string) => path.join(estudaDir(subjectId), "generated");
export const resumosDir = (subjectId: string) => path.join(generatedDir(subjectId), "resumos");
export const quizzesDir = (subjectId: string) => path.join(generatedDir(subjectId), "quizzes");
export const pdfCacheDir = (subjectId: string) => path.join(estudaDir(subjectId), "pdf-cache");

export const manifestPath = (subjectId: string) => path.join(estudaDir(subjectId), "manifest.json");
export const topicosPath = (subjectId: string) => path.join(generatedDir(subjectId), "topicos.json");
export const insightsPath = (subjectId: string) => path.join(generatedDir(subjectId), "insights.md");
export const quizHistoryPath = (subjectId: string) => path.join(estudaDir(subjectId), "quiz-history.json");
export const opencodeLogPath = (subjectId: string) => path.join(estudaDir(subjectId), "opencode-log.json");

export const resumoPath = (subjectId: string, topicId: string) =>
  path.join(resumosDir(subjectId), `${topicId}.md`);
export const quizPath = (subjectId: string, topicId: string) =>
  path.join(quizzesDir(subjectId), `${topicId}.json`);
export const notesPath = (subjectId: string, topicId: string) =>
  path.join(anotacoesDir(subjectId), `${topicId}.md`);
