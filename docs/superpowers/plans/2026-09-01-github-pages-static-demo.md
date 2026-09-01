# GitHub Pages Static Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a read-mostly static build of the Estuda Fácil frontend to GitHub Pages, backed by pre-generated JSON data for the `calculo-1` example subject, with no live backend.

**Architecture:** A new `ApiClient` interface pins down the exact shape both API implementations must satisfy. The existing network client is renamed to `api.live.ts` unchanged; a new `api.static.ts` reads static JSON under `frontend/public/demo-data/` instead of hitting a server. `api.ts` becomes a two-line switch on a `VITE_DEMO_MODE` build flag. A local-only Node script (`build-demo-data.mjs`) turns the real generated content for `calculo-1` into that static JSON — it is never run in CI, its output is committed directly. Three components gain a `DEMO_MODE` check that disables actions requiring a real backend. A GitHub Actions workflow builds and deploys `frontend/dist` to Pages on every push to `example/calculo-1`.

**Tech Stack:** React 18 + TypeScript + Vite (frontend, unchanged), Node.js (demo-data script, ESM), GitHub Actions (`actions/deploy-pages`).

## Global Constraints

- No new automated test framework — the project has none today (spec: "Fora do escopo... testes automatizados novos"). Every task's verification step is `tsc --noEmit` (or the existing `tsc -b`) plus a concrete manual check — never "test it works."
- No component's public behavior changes when `VITE_DEMO_MODE` is unset/false — `api.live.ts` must be byte-for-byte the current `frontend/src/api.ts` content, only renamed and given a type annotation.
- The demo covers exactly one subject, `calculo-1`. Do not generalize the demo-data script to loop over all subjects — that's out of scope (YAGNI) and the frontend has no subject switcher need in the demo.
- `frontend/scripts/build-demo-data.mjs` must never run as part of `npm run build`, `npm run build:demo`, or any CI step — it reads `materias/calculo-1/.estuda/`, which is git-ignored and will not exist on a CI checkout. Its output (`frontend/public/demo-data/`) is a committed artifact, generated locally and pushed like any other file.
- All UI copy is in Brazilian Portuguese, matching the rest of the app.
- Work happens on branch `main` for Tasks 1–8. Task 9 merges `main` into `example/calculo-1` and does the demo-data commit + deploy there — never generate or commit `frontend/public/demo-data/` on `main` (there is no `calculo-1` content there to generate it from).

---

## File Structure

- Create `frontend/src/apiClient.ts` — the `ApiClient`, `StreamGenerate`, `StreamOpencodeLog` type contract shared by both API implementations.
- Create `frontend/src/api.live.ts` — current `api.ts` content, renamed, with an `ApiClient` type annotation added.
- Create `frontend/src/demoMode.ts` — one-line `DEMO_MODE` flag.
- Create `frontend/src/api.static.ts` — static-JSON-backed implementation of `ApiClient`.
- Modify `frontend/src/api.ts` — becomes a switch between `api.live.ts` and `api.static.ts`.
- Modify `frontend/src/components/StageHeader.tsx` — disable "Atualizar matéria" in demo mode.
- Modify `frontend/src/components/NewTopicModal.tsx` — replace the form with a message in demo mode.
- Modify `frontend/src/components/NotesDrawer.tsx` — disable the compose area in demo mode.
- Modify `frontend/vite.config.ts` — set `base: "/estuda-facil/"` in `demo` mode.
- Create `frontend/.env.demo` — sets `VITE_DEMO_MODE=true` for the `demo` Vite mode.
- Modify `frontend/package.json` — add `demo:data` and `build:demo` scripts.
- Modify root `package.json` — add a `build:demo:frontend` convenience script, following the existing `build:frontend` pattern.
- Create `frontend/scripts/build-demo-data.mjs` — local tool that reads `materias/calculo-1/.estuda/**` and writes `frontend/public/demo-data/**`.
- Create `.github/workflows/deploy-pages.yml` — CI build + deploy to Pages.
- (Task 9 only, on `example/calculo-1`) Create `frontend/public/demo-data/**` — committed output of the script above.

