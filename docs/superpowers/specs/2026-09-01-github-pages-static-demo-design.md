# Demo estática do Estuda Fácil no GitHub Pages

## Contexto

O Estuda Fácil é feito para rodar localmente: o backend (Fastify) grava e lê
arquivos em `materias/` e chama o CLI `opencode` instalado na máquina via
`child_process.spawn` para gerar tópicos, resumos, quizzes e insights. Não há
banco de dados nem chave de API própria — tudo depende de infraestrutura
local.

Para deixar as pessoas navegarem pelo app sem instalar nada, vamos publicar
uma versão somente-leitura (com uma exceção: responder quiz) no GitHub Pages,
usando o conteúdo já gerado da matéria de exemplo (`calculo-1`). Não haverá
backend nenhum — GitHub Pages só serve arquivos estáticos.

## Objetivo

Publicar em `https://filipeds.github.io/estuda-facil/` uma build do frontend
que:
- Mostra a matéria `calculo-1` com os tópicos, resumos, quiz e insights já
  gerados, sem precisar de um servidor.
- Permite responder o quiz de verdade (conferência e pontuação no navegador),
  sem persistir nada — o progresso reseta ao recarregar a página.
- Desabilita, com uma mensagem explicativa, as ações que exigem backend real:
  "Atualizar matéria", criar tópico e salvar anotação.

Fora do escopo: qualquer chamada real ao `opencode`, persistência de dados
entre sessões, suporte a outras matérias além de `calculo-1`, testes
automatizados novos (o projeto não tem suite hoje).

## Arquitetura

### 1. Geração dos dados estáticos (ferramenta local, não roda no CI)

`materias/calculo-1/.estuda/` é ignorado pelo git (decisão de sessões
anteriores: conteúdo gerado não é versionado). Isso significa que o checkout
do GitHub Actions nunca terá esses arquivos-fonte disponíveis — então gerar
os dados estáticos não pode ser um passo de CI.

Em vez disso, `frontend/scripts/build-demo-data.mjs` é uma ferramenta que
roda localmente (por quem estiver atualizando a demo) sempre que o conteúdo
de `calculo-1` mudar. O **resultado** dela (`frontend/public/demo-data/`) é
commitado normalmente na branch `example/calculo-1`, como um artefato de
dados da demo — não é gerado nem regenerado durante o build do CI. Ele lê:
- `materias/calculo-1/.estuda/generated/topicos.json`
- `materias/calculo-1/.estuda/quiz-history.json`
- `materias/calculo-1/.estuda/manifest.json`
- `materias/calculo-1/.estuda/generated/resumos/*.md`
- `materias/calculo-1/.estuda/generated/quizzes/*.json`
- `materias/calculo-1/.estuda/generated/insights.md`

E reproduz os mesmos cálculos hoje feitos em
`backend/src/routes/subjects.ts` e `backend/src/services/aiPipeline.ts`
(`topicStatus`, `computeTopicStats`, agregações de `maisEstudados` /
`maisMencionados` / `progress`) — a lógica é pequena e estável o bastante
para ser duplicada aqui sem acoplar o script ao workspace do backend.

Saída em `frontend/public/demo-data/`:
- `subjects.json` — `SubjectSummary[]`
- `topics/calculo-1.json` — `Topic[]` já com `tentativas`/`acertoPct`/`status`
- `resumo/calculo-1/<topicId>.json` — `ResumoResponse`
- `quiz/calculo-1/<topicId>.json` — `QuizQuestion[]`
- `insights/calculo-1.json` — `InsightsResponse`
- `notes/calculo-1/<topicId>.json` — `[]` (nenhuma anotação na demo)
- `opencode-log/calculo-1.json` — `[]` (nenhum registro na demo)

### 2. Cliente de API estático

`frontend/src/api.ts` atual é renomeado para `frontend/src/api.live.ts`
(comportamento inalterado). Novo `frontend/src/api.static.ts` implementa a
mesma forma (`api.listSubjects`, `api.listTopics`, etc., mais
`streamGenerate`/`streamOpencodeLog`), mas:
- Leituras (`GET`) fazem `fetch` nos arquivos de `public/demo-data/`.
- `submitAttempt` confere a resposta contra o `respostaCorreta` já presente
  no JSON do quiz e atualiza estatísticas em memória (React state), sem
  chamar rede — não precisa de endpoint.
- `createTopic` e `addNote` rejeitam a promise com uma mensagem fixa
  ("Indisponível na demo estática — requer o backend local."), que os
  componentes já sabem exibir (mesmo caminho de erro usado hoje).
