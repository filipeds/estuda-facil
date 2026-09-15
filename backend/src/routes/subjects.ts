import type { FastifyInstance } from "fastify";
import {
  listSubjects,
  readTopics,
  writeTopics,
  readResumo,
  readQuiz,
  readInsights,
  readQuizHistory,
  appendQuizAttempt,
  readReviewSchedule,
  writeReviewSchedule,
} from "../services/storage.js";
import { readManifest } from "../services/fileScanner.js";
import { readNotes, appendNote } from "../services/notes.js";
import { computeTopicStats, computeReviewUpdate, isDue } from "../services/aiPipeline.js";
import { runGenerate } from "../services/pipelineRunner.js";
import { slugify } from "../services/paths.js";
import { readOpencodeLog, opencodeLogEvents } from "../services/opencodeLog.js";
import type { Topic, OpencodeLogEntry, QuizAttempt } from "../types/index.js";

function humanizeSubjectId(id: string): string {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type TopicStatus = "idle" | "good" | "mid" | "warn";

function topicStatus(tentativas: number, acertoPct: number | null): { status: TopicStatus; label: string } {
  if (tentativas === 0) return { status: "idle", label: "Não iniciado" };
  if (acertoPct !== null && acertoPct >= 80) return { status: "good", label: "Dominado" };
  if (acertoPct !== null && acertoPct < 50) return { status: "warn", label: "Requer atenção" };
  return { status: "mid", label: "Em progresso" };
}

async function withStats(subjectId: string, topics: Topic[]) {
  const attempts = await readQuizHistory(subjectId);
  const stats = computeTopicStats(topics, attempts);
  const byId = new Map(stats.map((s) => [s.id, s]));
  const schedule = await readReviewSchedule(subjectId);
  const now = new Date();
  return topics.map((t) => {
    const s = byId.get(t.id) ?? { tentativas: 0, acertoPct: null };
    const { status, label } = topicStatus(s.tentativas, s.acertoPct);
    const reviewEntry = schedule.entries[t.id];
    return {
      ...t,
      tentativas: s.tentativas,
      acertoPct: s.acertoPct,
      status,
      statusLabel: label,
      nivelRevisao: reviewEntry?.nivel ?? 0,
      proximaRevisaoEm: reviewEntry?.proximaRevisaoEm ?? null,
      revisarAgora: isDue(reviewEntry, now),
    };
  });
}

export default async function subjectsRoutes(fastify: FastifyInstance) {
  fastify.get("/api/subjects", async () => {
    const ids = await listSubjects();
    const subjects = await Promise.all(
      ids.map(async (id) => {
        const topics = await readTopics(id);
        const manifest = await readManifest(id);
        return {
          id,
          nome: humanizeSubjectId(id),
          topicCount: topics.length,
          lastUpdated: manifest.lastUpdated,
        };
      }),
    );
    return subjects;
  });

  fastify.get("/api/subjects/:subject/topics", async (request) => {
    const { subject } = request.params as { subject: string };
    const topics = await readTopics(subject);
    return withStats(subject, topics);
  });

  fastify.post("/api/subjects/:subject/topics", async (request, reply) => {
    const { subject } = request.params as { subject: string };
    const body = request.body as { nome?: string; descricao?: string };
    if (!body.nome || !body.nome.trim()) {
      return reply.status(400).send({ message: "Informe um nome para o tópico." });
    }

    const topics = await readTopics(subject);
    let id = slugify(body.nome);
    let suffix = 2;
    while (topics.some((t) => t.id === id)) {
      id = `${slugify(body.nome)}-${suffix}`;
      suffix += 1;
    }

    const now = new Date().toISOString();
    const topic: Topic = {
      id,
      nome: body.nome.trim(),
      origem: "manual",
      descricao: body.descricao?.trim() ?? "",
      arquivos: [],
      criadoEm: now,
      atualizadoEm: now,
      mencoes: 0,
    };
    topics.push(topic);
    await writeTopics(subject, topics);

    // A brand-new topic has no attempts yet — return it already shaped like the GET /topics response.
    return reply.status(201).send({
      ...topic,
      tentativas: 0,
      acertoPct: null,
      status: "idle",
      statusLabel: "Não iniciado",
      nivelRevisao: 0,
      proximaRevisaoEm: null,
      revisarAgora: true,
    });
  });

  fastify.get("/api/subjects/:subject/topics/:topicId/resumo", async (request, reply) => {
    const { subject, topicId } = request.params as { subject: string; topicId: string };
    const topics = await readTopics(subject);
    const topic = topics.find((t) => t.id === topicId);
    if (!topic) return reply.status(404).send({ message: "Tópico não encontrado." });
    const content = await readResumo(subject, topicId);
    return { topic, content, sources: topic.arquivos };
  });

  fastify.get("/api/subjects/:subject/topics/:topicId/quiz", async (request) => {
    const { subject, topicId } = request.params as { subject: string; topicId: string };
    return readQuiz(subject, topicId);
  });

  fastify.post("/api/subjects/:subject/topics/:topicId/quiz/attempts", async (request, reply) => {
    const { subject, topicId } = request.params as { subject: string; topicId: string };
    const body = request.body as { questionId?: string; selectedOptionId?: string };
    if (!body.questionId || !body.selectedOptionId) {
      return reply.status(400).send({ message: "questionId e selectedOptionId são obrigatórios." });
    }
    const questions = await readQuiz(subject, topicId);
    const question = questions.find((q) => q.id === body.questionId);
    if (!question) return reply.status(404).send({ message: "Questão não encontrada." });

    const correct = question.respostaCorreta === body.selectedOptionId;
    await appendQuizAttempt(subject, {
      topicId,
      questionId: body.questionId,
      selectedOptionId: body.selectedOptionId,
      correct,
      timestamp: new Date().toISOString(),
    });

    return { correct, respostaCorreta: question.respostaCorreta, explicacao: question.explicacao };
  });

  fastify.post("/api/subjects/:subject/topics/:topicId/review/complete", async (request, reply) => {
    const { subject, topicId } = request.params as { subject: string; topicId: string };

    const questions = await readQuiz(subject, topicId);
    if (questions.length === 0) {
      return reply.status(400).send({ message: "Nenhum quiz gerado para este tópico." });
    }

    const attempts = await readQuizHistory(subject);
    const questionIds = new Set(questions.map((q) => q.id));
    const latestByQuestion = new Map<string, QuizAttempt>();
    for (const attempt of attempts) {
      if (attempt.topicId !== topicId || !questionIds.has(attempt.questionId)) continue;
      const existing = latestByQuestion.get(attempt.questionId);
      if (!existing || attempt.timestamp > existing.timestamp) {
        latestByQuestion.set(attempt.questionId, attempt);
      }
    }

    const answeredAll = questions.every((q) => latestByQuestion.has(q.id));
    if (!answeredAll) {
      return reply.status(400).send({ message: "Sessão de quiz incompleta." });
    }

    const correct = [...latestByQuestion.values()].filter((a) => a.correct).length;
    const pctCorrect = correct / questions.length;
    const latestAt = [...latestByQuestion.values()]
      .map((a) => a.timestamp)
      .reduce((max, ts) => (ts > max ? ts : max));

    const schedule = await readReviewSchedule(subject);
    const existing = schedule.entries[topicId];

    // Idempotency guard: if we've already recorded a session at least as recent as the
    // latest answer used in this computation, there's nothing new to report — return the
    // existing entry as-is instead of recomputing/advancing the level again.
    if (existing && existing.ultimaSessaoEm >= latestAt) {
      return {
        nivelRevisao: existing.nivel,
        proximaRevisaoEm: existing.proximaRevisaoEm,
        revisarAgora: isDue(existing, new Date()),
      };
    }

    const updated = computeReviewUpdate(existing, pctCorrect, new Date());
    schedule.entries[topicId] = updated;
    await writeReviewSchedule(subject, schedule);

    return { nivelRevisao: updated.nivel, proximaRevisaoEm: updated.proximaRevisaoEm, revisarAgora: false };
  });

  fastify.get("/api/subjects/:subject/insights", async (request) => {
    const { subject } = request.params as { subject: string };
    const topics = await readTopics(subject);
    const attempts = await readQuizHistory(subject);
    const stats = computeTopicStats(topics, attempts);
    const statsById = new Map(stats.map((s) => [s.id, s]));

    const maisEstudados = [...stats]
      .sort((a, b) => b.tentativas - a.tentativas)
      .slice(0, 5)
      .map((s) => ({ id: s.id, nome: s.nome, valor: s.tentativas }));

    const maisMencionados = [...topics]
      .sort((a, b) => (b.mencoes ?? 0) - (a.mencoes ?? 0))
      .slice(0, 5)
      .map((t) => ({ id: t.id, nome: t.nome, valor: t.mencoes ?? 0 }));

    const totalQuestoes = attempts.length;
    const totalCorrect = attempts.filter((a) => a.correct).length;
    const acertoGeralPct = totalQuestoes ? Math.round((totalCorrect / totalQuestoes) * 100) : null;
    const topicosDominados = topics.filter((t) => (statsById.get(t.id)?.acertoPct ?? -1) >= 80).length;

    const content = await readInsights(subject);

    return {
      content,
      maisEstudados,
      maisMencionados,
      progress: {
        totalQuestoes,
        acertoGeralPct,
        topicosDominados,
        totalTopicos: topics.length,
      },
    };
  });

  fastify.get("/api/subjects/:subject/notes/:topicId", async (request) => {
    const { subject, topicId } = request.params as { subject: string; topicId: string };
    return readNotes(subject, topicId);
  });

  fastify.post("/api/subjects/:subject/notes/:topicId", async (request, reply) => {
    const { subject, topicId } = request.params as { subject: string; topicId: string };
    const body = request.body as { body?: string };
    if (!body.body || !body.body.trim()) {
      return reply.status(400).send({ message: "A anotação não pode estar vazia." });
    }
    const topics = await readTopics(subject);
    const topic = topics.find((t) => t.id === topicId);
    const label = topic?.nome ?? topicId;
    const entry = await appendNote(subject, topicId, label, body.body);
    return reply.status(201).send(entry);
  });

  // GET (not POST) so the browser's native EventSource can consume this as SSE.
  fastify.get("/api/subjects/:subject/generate", async (request, reply) => {
    const { subject } = request.params as { subject: string };

    reply.hijack();
    // reply.hijack() skips @fastify/cors's onSend hook, so the CORS header has to be set by hand
    // here — otherwise the browser's EventSource silently refuses the cross-origin connection.
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": request.headers.origin ?? "*",
    });

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await runGenerate(subject, (step, detail) => send("progress", { step, detail }));
      send("complete", { topics: result.topics, diff: result.diff });
    } catch (err) {
      // Named "failed" (not "error") — EventSource treats an "error"-named SSE event as
      // indistinguishable from a native connection failure, so the real message never surfaces.
      send("failed", { message: (err as Error).message });
    } finally {
      reply.raw.end();
    }
  });

  fastify.get("/api/subjects/:subject/opencode-log", async (request) => {
    const { subject } = request.params as { subject: string };
    return readOpencodeLog(subject);
  });

  // SSE tail of opencode calls as they happen, for the "Chat IA" view — same GET+EventSource
  // pattern as /generate above, so the browser can consume it natively.
  fastify.get("/api/subjects/:subject/opencode-log/stream", async (request, reply) => {
    const { subject } = request.params as { subject: string };

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": request.headers.origin ?? "*",
    });

    const onEntry = (entrySubjectId: string, entry: OpencodeLogEntry) => {
      if (entrySubjectId !== subject) return;
      reply.raw.write(`event: entry\ndata: ${JSON.stringify(entry)}\n\n`);
    };
    opencodeLogEvents.on("entry", onEntry);

    request.raw.on("close", () => {
      opencodeLogEvents.off("entry", onEntry);
    });
  });
}
