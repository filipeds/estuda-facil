import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { askOpencode, extractJson } from "./opencodeClient.js";
import { extractPdfText } from "./pdfExtractor.js";
import { subjectDir } from "./paths.js";
import { readTopics, writeTopics, writeResumo, writeQuiz, writeInsights, readQuizHistory } from "./storage.js";
import { slugify } from "./paths.js";
import type { Topic, QuizQuestion, QuizAttempt } from "../types/index.js";

const MAX_CHARS_PER_FILE = 15000;

export type ProgressFn = (step: string, detail?: string) => void;

interface LoadedFile {
  relPath: string;
  kind: "aula" | "atividade" | "anotacao";
  content: string;
}

function kindFor(relPath: string): LoadedFile["kind"] {
  if (relPath.startsWith("aulas/")) return "aula";
  if (relPath.startsWith("atividades/")) return "atividade";
  return "anotacao";
}

async function loadFile(subjectId: string, relPath: string): Promise<LoadedFile> {
  const abs = path.join(subjectDir(subjectId), relPath);
  let content: string;
  if (relPath.toLowerCase().endsWith(".pdf")) {
    content = await extractPdfText(subjectId, abs);
  } else {
    content = await fs.readFile(abs, "utf-8");
  }
  if (content.length > MAX_CHARS_PER_FILE) {
    content = content.slice(0, MAX_CHARS_PER_FILE) + "\n\n[...conteúdo truncado...]";
  }
  return { relPath, kind: kindFor(relPath), content };
}

function renderFilesForPrompt(files: LoadedFile[]): string {
  return files
    .map((f) => `### Arquivo: ${f.relPath} (${f.kind})\n${f.content}`)
    .join("\n\n---\n\n");
}

interface TopicSuggestion {
  id?: string;
  nome: string;
  descricao: string;
  arquivos: string[];
}

/**
 * Asks the AI to reconcile the existing topic tree against new/changed source content.
 * Manual topics are never sent for deletion by the model and are force-preserved here.
 */
export async function updateTopics(
  subjectId: string,
  existingTopics: Topic[],
  changedFiles: LoadedFile[],
  removedRelPaths: string[],
): Promise<Topic[]> {
  const now = new Date().toISOString();

  if (changedFiles.length === 0 && removedRelPaths.length === 0) {
    return existingTopics;
  }

  const system = `Você organiza o conteúdo de uma matéria de estudos em tópicos. Responda SEMPRE em português do Brasil e SEMPRE apenas com um bloco JSON (sem texto fora dele).`;

  const existingDescription = existingTopics
    .map((t) => `- id: "${t.id}" | nome: "${t.nome}" | origem: "${t.origem}" | descrição: "${t.descricao}" | arquivos atuais: ${JSON.stringify(t.arquivos)}`)
    .join("\n");

  const prompt = `Tópicos já existentes nesta matéria:
${existingDescription || "(nenhum ainda)"}

Arquivos removidos desde a última atualização: ${JSON.stringify(removedRelPaths)}

Conteúdo novo ou alterado a ser incorporado:
${renderFilesForPrompt(changedFiles)}

Tarefa: devolva a lista COMPLETA e atualizada de tópicos desta matéria, incorporando o conteúdo acima.
Regras:
- Tópicos com origem "manual" já existentes DEVEM permanecer na lista com o mesmo id, nome e origem "manual" (você pode só enriquecer a descrição e associar arquivos a eles se fizer sentido).
- Você pode criar novos tópicos (origem "ia") quando o conteúdo não couber nos existentes, ou atualizar a descrição/arquivos de tópicos "ia" existentes.
- Não crie tópicos duplicados/redundantes — funda com um tópico existente sempre que o assunto for o mesmo.
- Remova de "arquivos" qualquer caminho que esteja na lista de removidos.
- Cada tópico deve ter poucas palavras no nome (título de estudo, não uma frase).

Responda apenas com um bloco \`\`\`json contendo um array de objetos no formato:
[{ "id": "slug-do-topico", "nome": "...", "origem": "manual" | "ia", "descricao": "...", "arquivos": ["aulas/arquivo.md"] }]`;

  const response = await askOpencode(subjectId, "topicos", system, prompt);
  const suggested = extractJson<Array<TopicSuggestion & { origem?: string }>>(response);

  const manualById = new Map(existingTopics.filter((t) => t.origem === "manual").map((t) => [t.id, t]));
  const existingById = new Map(existingTopics.map((t) => [t.id, t]));

  const result: Topic[] = [];
  const seenIds = new Set<string>();

  for (const s of suggested) {
    const id = s.id ? slugify(s.id) : slugify(s.nome);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const manual = manualById.get(id);
    if (manual) {
      result.push({
        ...manual,
        descricao: s.descricao?.trim() || manual.descricao,
        arquivos: Array.from(new Set([...(s.arquivos ?? []), ...manual.arquivos])).filter(
          (f) => !removedRelPaths.includes(f),
        ),
        atualizadoEm: now,
      });
      continue;
    }

    const existing = existingById.get(id);
    result.push({
      id,
      nome: s.nome,
      origem: "ia",
      descricao: s.descricao ?? "",
      arquivos: (s.arquivos ?? []).filter((f) => !removedRelPaths.includes(f)),
      criadoEm: existing?.criadoEm ?? now,
      atualizadoEm: now,
    });
  }

  // Force-preserve any manual topic the model dropped from its response entirely.
  for (const manual of manualById.values()) {
    if (!seenIds.has(manual.id)) {
      result.push({
        ...manual,
        arquivos: manual.arquivos.filter((f) => !removedRelPaths.includes(f)),
      });
    }
  }

  return result;
}