- `streamGenerate` chama `onError` imediatamente com a mesma mensagem, sem
  abrir EventSource nenhum.
- `streamOpencodeLog` não faz nada (retorna um no-op de cleanup) — a aba
  "Chat IA" mostra o estado vazio já existente no componente.

`frontend/src/api.ts` passa a ser um switch de duas linhas:
`import.meta.env.VITE_DEMO_MODE === "true"` reexporta de `api.static.ts`,
senão de `api.live.ts`. Nenhum componente muda.

### 3. Build e caminho base

`vite.config.ts` passa `base: '/estuda-facil/'` quando `mode === 'demo'`
(GitHub Pages serve o projeto num subpath, não na raiz). Novo script no
`frontend/package.json`:
```
"build:demo": "node scripts/build-demo-data.mjs && vite build --mode demo"
```
O modo `demo` do Vite injeta `VITE_DEMO_MODE=true` via um arquivo
`.env.demo` (`VITE_DEMO_MODE=true`). Esse script assume que
`frontend/public/demo-data/` já existe (commitado — ver seção 1); ele não
tenta regerá-lo.

### 4. UI: ações desabilitadas

`StageHeader` (botão "Atualizar matéria"), o botão/modal de novo tópico e o
`NotesDrawer` recebem uma prop/flag derivada de
`import.meta.env.VITE_DEMO_MODE` que:
- Desabilita o controle.
- Troca o texto por algo como "Indisponível na demo" (título/tooltip
  explicando que exige o backend local).

Não é necessário nenhum tratamento especial na aba "Chat IA": com o log
vazio vindo do `api.static.ts`, o componente já renderiza seu estado vazio
atual.

### 5. Deploy

Novo `.github/workflows/deploy-pages.yml`, disparado em push para a branch
`example/calculo-1` (é a branch que tem o código do app + o conteúdo de
`calculo-1`; ver "Branching" abaixo):
1. Checkout, setup Node, `npm ci` na raiz (workspaces).
2. `npm run build:demo -w frontend` — usa o `frontend/public/demo-data/` já
   commitado; não regenera nada.
3. Upload de `frontend/dist` como artefato de Pages.
4. `actions/deploy-pages` publica.

Configuração do repositório: "Settings → Pages → Source: GitHub Actions"
precisa ser ativada manualmente (via `gh api` ou pela UI) antes do primeiro
deploy funcionar — é uma mudança de configuração do repo, não de código.

## Branching

O recurso (script de build, `api.static.ts`, flag de UI, workflow) é
implementado em `main`, pois é capacidade genérica do frontend — não é
conteúdo específico de `calculo-1`. Depois, `main` é mesclado (fast-forward,
já que `example/calculo-1` só tem um commit de conteúdo em cima de `main`)
para dentro de `example/calculo-1`.

Só então, já em `example/calculo-1` (onde `materias/calculo-1/.estuda/`
existe localmente), o script de geração roda uma vez e seu resultado
(`frontend/public/demo-data/`) é commitado nessa branch, num commit
separado do merge — é conteúdo específico da demo, não pertence à `main`.
O workflow do GitHub Actions dispara a partir dessa branch e consome esse
artefato já commitado.

## Erros e limites conhecidos

- Progresso do quiz não persiste entre recarregamentos — comportamento
  aceito, não é um bug.
- Só a matéria `calculo-1` existe na demo; o seletor de matérias mostra só
  ela.
- Se alguém rodar `build-demo-data.mjs` localmente sem os arquivos gerados
  em `materias/calculo-1/.estuda/` (por exemplo, cache local apagado antes
  de gerar a demo), o script falha alto e explicitamente — não faz sentido
  sobrescrever `frontend/public/demo-data/` com dados vazios silenciosamente.
- O CI nunca roda esse script — só consome o `frontend/public/demo-data/`
  já commitado em `example/calculo-1`. Atualizar a demo exige rodar o script
  localmente e commitar a saída antes de dar push.

## Validação

Sem suite automatizada nova. Validação manual antes do primeiro deploy:
1. `npm run build:demo -w frontend` localmente.
2. Servir `frontend/dist` (`npx serve dist` ou `vite preview --mode demo`)
   simulando o subpath `/estuda-facil/`.
3. Navegar dashboard → resumo → quiz (responder e ver pontuação) → insights.
4. Confirmar que "Atualizar matéria", "Novo tópico" e "Salvar anotação"
   aparecem desabilitados com a mensagem correta.
