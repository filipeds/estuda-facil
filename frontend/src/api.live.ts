import type {
  ChartDatum,
  GenerateProgressEvent,
  InsightsResponse,
  NoteEntry,
  OpencodeLogEntry,
  QuizAttemptResult,
  QuizQuestion,
  ResumoResponse,
  SubjectSummary,
  Topic,
} from "./types";
import type { ApiClient } from "./apiClient";

const BASE_URL = import.meta.env.VITE_API_BASE ?? "http://localhost:3333";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api: ApiClient = {
  listSubjects: () => request<SubjectSummary[]>("/api/subjects"),

  listTopics: (subject: string) => request<Topic[]>(`/api/subjects/${subject}/topics`),

  createTopic: (subject: string, nome: string, descricao: string) =>
    request<Topic>(`/api/subjects/${subject}/topics`, {
      method: "POST",
      body: JSON.stringify({ nome, descricao }),
    }),

  getResumo: (subject: string, topicId: string) =>
    request<ResumoResponse>(`/api/subjects/${subject}/topics/${topicId}/resumo`),

  getQuiz: (subject: string, topicId: string) =>
    request<QuizQuestion[]>(`/api/subjects/${subject}/topics/${topicId}/quiz`),

  submitAttempt: (subject: string, topicId: string, questionId: string, selectedOptionId: string) =>
    request<QuizAttemptResult>(`/api/subjects/${subject}/topics/${topicId}/quiz/attempts`, {
      method: "POST",
      body: JSON.stringify({ questionId, selectedOptionId }),
    }),

  getInsights: (subject: string) => request<InsightsResponse>(`/api/subjects/${subject}/insights`),

  getNotes: (subject: string, topicId: string) =>
    request<NoteEntry[]>(`/api/subjects/${subject}/notes/${topicId}`),

  addNote: (subject: string, topicId: string, body: string) =>
    request<NoteEntry>(`/api/subjects/${subject}/notes/${topicId}`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),

  getOpencodeLog: (subject: string) => request<OpencodeLogEntry[]>(`/api/subjects/${subject}/opencode-log`),
};

export function streamGenerate(
  subject: string,
  onProgress: (e: GenerateProgressEvent) => void,
  onComplete: (topics: Topic[]) => void,
  onError: (message: string) => void,
): () => void {
  const source = new EventSource(`${BASE_URL}/api/subjects/${subject}/generate`);

  source.addEventListener("progress", (event) => {
    onProgress(JSON.parse((event as MessageEvent).data));
  });
  source.addEventListener("complete", (event) => {
    const data = JSON.parse((event as MessageEvent).data) as { topics: Topic[] };
    onComplete(data.topics);
    source.close();
  });
  // Pipeline-level failure reported explicitly by the server (e.g. missing API key).
  source.addEventListener("failed", (event) => {
    const data = JSON.parse((event as MessageEvent).data) as { message: string };
    onError(data.message);
    source.close();
  });
  // Native EventSource connection error (server unreachable, dropped connection, etc.).
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) return;
    onError("Falha na conexão com o servidor durante a atualização.");
    source.close();
  };

  return () => source.close();
}

/** Live tail of opencode calls (request/response) for the "Chat IA" view. */
export function streamOpencodeLog(subject: string, onEntry: (e: OpencodeLogEntry) => void): () => void {
  const source = new EventSource(`${BASE_URL}/api/subjects/${subject}/opencode-log/stream`);

  source.addEventListener("entry", (event) => {
    onEntry(JSON.parse((event as MessageEvent).data));
  });
  // No onerror handling here (unlike streamGenerate) — this is a best-effort live tail, not
  // a flow the user needs to know failed; the persisted log is re-fetched on next visit anyway.

  return () => source.close();
}

export type { ChartDatum };