---

### Task 1: API client type contract

**Files:**
- Create: `frontend/src/apiClient.ts`

**Interfaces:**
- Consumes: types from `frontend/src/types.ts` (`SubjectSummary`, `Topic`, `ResumoResponse`, `QuizQuestion`, `QuizAttemptResult`, `InsightsResponse`, `NoteEntry`, `OpencodeLogEntry`, `GenerateProgressEvent`) — all already exist, unchanged.
- Produces: `ApiClient` interface, `StreamGenerate` and `StreamOpencodeLog` function types, for Tasks 2, 3, 4 to implement/consume.

- [ ] **Step 1: Write the type contract**

```ts
// frontend/src/apiClient.ts
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
```

- [ ] **Step 2: Verify it compiles in isolation**

Run: `cd frontend && npx tsc --noEmit`
Expected: Same output as before this file existed (this file has no consumers yet, so it can only fail on its own syntax/type errors — there should be none).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/apiClient.ts
git commit -m "feat: add ApiClient type contract for live/static API implementations"
```

---

### Task 2: Rename the real API client to `api.live.ts`

**Files:**
- Create: `frontend/src/api.live.ts`
- Delete: `frontend/src/api.ts` (recreated as a switch in Task 3 — until then, leave it deleted and accept that the app temporarily fails to build; Task 3 is the very next task and restores it)

**Interfaces:**
- Consumes: `ApiClient`, `StreamGenerate`, `StreamOpencodeLog` from `./apiClient` (Task 1).
- Produces: `api: ApiClient`, `streamGenerate: StreamGenerate`-compatible function, `streamOpencodeLog: StreamOpencodeLog`-compatible function, all exported from `./api.live` for Task 3 to re-export.

- [ ] **Step 1: Move `api.ts` to `api.live.ts` verbatim**

```bash
git mv frontend/src/api.ts frontend/src/api.live.ts
```

- [ ] **Step 2: Add the `ApiClient` type annotation**

In `frontend/src/api.live.ts`, add the import and annotate the `api` const — do not change any method body:

```ts
// add to the top imports, alongside the existing `import type { ... } from "./types";`
import type { ApiClient } from "./apiClient";
```

```ts
// change:
// export const api = {
// to:
export const api: ApiClient = {
```

The rest of the file (`request`, every method body, `streamGenerate`, `streamOpencodeLog`, the trailing `export type { ChartDatum };`) stays exactly as it was.

- [ ] **Step 3: Verify the annotation is satisfied**

Run: `cd frontend && npx tsc --noEmit`
Expected: Fails only with errors about `frontend/src/App.tsx`, `frontend/src/components/*.tsx` no longer finding `./api` (because `api.ts` doesn't exist yet) — e.g. `Cannot find module './api'`. No errors should be reported *inside* `api.live.ts` itself. This confirms the `ApiClient` shape matches the real implementation. (Task 3 fixes the missing-module errors.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.live.ts
git commit -m "refactor: rename api.ts to api.live.ts and type it against ApiClient"
```

---

### Task 3: Demo mode flag and static API client

**Files:**
- Create: `frontend/src/demoMode.ts`
- Create: `frontend/src/api.static.ts`
- Create: `frontend/src/api.ts`

**Interfaces:**
- Consumes: `ApiClient`, `StreamGenerate`, `StreamOpencodeLog` from `./apiClient` (Task 1); `api`, `streamGenerate`, `streamOpencodeLog` from `./api.live` (Task 2).
- Produces: `DEMO_MODE: boolean` from `./demoMode`, consumed by Tasks 5 and 6. `api`, `streamGenerate`, `streamOpencodeLog`, `type ChartDatum` re-exported from `./api`, matching exactly what every component already imports today — no component changes in this task.

- [ ] **Step 1: Write the demo mode flag**

```ts
// frontend/src/demoMode.ts
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
```

- [ ] **Step 2: Write the static API client**

```ts
// frontend/src/api.static.ts
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
```

- [ ] **Step 3: Rewrite `api.ts` as the switch**

```ts
// frontend/src/api.ts
import { DEMO_MODE } from "./demoMode";
import {
  api as liveApi,
  streamGenerate as liveStreamGenerate,
  streamOpencodeLog as liveStreamOpencodeLog,
} from "./api.live";
import {
  api as staticApi,
  streamGenerate as staticStreamGenerate,
  streamOpencodeLog as staticStreamOpencodeLog,
} from "./api.static";
import type { StreamGenerate, StreamOpencodeLog } from "./apiClient";

export const api = DEMO_MODE ? staticApi : liveApi;
export const streamGenerate: StreamGenerate = DEMO_MODE ? staticStreamGenerate : liveStreamGenerate;
export const streamOpencodeLog: StreamOpencodeLog = DEMO_MODE ? staticStreamOpencodeLog : liveStreamOpencodeLog;
export type { ChartDatum } from "./types";
```

- [ ] **Step 4: Verify the whole app type-checks again**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors — this restores (and improves) the state from before Task 2.

- [ ] **Step 5: Verify the live app still runs unchanged**

Run: `cd frontend && npm run dev` (leave it running), then in a browser open `http://localhost:5173` with the backend also running (`cd backend && npm run dev` in another terminal).
Expected: App behaves exactly as before — subjects load, topics load, quiz/resumo/insights work. This proves `VITE_DEMO_MODE` being unset still selects `api.live.ts`. Stop both dev servers after checking.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/demoMode.ts frontend/src/api.static.ts frontend/src/api.ts
git commit -m "feat: add static API client and VITE_DEMO_MODE switch in api.ts"
```

---

### Task 4: Vite demo mode configuration and npm scripts

**Files:**
- Modify: `frontend/vite.config.ts`
- Create: `frontend/.env.demo`
- Modify: `frontend/package.json`
- Modify: root `package.json`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure build config).
- Produces: `npm run build:demo -w frontend` (used by Task 9's CI workflow and by local verification in Task 6), `npm run demo:data -w frontend` (used by Task 5 and Task 9).

- [ ] **Step 1: Make `base` depend on the Vite mode**

Replace the full contents of `frontend/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "demo" ? "/estuda-facil/" : "/",
  server: {
    port: 5173,
  },
}));
```

- [ ] **Step 2: Add the demo mode env file**

```
# frontend/.env.demo
VITE_DEMO_MODE=true
```

- [ ] **Step 3: Add the frontend npm scripts**

In `frontend/package.json`, add two entries to `"scripts"` (keep `dev`, `build`, `preview` as they are):

```json
"demo:data": "node scripts/build-demo-data.mjs",
"build:demo": "tsc -b && vite build --mode demo"
```

- [ ] **Step 4: Add a root convenience script**

In the root `package.json`, add one entry to `"scripts"`, next to the existing `"build:frontend"`:

```json
"build:demo:frontend": "npm run build:demo -w frontend"
```

- [ ] **Step 5: Verify the config loads**

Run: `cd frontend && npx vite build --mode demo 2>&1 | head -20`
Expected: Fails with an error about missing `frontend/scripts/build-demo-data.mjs`-produced files being referenced — actually, at this point `vite build` itself doesn't reference `demo-data` directly (that's a runtime fetch), so it should **succeed** and produce `frontend/dist` with asset URLs prefixed `/estuda-facil/`. Confirm by running:
`grep -o '/estuda-facil/[^"]*' frontend/dist/index.html | head -3`
Expected: prints at least one `/estuda-facil/assets/...` path.

- [ ] **Step 6: Commit**

```bash
git add frontend/vite.config.ts frontend/.env.demo frontend/package.json package.json
git commit -m "chore: add demo build mode (base path, env, npm scripts)"
```

---

### Task 5: Local demo-data generator script

**Files:**
- Create: `frontend/scripts/build-demo-data.mjs`

**Interfaces:**
- Consumes: on-disk content at `materias/calculo-1/.estuda/generated/topicos.json`, `materias/calculo-1/.estuda/generated/resumos/*.md`, `materias/calculo-1/.estuda/generated/quizzes/*.json`, `materias/calculo-1/.estuda/generated/insights.md`, `materias/calculo-1/.estuda/quiz-history.json`, `materias/calculo-1/.estuda/manifest.json`.
- Produces: `frontend/public/demo-data/subjects.json`, `frontend/public/demo-data/topics/calculo-1.json`, `frontend/public/demo-data/resumo/calculo-1/<topicId>.json`, `frontend/public/demo-data/quiz/calculo-1/<topicId>.json`, `frontend/public/demo-data/notes/calculo-1/<topicId>.json`, `frontend/public/demo-data/insights/calculo-1.json`, `frontend/public/demo-data/opencode-log/calculo-1.json` — these are exactly the shapes `api.static.ts` (Task 3) fetches.

- [ ] **Step 1: Write the script**

```js
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
```

- [ ] **Step 2: Run it against the real local content**

Run: `cd frontend && node scripts/build-demo-data.mjs`
Expected output: `Dados da demo gerados em frontend/public/demo-data`

- [ ] **Step 3: Verify the output**

Run: `find frontend/public/demo-data -type f | sort`
Expected: exactly these 7 files —
```
frontend/public/demo-data/insights/calculo-1.json
frontend/public/demo-data/notes/calculo-1/limites-e-continuidade.json
frontend/public/demo-data/notes/calculo-1/teste.json
frontend/public/demo-data/opencode-log/calculo-1.json
frontend/public/demo-data/quiz/calculo-1/limites-e-continuidade.json
frontend/public/demo-data/quiz/calculo-1/teste.json
frontend/public/demo-data/resumo/calculo-1/limites-e-continuidade.json
frontend/public/demo-data/resumo/calculo-1/teste.json
frontend/public/demo-data/subjects.json
frontend/public/demo-data/topics/calculo-1.json
```
Run: `cat frontend/public/demo-data/topics/calculo-1.json`
Expected: an array of 2 topics; the `limites-e-continuidade` entry has `"tentativas": 3`, `"acertoPct": 0`, `"status": "warn"`; the `teste` entry has `"tentativas": 0`, `"acertoPct": null`, `"status": "idle"`.

- [ ] **Step 4: Do not commit yet**

This output is `calculo-1`-specific content, not project structure — per Global Constraints, it's committed only in Task 9, on `example/calculo-1`. For now, leave it as an untracked directory (it won't affect `main`'s commits as long as later `git add` calls in this plan target specific paths, not `git add -A`).

---

### Task 6: Demo mode gating in the UI

**Files:**
- Modify: `frontend/src/components/StageHeader.tsx`
- Modify: `frontend/src/components/NewTopicModal.tsx`
- Modify: `frontend/src/components/NotesDrawer.tsx`

**Interfaces:**
- Consumes: `DEMO_MODE` from `../demoMode` (Task 3).
- Produces: nothing new for later tasks — this is leaf UI behavior.

- [ ] **Step 1: Disable "Atualizar matéria" in `StageHeader.tsx`**

Add the import at the top:

```ts
import { DEMO_MODE } from "../demoMode";
```

Replace the update button:

```tsx
        <button
          className="btn btn-primary"
          onClick={onUpdateClick}
          disabled={generating || DEMO_MODE}
          title={DEMO_MODE ? "Indisponível na demo — requer o backend local." : undefined}
        >
          {generating ? "Atualizando..." : "Atualizar matéria"}
        </button>
```

- [ ] **Step 2: Show a message instead of the form in `NewTopicModal.tsx`**

Add the import at the top:

```ts
import { DEMO_MODE } from "../demoMode";
```

Replace everything from `<div className="modal-header">` to the closing `</div>` of `modal-footer` with:

```tsx
        <div className="modal-header">
          <h3 id="topicModalTitle">Novo tópico</h3>
          <button className="icon-btn" aria-label="Fechar" onClick={onClose}>
            ✕
          </button>
        </div>
        {DEMO_MODE ? (
          <>
            <div className="modal-body">
              <p className="field-hint">Indisponível na demo estática — requer o backend local.</p>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={onClose}>
                Fechar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-body">
              <label className="field-label" htmlFor="topicNameInput">
                Nome do tópico
              </label>
              <input
                id="topicNameInput"
                className="field-input"
                type="text"
                placeholder="Ex.: Séries e Sequências"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoFocus
              />

              <label className="field-label" htmlFor="topicDescInput">
                Descrição <span className="field-optional">(opcional)</span>
              </label>
              <textarea
                id="topicDescInput"
                className="field-textarea"
                placeholder="Do que se trata? Ex.: convergência de séries, teste da razão, séries de potências…"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
              <p className="field-hint">Usada pela IA para encaixar automaticamente novos arquivos e questões neste tópico.</p>
              {error && <p className="field-hint" style={{ color: "var(--bad)" }}>{error}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={onClose}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!nome.trim() || saving}>
                {saving ? "Criando..." : "Criar tópico"}
              </button>
            </div>
          </>
        )}
```

- [ ] **Step 3: Disable the compose area in `NotesDrawer.tsx`**

Add the import at the top:

```ts
import { DEMO_MODE } from "../demoMode";
```

Replace the `<div className="notes-compose">` block:

```tsx
        <div className="notes-compose">
          <textarea
            className="notes-textarea"
            placeholder={
              DEMO_MODE
                ? "Indisponível na demo estática — requer o backend local."
                : "Escreva algo enquanto estuda este tópico…"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={DEMO_MODE}
          />
          <div className="notes-compose-actions">
            <span className="notes-hint">
              {DEMO_MODE ? "Anotações exigem o backend local." : "Fica salvo mesmo trocando de aba"}
            </span>
            <button className="btn btn-primary" onClick={handleSave} disabled={DEMO_MODE || !text.trim() || saving}>
              {savedFlash ? "Salvo" : "Salvar anotação"}
            </button>
          </div>
        </div>
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Full local demo build and manual walkthrough**

Run: `cd frontend && npm run build:demo`
Expected: Build succeeds, `frontend/dist` produced (this uses the `demo-data` generated in Task 5, still sitting untracked in `frontend/public/`).

Run: `cd frontend && npx vite preview --mode demo --port 4173`
Open `http://localhost:4173/estuda-facil/` in a browser and check, one by one:
- Dashboard for "Calculo 1" shows 2 topic cards (`Limites e Continuidade`, `teste`) and the two chart panels.
- "Atualizar matéria" button is disabled and shows the tooltip on hover.
- Clicking "+" (novo tópico) opens a modal showing the demo message, no input fields.
- Resumo tab for `Limites e Continuidade` renders the markdown content with a table of contents.
- Quiz tab lets you answer all 6 questions, shows correct/incorrect immediately and the explanation, and navigation between questions works.
- Insights tab shows the insights markdown and the progress numbers.
- Opening the "Anotações" drawer shows a disabled textarea and disabled save button.
- "Chat IA" tab shows the empty state ("Nenhuma conversa registrada...").

Stop the preview server after checking.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/StageHeader.tsx frontend/src/components/NewTopicModal.tsx frontend/src/components/NotesDrawer.tsx
git commit -m "feat: disable backend-only actions in demo mode"
```

---

### Task 7: GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: `npm run build:demo -w frontend` (Task 4) and the `frontend/public/demo-data/` committed in Task 9.
- Produces: nothing consumed elsewhere in this plan — this is the deploy entry point, exercised in Task 9.

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/deploy-pages.yml
name: Deploy demo to GitHub Pages

on:
  push:
    branches:
      - example/calculo-1

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build:demo -w frontend
      - uses: actions/upload-pages-artifact@v3
        with:
          path: frontend/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy-pages.yml'))" || node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/deploy-pages.yml','utf-8'))"`
Expected: No output/no error (either interpreter works — this just checks the file parses as valid YAML; if neither `python3` nor a `yaml` npm package is available, visually re-check indentation instead, since GitHub will reject silently-broken YAML with a workflow parse error visible under the Actions tab).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-pages.yml
git commit -m "ci: add GitHub Pages deploy workflow for the static demo"
```

---

### Task 8: Merge review checkpoint on `main`

**Files:** none (verification-only task)

**Interfaces:** none.

- [ ] **Step 1: Confirm `main` builds clean end-to-end**

Run: `cd backend && npx tsc -p tsconfig.json --noEmit && cd ../frontend && npx tsc -b --noEmit`
Expected: No errors in either workspace.

- [ ] **Step 2: Confirm the live app still fully works**

Run backend (`cd backend && npm run dev`) and frontend (`cd frontend && npm run dev`) together, open `http://localhost:5173`, and confirm the normal (non-demo) flow still works end to end: pick a subject, open a topic, view resumo/quiz/insights. This is the regression check for everything touched in Tasks 2–6.

- [ ] **Step 3: Push `main`**

```bash
git push origin main
```

---

### Task 9: Deploy — merge into `example/calculo-1`, generate demo data, publish

**Files:**
- Create (on `example/calculo-1` only): `frontend/public/demo-data/**` (the 10 files produced by Task 5's script)

**Interfaces:** none — this is the release task.

- [ ] **Step 1: Merge `main` into `example/calculo-1`**

```bash
git checkout example/calculo-1
git merge main --ff-only
```

Expected: fast-forward merge succeeds (per Global Constraints, `example/calculo-1` has only ever had one commit on top of the `main` history this plan built on).

- [ ] **Step 2: Generate the demo data on this branch**

```bash
cd frontend && node scripts/build-demo-data.mjs && cd ..
```

Expected: same output as Task 5, Step 2/3 (now running with `materias/calculo-1/.estuda/` actually present in the `example/calculo-1` working tree).

- [ ] **Step 3: Commit the demo data**

```bash
git add frontend/public/demo-data
git commit -m "content: add static demo data for calculo-1"
```

- [ ] **Step 4: Enable GitHub Pages (Actions source), if not already enabled**

Run: `gh api repos/filipeds/estuda-facil/pages -X POST -f build_type=workflow 2>&1 || gh api repos/filipeds/estuda-facil/pages -X PUT -f build_type=workflow`
Expected: One of the two succeeds (`POST` if Pages was never configured, `PUT` if it exists already) — either way, `gh api repos/filipeds/estuda-facil/pages` afterwards should show `"build_type": "workflow"`.

- [ ] **Step 5: Push and watch the deploy**

```bash
git push origin example/calculo-1
gh run watch --repo filipeds/estuda-facil
```

Expected: The `Deploy demo to GitHub Pages` run completes with success.

- [ ] **Step 6: Verify the live site**

Run: `gh api repos/filipeds/estuda-facil/pages -q .html_url`
Open the printed URL (should be `https://filipeds.github.io/estuda-facil/`) and repeat the checklist from Task 6, Step 5 against the real deployed site instead of the local preview.

- [ ] **Step 7: Switch back to `main`**

```bash
git checkout main
```

---

## Self-Review Notes

- Spec coverage: build-time data generation (§1) → Task 5; static API client (§2) → Tasks 1, 3; base path (§3) → Task 4; disabled UI (§4) → Task 6; deploy workflow (§5) → Task 7; branching (Branching section) → Tasks 8–9. All spec sections map to a task.
- Fixed a gap the spec itself had: §3's original `build:demo` definition chained `build-demo-data.mjs && vite build`, which would break CI (the script needs source files that don't exist there). Task 4 splits this into `demo:data` (local-only) and `build:demo` (`tsc -b && vite build --mode demo`, CI-safe) — consistent with §1's later revision that the script never runs in CI. Worth a one-line note back to the spec file, but not worth re-blocking on approval since it only tightens an already-agreed decision.
- Type consistency checked: `ApiClient` (Task 1) is the single source of truth for method signatures; `api.live.ts` (Task 2), `api.static.ts` (Task 3), and every component's usage (unchanged) all key off it. `StreamGenerate`/`StreamOpencodeLog` likewise flow from Task 1 through Task 3 into the same call sites components already use.
