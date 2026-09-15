# Repetição Espaçada por Tópico (Leitner Simplificado) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agendar, por tópico, quando o usuário deve refazer o quiz daquele tópico, usando um esquema de caixas Leitner simplificado, e mostrar um selo "Revisar" na lista de tópicos quando a revisão estiver vencida.

**Architecture:** Um arquivo novo por matéria (`.estuda/review-schedule.json`) guarda o nível Leitner e a próxima data de revisão de cada tópico, isolado de `topics.json`/`quiz-history.json`. Um novo endpoint recalcula o nível a partir do histórico de tentativas sempre que o frontend detecta que o usuário respondeu todas as perguntas atuais do quiz de um tópico numa mesma sessão. `GET /topics` passa a anexar os campos de revisão a cada tópico, e a lista de tópicos no frontend mostra um selo quando a revisão está vencida.

**Tech Stack:** Fastify + TypeScript (backend, `tsx --test` para testes unitários), React + TypeScript (frontend, sem test runner configurado — build (`tsc -b`) é a verificação).

## Global Constraints

- Intervalos por nível (dias), índice = nível - 1: `[1, 3, 7, 14, 30]`.
- Nível máximo: `5`.
- Limiar de acerto para subir de nível: `>= 0.7` (70%); abaixo disso, nível volta para `1`.
- O nível de revisão só é recalculado quando **todas** as perguntas atuais do quiz do tópico têm uma tentativa registrada (sessão completa) — nunca em uma resposta isolada.
- `review-schedule.json` é um arquivo independente de `topics.json` e `quiz-history.json`; regenerar o quiz de um tópico (IA) nunca reseta o nível de revisão.
- Tópico sem entrada em `review-schedule.json` conta como vencido (`revisarAgora: true`) por padrão.
- Sem suite de testes de rota (nenhuma rota do projeto tem teste hoje) — funções puras ganham testes unitários com `node:test`; o endpoint novo é verificado manualmente.
- Fora de escopo: `frontend/scripts/build-demo-data.mjs` e a demo estática do GitHub Pages não replicam esta lógica nesta spec.

---

### Task 1: Modelo de dados e persistência (`review-schedule.json`)

**Files:**
- Modify: `backend/src/types/index.ts:57-59` (logo após `QuizHistory`)
- Modify: `backend/src/services/paths.ts:34` (logo após `quizHistoryPath`)
- Modify: `backend/src/services/storage.ts` (imports no topo, novas funções no final do arquivo)

**Interfaces:**
- Produces: `ReviewEntry { nivel: number; proximaRevisaoEm: string; ultimaSessaoEm: string }`, `ReviewSchedule { entries: Record<string, ReviewEntry> }`, `readReviewSchedule(subjectId: string): Promise<ReviewSchedule>`, `writeReviewSchedule(subjectId: string, schedule: ReviewSchedule): Promise<void>`.

- [ ] **Step 1: Adicionar os tipos `ReviewEntry` e `ReviewSchedule`**

Em `backend/src/types/index.ts`, logo depois da interface `QuizHistory` (linha 59):

```ts
export interface ReviewEntry {
  nivel: number;
  proximaRevisaoEm: string;
  ultimaSessaoEm: string;
}

export interface ReviewSchedule {
  entries: Record<string, ReviewEntry>;
}
```

- [ ] **Step 2: Adicionar o path do novo arquivo**

Em `backend/src/services/paths.ts`, logo depois de `quizHistoryPath` (linha 34):

```ts
export const reviewSchedulePath = (subjectId: string) => path.join(estudaDir(subjectId), "review-schedule.json");
```

- [ ] **Step 3: Adicionar `readReviewSchedule`/`writeReviewSchedule` em `storage.ts`**

Em `backend/src/services/storage.ts`, atualizar o import de `./paths.js` (linha 4-13) para incluir `reviewSchedulePath`:

```ts
import {
  topicosPath,
  resumoPath,
  quizPath,
  insightsPath,
  quizHistoryPath,
  reviewSchedulePath,
  generatedDir,
  resumosDir,
  quizzesDir,
} from "./paths.js";
```

E o import de tipos (linha 14) para incluir `ReviewSchedule`:

