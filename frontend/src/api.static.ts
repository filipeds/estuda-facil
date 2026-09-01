import type { ApiClient, StreamGenerate, StreamOpencodeLog } from "./apiClient";
import type { NoteEntry, QuizAttemptResult, QuizQuestion, Topic } from "./types";

const DEMO_BASE = `${import.meta.env.BASE_URL}demo-data`;
const UNAVAILABLE = "Indisponível na demo estática — requer o backend local.";

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(`${DEMO_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Não foi possível carregar ${path} (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export const api: ApiClient = {
  listSubjects: () => loadJson(`/subjects.json`),

  listTopics: (subject) => loadJson(`/topics/${subject}.json`),

  createTopic: () => Promise.reject<Topic>(new Error(UNAVAILABLE)),

  getResumo: (subject, topicId) => loadJson(`/resumo/${subject}/${topicId}.json`),

  getQuiz: (subject, topicId) => loadJson(`/quiz/${subject}/${topicId}.json`),

  submitAttempt: async (subject, topicId, questionId, selectedOptionId) => {
    const questions = await loadJson<QuizQuestion[]>(`/quiz/${subject}/${topicId}.json`);
    const question = questions.find((q) => q.id === questionId);
    if (!question) throw new Error("Questão não encontrada.");
    const result: QuizAttemptResult = {
      correct: question.respostaCorreta === selectedOptionId,
      respostaCorreta: question.respostaCorreta,
      explicacao: question.explicacao,
    };
    return result;
  },

  getInsights: (subject) => loadJson(`/insights/${subject}.json`),

  getNotes: (subject, topicId) => loadJson(`/notes/${subject}/${topicId}.json`),

  addNote: () => Promise.reject<NoteEntry>(new Error(UNAVAILABLE)),

  getOpencodeLog: (subject) => loadJson(`/opencode-log/${subject}.json`),
};

export const streamGenerate: StreamGenerate = (_subject, _onProgress, _onComplete, onError) => {
  onError(UNAVAILABLE);
  return () => {};
};

export const streamOpencodeLog: StreamOpencodeLog = (_subject, _onEntry) => {
  return () => {};
};
