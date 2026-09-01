# Estuda Fácil

Sistema local de estudos: alimente `materias/<nome-da-materia>/` com aulas (`.md`/`.pdf`),
atividades e anotações, e a IA (via [opencode](https://opencode.ai), rodando localmente)
organiza tudo em tópicos, gera resumos, quizzes e insights — sob demanda, quando você
clicar em "Atualizar matéria".

## Demo pública

Uma versão somente-leitura (exceto o quiz, que funciona de verdade no navegador)
roda em <https://filipeds.github.io/estuda-facil/>, publicada a partir da
branch `example/calculo-1` sempre que ela recebe um push. Não há backend: os
dados vêm de JSON estático gerado localmente. "Atualizar matéria", criar
tópico e salvar anotação ficam desabilitados, com uma mensagem explicando o
motivo.

Para atualizar a demo depois de mudar o conteúdo de `materias/calculo-1`:

```
git checkout example/calculo-1
git merge main          # traz mudanças de código/config feitas em main
cd frontend && node scripts/build-demo-data.mjs && cd ..
git add frontend/public/demo-data
git commit -m "content: refresh calculo-1 demo data"
git push origin example/calculo-1   # dispara o deploy
```

## Estrutura

```
estuda-facil/
├── backend/            # API local (Fastify + TypeScript)
├── frontend/            # Interface (React + Vite)
└── materias/
    └── calculo-1/        # uma pasta por matéria — a "base de conhecimento"
        ├── aulas/         # anotações de aula, .md ou .pdf
        ├── atividades/     # listas de exercícios, .md ou .pdf
        ├── anotacoes/      # gerado pelo app — suas anotações por tópico
        └── .estuda/        # gerado pelo app — tópicos, resumos, quizzes, insights
```

Para adicionar uma nova matéria, basta criar `materias/<slug>/aulas/` e
`materias/<slug>/atividades/` com arquivos dentro, e abrir o app — ela aparece
sozinha na barra lateral. Nada é hardcoded por matéria.

## Configuração inicial

1. Instale o [opencode](https://opencode.ai) e confirme que o comando `opencode`
   está no PATH (`opencode --version`). O app chama o CLI localmente instalado —
   não depende de nenhuma chave de API própria.
2. Instale as dependências:
   ```
   cd backend && npm install
   cd ../frontend && npm install
   ```
3. (Opcional) Copie `.env.example` para `.env` na raiz do projeto se quiser
   fixar um modelo específico via `OPENCODE_MODEL` (formato `provider/model`).
   Sem isso, o opencode usa seu modelo padrão configurado.

## Rodando

Em dois terminais separados:

```
cd backend && npm run dev     # API em http://localhost:3333
cd frontend && npm run dev    # interface em http://localhost:5173
```

Abra `http://localhost:5173`. Uma matéria de exemplo (`Cálculo 1`) já vem com
uma aula e uma lista de exercícios — clique em "Atualizar matéria" para ver a
IA gerar os primeiros tópicos, resumos e quiz a partir desses arquivos.

> Se editar arquivos do backend e o servidor não parecer refletir a mudança,
> pare o processo (`Ctrl+C`) e rode `npm run dev` de novo — em alguns
> ambientes Windows o watch mode do `tsx` não detecta certas edições.

## Como funciona o pipeline de IA

Ao clicar em "Atualizar matéria":

1. Escaneia `aulas/`, `atividades/` e `anotacoes/`, comparando hashes com o
   último processamento (só reprocessa o que mudou).
2. PDFs são convertidos para texto e cacheados.
3. A IA atualiza a árvore de tópicos — tópicos criados manualmente (o botão
   "+" na barra lateral) nunca são apagados ou renomeados por ela.
4. Para tópicos afetados, gera resumo (Markdown) e quiz (JSON).
5. Gera insights da matéria (pontos fracos, conexões entre tópicos) usando o
   histórico de respostas do quiz.

Todo o conteúdo gerado fica em `materias/<matéria>/.estuda/generated/` —
arquivos de texto simples, versionáveis, que você pode inspecionar ou editar
à mão se quiser.

## Anotações

O botão "Anotações" (aba flutuante à direita) salva o que você escreve em
`materias/<matéria>/anotacoes/<topico>.md`, uma seção `##` com timestamp por
entrada, mais recente primeiro. Esses arquivos também entram no pipeline da
IA como mais uma fonte de conteúdo.

## Notas de implementação

- Sem banco de dados: histórico de quiz fica em
  `materias/<matéria>/.estuda/quiz-history.json` — simples de inspecionar e
  sem dependência nativa (evita problemas de build do `better-sqlite3` no
  Windows sem Visual Studio Build Tools).
- Sem Tailwind: o frontend reaproveita o sistema de design (cores, tipografia,
  layout) definido em `frontend/src/styles.css`, com suporte a tema
  claro/escuro via `prefers-color-scheme` e um toggle manual.
