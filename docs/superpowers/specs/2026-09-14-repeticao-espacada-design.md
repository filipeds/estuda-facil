# Repetição espaçada por tópico (Leitner simplificado)

## Contexto

O Estuda Fácil gera, por tópico, um quiz fixo (`readQuiz`/`writeQuiz`) que é
regenerado pela IA sempre que o material-fonte daquele tópico muda
(`pipelineRunner.ts`). Cada resposta do usuário vira um `QuizAttempt`
(`topicId`, `questionId`, `correct`, `timestamp`) acumulado em
`quiz-history.json` (`storage.ts`). Hoje esses dados só alimentam
`computeTopicStats` (`aiPipeline.ts`), que calcula `tentativas`/`acertoPct`
cumulativos por tópico — não existe nenhum conceito de "está na hora de
revisar este tópico".

Esta spec cobre a primeira das cinco metodologias de estudo priorizadas
(ver conversa anterior): repetição espaçada. As outras quatro (elaboração,
técnica de Feynman, dual coding, pomodoro) têm branches próprias
(`feature/elaboracao`, `feature/tecnica-feynman`, `feature/dual-coding`,
`feature/pomodoro`) e specs separadas.

## Objetivo

Agendar, por tópico, quando o usuário deve refazer o quiz daquele tópico,
usando um esquema de caixas Leitner simplificado:

- Quando o usuário termina de responder **todas** as perguntas atuais do
  quiz de um tópico numa mesma sessão, o backend calcula o % de acerto
  daquela sessão e ajusta o nível de revisão do tópico.
- `% de acerto ≥ 70%` → sobe um nível (revisão mais espaçada).
- `% de acerto < 70%` → volta para o nível 1 (revisar de novo logo).
- Tópicos vencidos (incluindo os nunca estudados) ganham um selo "Revisar"
  na lista de tópicos.

Fora do escopo desta spec:
- Repetição espaçada por pergunta individual (ficou definido que o
  agendamento é por tópico, não por flashcard/questão).
- SM-2 ou qualquer algoritmo de fator de facilidade contínuo (optou-se pelo
  Leitner simplificado, com níveis fixos).
- Notificações/push de revisão — só o selo visual na lista de tópicos.
- Replicar esta lógica no script `frontend/scripts/build-demo-data.mjs`
  (demo estática do GitHub Pages) — pode ficar como follow-up; a demo
  simplesmente não mostrará o selo de revisão até isso ser feito.

## Modelo de dados

Novo arquivo por matéria, independente de `topics.json` e `quiz-history.json`:
`materias/<subject>/.estuda/review-schedule.json`.

Isolado deliberadamente de `topics.json`: esse arquivo é reescrito por
inteiro pela IA a cada reconciliação de tópicos (`generateTopics` em
`aiPipeline.ts`), e não deve arriscar perder progresso de revisão nessa
reescrita.

```ts
interface ReviewEntry {
  nivel: number;              // 1 a 5 (caixa Leitner)
  proximaRevisaoEm: string;   // ISO 8601
  ultimaSessaoEm: string;     // ISO 8601
}

interface ReviewSchedule {
  entries: Record<string, ReviewEntry>; // chave: topicId
}
```

Regra de "vencido": um tópico está vencido (`revisarAgora = true`) quando
**não existe entrada** para ele em `entries` (nunca completou uma sessão) OU
quando `proximaRevisaoEm <= agora`. Isso significa que tópicos recém-criados
já aparecem como "Revisar" antes da primeira sessão — decisão explícita
para incentivar o primeiro quiz.

Intervalos por nível (dias), índice = nível - 1:
```ts
const LEVEL_INTERVALS_DAYS = [1, 3, 7, 14, 30];
const MAX_LEVEL = 5;
const PASS_THRESHOLD = 0.7;
```

## Backend

### Funções puras (`backend/src/services/aiPipeline.ts`)

```ts
function computeReviewUpdate(
  current: ReviewEntry | undefined,
  pctCorrect: number, // 0..1
  now: Date,
): ReviewEntry
```
- `pctCorrect >= PASS_THRESHOLD`: `nivel = min((current?.nivel ?? 0) + 1, MAX_LEVEL)`.
- `pctCorrect < PASS_THRESHOLD`: `nivel = 1`.
- `proximaRevisaoEm = now + LEVEL_INTERVALS_DAYS[nivel - 1]` dias.
- `ultimaSessaoEm = now`.

```ts
function isDue(entry: ReviewEntry | undefined, now: Date): boolean
```
- `true` se `entry` for `undefined` ou `entry.proximaRevisaoEm <= now`.

Ambas são funções puras (sem I/O), seguindo o padrão já usado por
`computeTopicStats`/`computeMentionCounts` no mesmo arquivo — testáveis
sem mocks.

### Storage (`backend/src/services/storage.ts`)

```ts
function readReviewSchedule(subjectId: string): Promise<ReviewSchedule>
function writeReviewSchedule(subjectId: string, schedule: ReviewSchedule): Promise<void>
```
Mesmo padrão de `readQuizHistory`/`appendQuizAttempt`: arquivo ausente
resolve para `{ entries: {} }`.

### Rotas (`backend/src/routes/subjects.ts`)

