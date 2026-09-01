export type TopicOrigin = "manual" | "ia";

export interface Topic {
  id: string;
  nome: string;
  origem: TopicOrigin;
  descricao: string;
  arquivos: string[];
  criadoEm: string;
  atualizadoEm: string;
  mencoes?: number;
}

export interface TopicsFile {
  topicos: Topic[];
}

export interface QuizOption {
  id: string;
  texto: string;
}

export interface QuizQuestion {
  id: string;
  pergunta: string;
  opcoes: QuizOption[];
  respostaCorreta: string;
  explicacao: string;
}

export interface ManifestFileEntry {
  hash: string;
  size: number;
  mtimeMs: number;
}

export interface Manifest {
  files: Record<string, ManifestFileEntry>;
  lastUpdated: string | null;
}

export interface FileDiff {
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: string[];
}

export interface QuizAttempt {
  topicId: string;
  questionId: string;
  selectedOptionId: string;
  correct: boolean;
  timestamp: string;
}

export interface QuizHistory {
  attempts: QuizAttempt[];
}

export interface NoteEntry {
  time: string;
  body: string;
}

export interface SubjectSummary {
  id: string;
  nome: string;
  topicCount: number;
  lastUpdated: string | null;
}

export interface OpencodeLogEntry {
  id: string;
  kind: string;
  timestamp: string;
  durationMs: number;
  request: string;
  response: string | null;
  error: string | null;
}
