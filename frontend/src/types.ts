export type TopicOrigin = "manual" | "ia";
export type TopicStatus = "idle" | "good" | "mid" | "warn";

export interface Topic {
  id: string;
  nome: string;
  origem: TopicOrigin;
  descricao: string;
  arquivos: string[];
  criadoEm: string;
  atualizadoEm: string;
  mencoes?: number;
  tentativas: number;
  acertoPct: number | null;
  status: TopicStatus;
  statusLabel: string;
  nivelRevisao: number;
  proximaRevisaoEm: string | null;
  revisarAgora: boolean;
}

export interface SubjectSummary {
  id: string;
  nome: string;
  topicCount: number;
  lastUpdated: string | null;
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

export interface QuizAttemptResult {
  correct: boolean;
  respostaCorreta: string;
  explicacao: string;
}

export interface ReviewSessionResult {
  nivelRevisao: number;
  proximaRevisaoEm: string;
  revisarAgora: boolean;
}

export interface NoteEntry {
  time: string;
  body: string;
}

export interface ResumoResponse {
  topic: Topic;
  content: string | null;
  sources: string[];
}

export interface ChartDatum {
  id: string;
  nome: string;
  valor: number;
}

export interface InsightsResponse {
  content: string | null;
  maisEstudados: ChartDatum[];
  maisMencionados: ChartDatum[];
  progress: {
    totalQuestoes: number;
    acertoGeralPct: number | null;
    topicosDominados: number;
    totalTopicos: number;
  };
}

export interface GenerateProgressEvent {
  step: string;
  detail?: string;
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