**`withStats()`** passa a anexar também `nivelRevisao`, `proximaRevisaoEm` e
`revisarAgora` a cada tópico retornado por `GET /api/subjects/:subject/topics`
e `GET /api/subjects` — mesmo lugar que já injeta `tentativas`/`acertoPct`.
Tópico sem entrada: `nivelRevisao: 0`, `proximaRevisaoEm: null`,
`revisarAgora: true`.

**Novo endpoint** `POST /api/subjects/:subject/topics/:topicId/review/complete`:

1. `readQuiz(subject, topicId)` — se a lista vier vazia, `400`
   `{ message: "Nenhum quiz gerado para este tópico." }`.
2. `readQuizHistory(subject)`, filtra por `topicId` e por `questionId`
   pertencente ao conjunto de perguntas atuais do quiz.
3. Reduz para **a tentativa mais recente por `questionId`** (por
   `timestamp`).
4. Se o conjunto resultante não cobrir todas as perguntas atuais → `400`
   `{ message: "Sessão de quiz incompleta." }`.
5. Calcula `pctCorrect = corretas / total` sobre esse conjunto deduplicado e
   `latestAt` = o maior `timestamp` entre as tentativas deduplicadas (quando
   a resposta mais recente desta sessão foi de fato enviada).
6. `readReviewSchedule`. Se já existir uma entrada para o tópico e o
   `ultimaSessaoEm` dela for `>=` `latestAt`, não há nada novo para
   reportar: retorna a entrada existente sem chamar `computeReviewUpdate`
   nem regravar o arquivo (`revisarAgora` calculado via `isDue` sobre a
   entrada existente, já que o tempo pode ter passado desde a última
   chamada). Caso contrário, chama `computeReviewUpdate`, grava a entrada
   atualizada via `writeReviewSchedule`, retorna
   `{ nivelRevisao, proximaRevisaoEm, revisarAgora: false }`.

O endpoint recalcula a partir do histórico persistido em vez de confiar em
dados enviados pelo cliente (mais robusto contra chamadas fora de ordem). A
guarda do passo 6 é o que garante idempotência de fato: chamar de novo sem
nenhuma tentativa nova apenas devolve a entrada já gravada, sem avançar o
nível outra vez.

Regenerar o quiz (`pipelineRunner.ts`) não precisa de nenhuma mudança: como
`review-schedule.json` é um arquivo separado, trocar as perguntas de um
tópico não afeta o nível de revisão já acumulado (decisão explícita — o
nível pertence ao tópico, não às perguntas específicas).

## Frontend

- **`frontend/src/types.ts`**: `Topic` ganha
  `nivelRevisao: number; proximaRevisaoEm: string | null; revisarAgora: boolean`.
- **`frontend/src/api.ts`**: `completeReviewSession(subject: string, topicId: string): Promise<...>`
  chamando o novo endpoint.
- **`frontend/src/components/Quiz.tsx`**: um `useRef<boolean>` por
  `topic.id` marca se a sessão atual já foi reportada. Um `useEffect` que
  observa `answers` dispara `completeReviewSession` exatamente uma vez
  quando `Object.keys(answers).length === questions.length` (todas as
  perguntas atuais respondidas), e então recarrega os tópicos
  (`api.listTopics(subject).then(...)`, mesmo padrão já usado em
  `App.tsx` após a geração) para refletir o novo selo/nível. O ref é
  resetado no mesmo `useEffect` que já zera `answers`/`index` ao trocar de
  tópico.
- **`frontend/src/components/Sidebar.tsx`**: na lista de tópicos
  (`topic-row`), quando `t.revisarAgora` é `true`, mostra um selo de texto
  pequeno (ex.: `<span className="review-badge">Revisar</span>`) ao lado do
  nome do tópico.

## Erros e casos de borda

- `POST .../review/complete` chamado com sessão incompleta → `400`. Na UI
  normal isso não deveria acontecer (o front só chama quando todas as
  perguntas têm resposta), mas protege contra chamadas diretas à API.
- Tópico sem quiz gerado ainda → `400` no mesmo endpoint.
- Matéria sem `review-schedule.json` (nunca usado o recurso) → todos os
  tópicos aparecem como `revisarAgora: true` (comportamento padrão, não é
  erro).
- Múltiplas chamadas ao endpoint para a mesma sessão (ex.: usuário
  responde a última pergunta duas vezes por algum motivo, ou o front
  reenvia a chamada) → verdadeiro no-op: como nenhuma tentativa nova tem
  `timestamp` mais recente que o `ultimaSessaoEm` já gravado, o endpoint
  devolve a entrada existente sem recalcular nem regravar o arquivo (não
  avança o nível de novo).

## Testes

Testes unitários (`aiPipeline.test.ts`, seguindo o padrão dos testes já
existentes com `tsx --test`) para:
- `computeReviewUpdate`: acerto ≥70% sobe nível; abaixo de 70% reseta para
  nível 1; nível não ultrapassa `MAX_LEVEL`; datas calculadas batem com
  `LEVEL_INTERVALS_DAYS`.
- `isDue`: sem entrada → vencido; `proximaRevisaoEm` no passado → vencido;
  no futuro → não vencido.

Não há suite de testes de rota (nenhuma rota tem teste hoje no projeto);
o endpoint novo segue esse padrão existente e fica coberto indiretamente
pelos testes das funções puras que ele usa.