```ts
import type { Topic, QuizQuestion, QuizAttempt, QuizHistory, ReviewSchedule } from "../types/index.js";
```

No final do arquivo (depois de `appendQuizAttempt`, linha 97), adicionar:

```ts
export async function readReviewSchedule(subjectId: string): Promise<ReviewSchedule> {
  try {
    const raw = await fs.readFile(reviewSchedulePath(subjectId), "utf-8");
    return JSON.parse(raw) as ReviewSchedule;
  } catch {
    return { entries: {} };
  }
}

export async function writeReviewSchedule(subjectId: string, schedule: ReviewSchedule): Promise<void> {
  await ensureDirFor(reviewSchedulePath(subjectId));
  await fs.writeFile(reviewSchedulePath(subjectId), JSON.stringify(schedule, null, 2), "utf-8");
}
```

- [ ] **Step 4: Verificar que o backend compila**

Run: `npm run build --prefix backend`
Expected: build termina sem erros (sem saída de erro do `tsc`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/types/index.ts backend/src/services/paths.ts backend/src/services/storage.ts
git commit -m "feat: add review-schedule persistence for spaced repetition"
```

---

### Task 2: Lógica pura de agendamento Leitner (TDD)

**Files:**
- Modify: `backend/src/services/aiPipeline.ts` (import de tipos na linha 9, novas funções após `computeTopicStats`, linha 270)
- Test: `backend/src/services/aiPipeline.test.ts`

**Interfaces:**
- Consumes: `ReviewEntry` de `../types/index.js` (Task 1).
- Produces: `computeReviewUpdate(current: ReviewEntry | undefined, pctCorrect: number, now: Date): ReviewEntry`, `isDue(entry: ReviewEntry | undefined, now: Date): boolean`. Task 3 (rotas) e testes consomem essas duas funções.

- [ ] **Step 1: Escrever os testes (devem falhar)**

Em `backend/src/services/aiPipeline.test.ts`, adicionar ao final do arquivo (mantendo o import existente na linha 3 — trocar por incluir os novos nomes):

```ts
import { parseTopicSuggestions, parseQuizQuestions, computeReviewUpdate, isDue } from "./aiPipeline.js";
```

E adicionar os testes:

```ts
test("computeReviewUpdate sobe do nível 0 (nunca revisado) para o nível 1 quando acerta >= 70%", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const result = computeReviewUpdate(undefined, 0.7, now);
  assert.deepEqual(result, {
    nivel: 1,
    proximaRevisaoEm: "2026-01-02T00:00:00.000Z",
    ultimaSessaoEm: "2026-01-01T00:00:00.000Z",
  });
});

test("computeReviewUpdate sobe um nível a partir de um nível existente quando acerta >= 70%", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const current = { nivel: 1, proximaRevisaoEm: "2025-12-01T00:00:00.000Z", ultimaSessaoEm: "2025-11-30T00:00:00.000Z" };
  const result = computeReviewUpdate(current, 1, now);
  assert.equal(result.nivel, 2);
  assert.equal(result.proximaRevisaoEm, "2026-01-04T00:00:00.000Z");
});

test("computeReviewUpdate reseta para o nível 1 quando acerta menos de 70%, mesmo vindo de um nível alto", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const current = { nivel: 4, proximaRevisaoEm: "2025-12-01T00:00:00.000Z", ultimaSessaoEm: "2025-11-01T00:00:00.000Z" };
  const result = computeReviewUpdate(current, 0.5, now);
  assert.equal(result.nivel, 1);
  assert.equal(result.proximaRevisaoEm, "2026-01-02T00:00:00.000Z");
});

test("computeReviewUpdate não ultrapassa o nível máximo (5)", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const current = { nivel: 5, proximaRevisaoEm: "2025-12-01T00:00:00.000Z", ultimaSessaoEm: "2025-11-01T00:00:00.000Z" };
  const result = computeReviewUpdate(current, 1, now);
  assert.equal(result.nivel, 5);
  assert.equal(result.proximaRevisaoEm, "2026-01-31T00:00:00.000Z");
});

test("isDue retorna true quando não existe entrada de agendamento", () => {
  assert.equal(isDue(undefined, new Date("2026-01-01T00:00:00.000Z")), true);
});

