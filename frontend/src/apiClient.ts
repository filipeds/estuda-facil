import type {
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

export interface ApiClient {
  listSubjects(): Promise<SubjectSummary[]>;
  listTopics(subject: string): Promise<Topic[]>;
  createTopic(subject: string, nome: string, descricao: string): Promise<Topic>;
  getResumo(subject: string, topicId: string): Promise<ResumoResponse>;
  getQuiz(subject: string, topicId: string): Promise<QuizQuestion[]>;
  submitAttempt(
    subject: string,
    topicId: string,
    questionId: string,
    selectedOptionId: string,
  ): Promise<QuizAttemptResult>;
  getInsights(subject: string): Promise<InsightsResponse>;
  getNotes(subject: string, topicId: string): Promise<NoteEntry[]>;
  addNote(subject: string, topicId: string, body: string): Promise<NoteEntry>;
  getOpencodeLog(subject: string): Promise<OpencodeLogEntry[]>;
}

export type StreamGenerate = (
  subject: string,
  onProgress: (e: GenerateProgressEvent) => void,
  onComplete: (topics: Topic[]) => void,
  onError: (message: string) => void,
) => () => void;

export type StreamOpencodeLog = (subject: string, onEntry: (e: OpencodeLogEntry) => void) => () => void;