export async function generateResumo(subjectId: string, topic: Topic, files: LoadedFile[]): Promise<string> {
  const system = `Você escreve resumos de estudo claros e objetivos em português do Brasil, em Markdown, para ajudar um estudante a revisar antes de uma prova.`;
  const prompt = `Tópico: ${topic.nome}
Descrição do tópico: ${topic.descricao || "(sem descrição)"}

Material-fonte deste tópico:
${renderFilesForPrompt(files) || "(nenhum arquivo associado ainda — escreva um resumo breve de abertura convidando o estudante a adicionar material)"}

Escreva um resumo de estudo em Markdown para este tópico:
- Comece com um parágrafo introdutório curto.
- Use subtítulos (##) para as subseções principais do assunto.
- Destaque pelo menos um ponto-chave usando uma citação em bloco (>) quando fizer sentido.
- Foque no que é mais provável cair em prova, com base no material.
- Não inclua o título do tópico como H1 (isso é adicionado pela interface).`;

  const resumo = await askOpencode(subjectId, `resumo: ${topic.nome}`, system, prompt);
  const timestamp = new Date().toLocaleDateString("pt-BR");
  return `${resumo.trim()}\n\n---\n*Gerado por IA a partir dos arquivos da matéria. Última atualização: ${timestamp}.*\n`;
}

export async function generateQuiz(subjectId: string, topic: Topic, files: LoadedFile[]): Promise<QuizQuestion[]> {
  const system = `Você cria quizzes de múltipla escolha para revisão de provas, em português do Brasil. Responda SEMPRE apenas com um bloco JSON.`;
  const prompt = `Tópico: ${topic.nome}
Descrição: ${topic.descricao || "(sem descrição)"}

Material-fonte:
${renderFilesForPrompt(files) || "(nenhum arquivo associado ainda)"}

Crie de 4 a 8 questões de múltipla escolha (4 alternativas cada, só uma correta) cobrindo os pontos mais importantes deste material para uma prova.
Responda apenas com um bloco \`\`\`json no formato:
[{
  "id": "q1",
  "pergunta": "...",
  "opcoes": [{ "id": "a", "texto": "..." }, { "id": "b", "texto": "..." }, { "id": "c", "texto": "..." }, { "id": "d", "texto": "..." }],
  "respostaCorreta": "b",
  "explicacao": "..."
}]`;

  const response = await askOpencode(subjectId, `quiz: ${topic.nome}`, system, prompt);
  return extractJson<QuizQuestion[]>(response);
}

export function computeTopicStats(topics: Topic[], attempts: QuizAttempt[]) {
  return topics.map((t) => {
    const topicAttempts = attempts.filter((a) => a.topicId === t.id);
    const correct = topicAttempts.filter((a) => a.correct).length;
    const pct = topicAttempts.length ? Math.round((correct / topicAttempts.length) * 100) : null;
    return { id: t.id, nome: t.nome, tentativas: topicAttempts.length, acertoPct: pct };
  });
}

/** Counts case-insensitive occurrences of each topic's name across a set of source files. */
export function computeMentionCounts(topics: Topic[], files: LoadedFile[]): Record<string, number> {
  const counts: Record<string, number> = {};
  const combined = files.map((f) => f.content).join("\n").toLowerCase();
  for (const topic of topics) {
    const needle = topic.nome.trim().toLowerCase();
    if (!needle) {
      counts[topic.id] = 0;
      continue;
    }
    let count = 0;
    let index = combined.indexOf(needle);
    while (index !== -1) {
      count += 1;
      index = combined.indexOf(needle, index + needle.length);
    }
    counts[topic.id] = count;
  }
  return counts;
}

export async function generateInsights(subjectId: string, topics: Topic[]): Promise<string> {
  const attempts = await readQuizHistory(subjectId);
  const stats = computeTopicStats(topics, attempts);

  const system = `Você analisa o progresso de estudo de um estudante e escreve insights curtos e acionáveis em português do Brasil, em Markdown.`;
  const prompt = `Tópicos e desempenho em quiz (percentual nulo = ainda sem tentativas):
${JSON.stringify(stats, null, 2)}

Descrições dos tópicos:
${topics.map((t) => `- ${t.nome}: ${t.descricao || "(sem descrição)"}`).join("\n")}

Escreva insights em Markdown com estas seções (use ## para cada uma):
## Pontos de atenção
Liste os tópicos com pior desempenho ou ainda não estudados e por que merecem atenção.
## Conexões entre tópicos
Aponte dependências reais entre os tópicos (ex.: um tópico exige domínio de outro) com base nas descrições.
## Sugestão de estudo
Uma ordem de estudo recomendada, em uma frase.

Seja específico e breve — isto será lido rapidamente antes de uma sessão de estudo.`;

  const insights = await askOpencode(subjectId, "insights", system, prompt);
  return insights.trim() + "\n";
}

export { loadFile };
export type { LoadedFile };
