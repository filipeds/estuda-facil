#!/usr/bin/env node
// frontend/scripts/build-demo-data.mjs
//
// Local-only tool: reads the already-generated content for the `calculo-1`
// example subject and writes the static JSON that frontend/src/api.static.ts
// fetches at runtime. Never run this in CI — materias/calculo-1/.estuda/ is
// git-ignored and only exists on a machine that has run the app for real.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SUBJECT_ID = "calculo-1";
const SUBJECT_DIR = path.join(REPO_ROOT, "materias", SUBJECT_ID);
const ESTUDA_DIR = path.join(SUBJECT_DIR, ".estuda");
const GENERATED_DIR = path.join(ESTUDA_DIR, "generated");
const OUT_DIR = path.join(__dirname, "..", "public", "demo-data");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Não foi possível ler ${filePath}: ${err.message}`);
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function humanizeSubjectId(id) {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Mirrors backend/src/routes/subjects.ts::topicStatus
function topicStatus(tentativas, acertoPct) {
  if (tentativas === 0) return { status: "idle", label: "Não iniciado" };
  if (acertoPct !== null && acertoPct >= 80) return { status: "good", label: "Dominado" };
  if (acertoPct !== null && acertoPct < 50) return { status: "warn", label: "Requer atenção" };
  return { status: "mid", label: "Em progresso" };
}

// Mirrors backend/src/services/aiPipeline.ts::computeTopicStats
function computeTopicStats(topics, attempts) {
  return topics.map((t) => {
    const topicAttempts = attempts.filter((a) => a.topicId === t.id);
    const correct = topicAttempts.filter((a) => a.correct).length;
    const pct = topicAttempts.length ? Math.round((correct / topicAttempts.length) * 100) : null;
    return { id: t.id, nome: t.nome, tentativas: topicAttempts.length, acertoPct: pct };
  });
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

const rawTopics = readJson(path.join(GENERATED_DIR, "topicos.json"), []);
if (rawTopics.length === 0) {
  throw new Error(
    `Nenhum tópico em ${path.join(GENERATED_DIR, "topicos.json")}. Rode o app localmente e clique ` +
      `em "Atualizar matéria" em ${SUBJECT_ID} antes de gerar a demo.`,
  );
}

const quizHistory = readJson(path.join(ESTUDA_DIR, "quiz-history.json"), { attempts: [] });
const manifest = readJson(path.join(ESTUDA_DIR, "manifest.json"), { files: {}, lastUpdated: null });
const attempts = quizHistory.attempts;

const stats = computeTopicStats(rawTopics, attempts);
const statsById = new Map(stats.map((s) => [s.id, s]));
const topics = rawTopics.map((t) => {
  const s = statsById.get(t.id) ?? { tentativas: 0, acertoPct: null };
  const { status, label } = topicStatus(s.tentativas, s.acertoPct);
  return { ...t, tentativas: s.tentativas, acertoPct: s.acertoPct, status, statusLabel: label };
});

writeJson(path.join(OUT_DIR, "subjects.json"), [
  {
    id: SUBJECT_ID,
    nome: humanizeSubjectId(SUBJECT_ID),
    topicCount: topics.length,
    lastUpdated: manifest.lastUpdated,
  },
]);

writeJson(path.join(OUT_DIR, "topics", `${SUBJECT_ID}.json`), topics);

for (const topic of topics) {
  const content = readText(path.join(GENERATED_DIR, "resumos", `${topic.id}.md`));
  writeJson(path.join(OUT_DIR, "resumo", SUBJECT_ID, `${topic.id}.json`), {
    topic,
    content,
    sources: topic.arquivos,
  });

  const quiz = readJson(path.join(GENERATED_DIR, "quizzes", `${topic.id}.json`), []);
  writeJson(path.join(OUT_DIR, "quiz", SUBJECT_ID, `${topic.id}.json`), quiz);

  writeJson(path.join(OUT_DIR, "notes", SUBJECT_ID, `${topic.id}.json`), []);
}

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

writeJson(path.join(OUT_DIR, "insights", `${SUBJECT_ID}.json`), {
  content: readText(path.join(GENERATED_DIR, "insights.md")),
  maisEstudados,
  maisMencionados,
  progress: { totalQuestoes, acertoGeralPct, topicosDominados, totalTopicos: topics.length },
});

writeJson(path.join(OUT_DIR, "opencode-log", `${SUBJECT_ID}.json`), []);

console.log(`Dados da demo gerados em ${path.relative(REPO_ROOT, OUT_DIR)}`);
