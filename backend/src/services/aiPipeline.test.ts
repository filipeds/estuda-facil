import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTopicSuggestions, parseQuizQuestions, computeReviewUpdate, isDue } from "./aiPipeline.js";

test("parseTopicSuggestions accepts well-formed items and defaults optional fields", () => {
  const result = parseTopicSuggestions([
    { id: "sistemas-de-cores", nome: "Sistemas de Cores", origem: "ia" },
  ]);
  assert.deepEqual(result, [
    { id: "sistemas-de-cores", nome: "Sistemas de Cores", descricao: "", arquivos: [], origem: "ia" },
  ]);
});

test("parseTopicSuggestions drops a non-string id instead of crashing later in slugify", () => {
  // Reproduces the real opencode response that crashed updateTopics with
  // "text.toLowerCase is not a function": the model used a numeric id and a
  // "titulo" field instead of "nome" for some items, and a valid one for another.
  const result = parseTopicSuggestions([{ id: 1, nome: "Introdução à Computação Gráfica" }]);
  assert.equal(result[0].id, undefined);
  assert.equal(result[0].nome, "Introdução à Computação Gráfica");
});

test("parseTopicSuggestions throws a clear error when \"nome\" is missing", () => {
  // This is the actual malformed shape captured from the flaky free model:
  // { id: 1, titulo: "...", subtopicos: [...] } instead of { id, nome, descricao, arquivos }.
  assert.throws(
    () => parseTopicSuggestions([{ id: 1, titulo: "Introdução", subtopicos: ["a", "b"] }]),
    /não tem um "nome" válido/,
  );
});

test("parseQuizQuestions accepts well-formed items", () => {
  const result = parseQuizQuestions([
    {
      id: "q1",
      pergunta: "Quanto é 2+2?",
      opcoes: [
        { id: "a", texto: "3" },
        { id: "b", texto: "4" },
      ],
      respostaCorreta: "b",
      explicacao: "2+2=4",
    },
  ]);
  assert.deepEqual(result, [
    {
      id: "q1",
      pergunta: "Quanto é 2+2?",
      opcoes: [
        { id: "a", texto: "3" },
        { id: "b", texto: "4" },
      ],
      respostaCorreta: "b",
      explicacao: "2+2=4",
    },
  ]);
});

test("parseQuizQuestions throws a clear error when \"opcoes\" is missing or empty", () => {
  assert.throws(
    () => parseQuizQuestions([{ id: "q1", pergunta: "Quanto é 2+2?", opcoes: [], respostaCorreta: "b" }]),
    /não tem "opcoes" válidas/,
  );
});

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