test("isDue retorna true quando a próxima revisão já passou", () => {
  const entry = { nivel: 1, proximaRevisaoEm: "2020-01-01T00:00:00.000Z", ultimaSessaoEm: "2019-12-31T00:00:00.000Z" };
  assert.equal(isDue(entry, new Date("2026-01-01T00:00:00.000Z")), true);
});

test("isDue retorna false quando a próxima revisão ainda não chegou", () => {
  const entry = { nivel: 1, proximaRevisaoEm: "2030-01-01T00:00:00.000Z", ultimaSessaoEm: "2026-01-01T00:00:00.000Z" };
  assert.equal(isDue(entry, new Date("2026-01-01T00:00:00.000Z")), false);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm test --prefix backend`
Expected: FAIL — `computeReviewUpdate`/`isDue` não existem ainda (erro de import/undefined).

- [ ] **Step 3: Implementar `computeReviewUpdate` e `isDue`**

Em `backend/src/services/aiPipeline.ts`, atualizar o import de tipos (linha 9) para incluir `ReviewEntry`:

```ts
import type { Topic, QuizQuestion, QuizAttempt, ReviewEntry } from "../types/index.js";
```

Logo depois de `computeTopicStats` (linha 270, antes de `computeMentionCounts`), adicionar:

```ts
const REVIEW_LEVEL_INTERVALS_DAYS = [1, 3, 7, 14, 30];
const REVIEW_MAX_LEVEL = REVIEW_LEVEL_INTERVALS_DAYS.length;
const REVIEW_PASS_THRESHOLD = 0.7;

/**
 * Leitner simplificado: sessão com >=70% de acerto sobe um nível (até o máximo); abaixo
 * disso volta para o nível 1. O nível pertence ao tópico, não às perguntas específicas —
 * regenerar o quiz não afeta essa função nem o que ela leu antes de ser chamada.
 */
export function computeReviewUpdate(current: ReviewEntry | undefined, pctCorrect: number, now: Date): ReviewEntry {
  const nivel =
    pctCorrect >= REVIEW_PASS_THRESHOLD ? Math.min((current?.nivel ?? 0) + 1, REVIEW_MAX_LEVEL) : 1;
  const intervalDays = REVIEW_LEVEL_INTERVALS_DAYS[nivel - 1];
  const proximaRevisaoEm = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000).toISOString();
  return { nivel, proximaRevisaoEm, ultimaSessaoEm: now.toISOString() };
}

export function isDue(entry: ReviewEntry | undefined, now: Date): boolean {
  if (!entry) return true;
  return new Date(entry.proximaRevisaoEm).getTime() <= now.getTime();
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test --prefix backend`
Expected: PASS em todos os testes de `aiPipeline.test.ts`, incluindo os novos.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/aiPipeline.ts backend/src/services/aiPipeline.test.ts
git commit -m "feat: add Leitner-based review scheduling logic"
```

---

### Task 3: Endpoint de conclusão de sessão + `GET /topics` com dados de revisão

**Files:**
- Modify: `backend/src/routes/subjects.ts`

**Interfaces:**
- Consumes: `readReviewSchedule`, `writeReviewSchedule` (Task 1); `computeReviewUpdate`, `isDue` (Task 2); `QuizAttempt` de `../types/index.js`.
- Produces: `GET /api/subjects/:subject/topics` (e `GET /api/subjects`, via `withStats`) com `nivelRevisao: number`, `proximaRevisaoEm: string | null`, `revisarAgora: boolean` em cada tópico. Novo endpoint `POST /api/subjects/:subject/topics/:topicId/review/complete` retornando `{ nivelRevisao: number; proximaRevisaoEm: string; revisarAgora: false }` (200) ou `{ message: string }` (400).

- [ ] **Step 1: Atualizar imports**

Em `backend/src/routes/subjects.ts`, atualizar o import de `../services/storage.js` (linhas 2-11) para incluir `readReviewSchedule` e `writeReviewSchedule`:

```ts
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
```

Atualizar o import de `../services/aiPipeline.js` (linha 14):

```ts
import { computeTopicStats, computeReviewUpdate, isDue } from "../services/aiPipeline.js";
```

Atualizar o import de tipos (linha 18):

```ts
import type { Topic, OpencodeLogEntry, QuizAttempt } from "../types/index.js";
```

- [ ] **Step 2: Estender `withStats` com os dados de revisão**

Substituir a função `withStats` (linhas 36-45) por:

```ts
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
```

- [ ] **Step 3: Adicionar o endpoint de conclusão de sessão**

Logo depois da rota `POST /api/subjects/:subject/topics/:topicId/quiz/attempts` (depois da linha 138, antes de `GET /api/subjects/:subject/insights`), adicionar:

```ts
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

  const schedule = await readReviewSchedule(subject);
  const updated = computeReviewUpdate(schedule.entries[topicId], pctCorrect, new Date());
  schedule.entries[topicId] = updated;
  await writeReviewSchedule(subject, schedule);

  return { nivelRevisao: updated.nivel, proximaRevisaoEm: updated.proximaRevisaoEm, revisarAgora: false };
});
```

- [ ] **Step 4: Manter a resposta de criação manual de tópico consistente**

O handler `POST /api/subjects/:subject/topics` (criar tópico manualmente) monta a resposta à mão em vez de passar por `withStats`, então precisa incluir os mesmos campos de revisão — senão um tópico recém-criado voltaria `revisarAgora: undefined` em vez de `true` (contradizendo a regra de que tópicos nunca revisados contam como vencidos desde o início). Atualizar a linha 101:

```ts
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
```

- [ ] **Step 5: Verificar que o backend compila**

Run: `npm run build --prefix backend`
Expected: build termina sem erros.

- [ ] **Step 6: Verificação manual do endpoint**

Não há suite de testes de rota no projeto (nenhuma rota tem teste hoje), então esta etapa é manual, usando uma matéria que já tenha tópicos e quiz gerados localmente (ex.: `calculo-1`, se já tiver sido gerada nessa máquina):

Run: `npm run dev --prefix backend` (deixa rodando em outro terminal)

Depois, com o servidor no ar, substituindo `<subject>` e `<topicId>` por uma matéria/tópico reais:

```bash
curl http://localhost:3333/api/subjects/<subject>/topics/<topicId>/quiz
```
Expected: lista de perguntas do tópico (JSON não vazio).

```bash
curl -X POST http://localhost:3333/api/subjects/<subject>/topics/<topicId>/review/complete
```
Expected (se nem todas as perguntas têm tentativa ainda): `400` com `{"message":"Sessão de quiz incompleta."}`.

Responder todas as perguntas do tópico via `POST .../quiz/attempts` (uma por `questionId` retornado no passo anterior):

```bash
curl -X POST http://localhost:3333/api/subjects/<subject>/topics/<topicId>/quiz/attempts \
  -H "Content-Type: application/json" \
  -d '{"questionId":"<id-da-pergunta>","selectedOptionId":"<id-de-uma-opcao>"}'
```

Depois de responder todas, repetir o `POST .../review/complete`:
Expected: `200` com `{"nivelRevisao":1,"proximaRevisaoEm":"<ISO no futuro>","revisarAgora":false}`.

```bash
curl http://localhost:3333/api/subjects/<subject>/topics
```
Expected: o tópico respondido aparece com `"nivelRevisao":1` e `"revisarAgora":false`; os demais tópicos (sem sessão completa) aparecem com `"revisarAgora":true`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/subjects.ts
git commit -m "feat: add review-session-complete endpoint and expose review status on topics"
```

---

### Task 4: Tipos e cliente de API no frontend

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/apiClient.ts`
- Modify: `frontend/src/api.live.ts`
- Modify: `frontend/src/api.static.ts`

**Interfaces:**
- Consumes: nenhuma (espelha o contrato do endpoint da Task 3).
- Produces: `Topic` com `nivelRevisao: number; proximaRevisaoEm: string | null; revisarAgora: boolean`; `ReviewSessionResult { nivelRevisao: number; proximaRevisaoEm: string; revisarAgora: boolean }`; `ApiClient.completeReviewSession(subject: string, topicId: string): Promise<ReviewSessionResult>`. Task 5 (Quiz.tsx) consome `completeReviewSession`; Task 6 (Sidebar.tsx) consome `Topic.revisarAgora`.

- [ ] **Step 1: Estender o tipo `Topic` e adicionar `ReviewSessionResult`**

Em `frontend/src/types.ts`, substituir a interface `Topic` (linhas 4-17) por:

```ts
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
```

E adicionar, logo depois da interface `QuizAttemptResult` (linha 43):

```ts
export interface ReviewSessionResult {
  nivelRevisao: number;
  proximaRevisaoEm: string;
  revisarAgora: boolean;
}
```

- [ ] **Step 2: Adicionar o método na interface `ApiClient`**

Em `frontend/src/apiClient.ts`, atualizar o import de `./types` (linhas 1-11) para incluir `ReviewSessionResult`, e adicionar o método logo depois de `submitAttempt` (linha 24):

```ts
completeReviewSession(subject: string, topicId: string): Promise<ReviewSessionResult>;
```

- [ ] **Step 3: Implementar em `api.live.ts`**

Em `frontend/src/api.live.ts`, atualizar o import de `./types` (linhas 1-12) para incluir `ReviewSessionResult`, e adicionar logo depois de `submitAttempt` (linha 50):

```ts
completeReviewSession: (subject: string, topicId: string) =>
  request<ReviewSessionResult>(`/api/subjects/${subject}/topics/${topicId}/review/complete`, {
    method: "POST",
  }),
```

- [ ] **Step 4: Implementar em `api.static.ts`**

Em `frontend/src/api.static.ts`, atualizar o import de `./types` (linha 2) para incluir `ReviewSessionResult`, e adicionar logo depois de `submitAttempt` (linha 36), seguindo o mesmo padrão de `createTopic`/`addNote` (ações que exigem persistência real):

```ts
completeReviewSession: () => Promise.reject<ReviewSessionResult>(new Error(UNAVAILABLE)),
```

- [ ] **Step 5: Verificar que o frontend compila**

Run: `npm run build --prefix frontend`
Expected: build termina sem erros de tipo (o `tsc -b` falharia se `ApiClient` tivesse um método sem implementação em alguma das duas variantes).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/apiClient.ts frontend/src/api.live.ts frontend/src/api.static.ts
git commit -m "feat: add completeReviewSession to the API client"
```

---

### Task 5: Disparo da sessão de revisão no Quiz + refetch no App

**Files:**
- Modify: `frontend/src/components/Quiz.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `api.completeReviewSession` (Task 4).
- Produces: prop nova `onSessionComplete?: () => void` em `Quiz`, chamada uma vez por sessão completa.

- [ ] **Step 1: Adicionar a prop e o ref de controle em `Quiz.tsx`**

Em `frontend/src/components/Quiz.tsx`, adicionar `useRef` ao import do React (linha 1):

```tsx
import { useEffect, useRef, useState } from "react";
```

Atualizar a interface `Props` (linhas 5-8) para incluir a nova prop:

```tsx
interface Props {
  subject: string;
  topic: Topic | null;
  onSessionComplete?: () => void;
}
```

Atualizar a assinatura do componente (linha 17):

```tsx
export default function Quiz({ subject, topic, onSessionComplete }: Props) {
```

- [ ] **Step 2: Resetar o ref de sessão ao trocar de tópico**

No `useEffect` existente que reseta `answers`/`index` ao trocar de tópico (linhas 24-37), adicionar a criação/reset do ref logo acima dele (depois da declaração dos outros `useState`, antes da linha 24):

```tsx
const sessionReportedRef = useRef(false);
```

E dentro do `useEffect` existente, junto com `setAnswers({})` e `setIndex(0)` (linha 28-29), adicionar:

```tsx
sessionReportedRef.current = false;
```

- [ ] **Step 3: Disparar `completeReviewSession` quando a sessão terminar**

Logo depois desse `useEffect` (depois da linha 37, antes do `if (!topic) return ...` da linha 39), adicionar um novo `useEffect`:

```tsx
useEffect(() => {
  if (!topic || questions.length === 0) return;
  if (sessionReportedRef.current) return;
  if (Object.keys(answers).length !== questions.length) return;
  sessionReportedRef.current = true;
  api
    .completeReviewSession(subject, topic.id)
    .then(() => onSessionComplete?.())
    .catch(() => {
      // Melhor esforço: se a chamada falhar (ex.: demo estática sem backend), a sessão
      // simplesmente não avança de nível — não impede o usuário de ver o resultado do quiz.
    });
}, [answers, questions, subject, topic, onSessionComplete]);
```

- [ ] **Step 4: Passar o callback a partir de `App.tsx`**

Em `frontend/src/App.tsx`, atualizar a linha 143 (`{activeTab === "quiz" && <Quiz subject={activeSubject.id} topic={activeTopic} />}`) para:

```tsx
{activeTab === "quiz" && (
  <Quiz
    subject={activeSubject.id}
    topic={activeTopic}
    onSessionComplete={() => api.listTopics(activeSubject.id).then(setTopics)}
  />
)}
```

- [ ] **Step 5: Verificar que o frontend compila**

Run: `npm run build --prefix frontend`
Expected: build termina sem erros.

- [ ] **Step 6: Teste manual no navegador**

Run: `npm run dev --prefix backend` (um terminal) e `npm run dev --prefix frontend` (outro terminal).

No navegador, abrir uma matéria com um tópico que já tenha quiz gerado, ir na aba "Quiz" e responder todas as perguntas do tópico. Abrir as ferramentas de desenvolvedor (aba Network) e confirmar que, ao responder a última pergunta, uma requisição `POST .../review/complete` é disparada e retorna `200`. Voltar para a lista de tópicos (Task 6 ainda não adicionou o selo visual, então neste ponto a confirmação é só pela aba Network).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Quiz.tsx frontend/src/App.tsx
git commit -m "feat: report completed quiz sessions for spaced repetition scheduling"
```

---

### Task 6: Selo "Revisar" na lista de tópicos

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `Topic.revisarAgora` (Task 4).

- [ ] **Step 1: Adicionar o selo em `Sidebar.tsx`**

Em `frontend/src/components/Sidebar.tsx`, atualizar o botão de cada tópico (linhas 57-65) para:

```tsx
<button
  key={t.id}
  className={`topic-row${t.id === activeTopicId ? " current" : ""}`}
  onClick={() => onSelectTopic(t.id)}
>
  <span className={`dot ${t.status}`} />
  <span className="name">{t.nome}</span>
  {t.revisarAgora && <span className="review-badge">Revisar</span>}
  <span className="pct">{t.acertoPct !== null ? `${t.acertoPct}%` : "—"}</span>
</button>
```

- [ ] **Step 2: Adicionar o estilo do selo**

Em `frontend/src/styles.css`, logo depois da regra `.topic-row .pct` (linha 89), adicionar:

```css
.review-badge { font-size: 0.625rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--accent-strong); background: var(--accent-soft); border: 1px solid var(--accent-soft-line); border-radius: 999px; padding: 1px 6px; flex-shrink: 0; }
```

- [ ] **Step 3: Verificar que o frontend compila**

Run: `npm run build --prefix frontend`
Expected: build termina sem erros.

- [ ] **Step 4: Teste manual no navegador**

Com `npm run dev --prefix backend` e `npm run dev --prefix frontend` rodando, abrir uma matéria na Sidebar e confirmar visualmente:
- Tópicos nunca revisados (nenhuma sessão completa ainda) mostram o selo "Revisar" ao lado do nome.
- Depois de completar uma sessão de quiz inteira (Task 5) — seja com >=70% ou com <70% de acerto — recarregar a matéria (trocar de matéria e voltar, ou navegar para outra aba e voltar ao Dashboard) e confirmar que o tópico respondido **não** mostra mais o selo. Isso é esperado mesmo quando errou: o nível 1 já agenda a próxima revisão para 1 dia à frente, então o selo só volta a aparecer no dia seguinte — a diferença entre acertar e errar só fica visível em sessões futuras (acertar sobe para o nível 2, com 3 dias de intervalo; errar mantém no nível 1, com 1 dia).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/styles.css
git commit -m "feat: show a review badge on topics due for spaced repetition"
```
