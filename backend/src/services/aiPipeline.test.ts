import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTopicSuggestions, parseQuizQuestions } from "./aiPipeline.js";

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
