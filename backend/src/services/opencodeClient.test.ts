import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJsonArray, withRetry } from "./opencodeClient.js";

test("extractJsonArray returns a bare JSON array unchanged", () => {
  const text = "```json\n[{\"id\":\"a\"},{\"id\":\"b\"}]\n```";
  assert.deepEqual(extractJsonArray<{ id: string }>(text), [{ id: "a" }, { id: "b" }]);
});

test("extractJsonArray unwraps a single array-valued property", () => {
  const text = '```json\n{"questoes": [{"id": "q1"}]}\n```';
  assert.deepEqual(extractJsonArray<{ id: string }>(text), [{ id: "q1" }]);
});

test("extractJsonArray unwraps the object-array when a sibling empty array is also present", () => {
  // Reproduces the real opencode response that crashed updateTopics with
  // "suggested is not iterable": the model wrapped the topic list under
  // "topicos" and echoed back "arquivos_removidos" as a second array.
  const text = `\`\`\`json
{
  "topicos": [{ "id": "sistemas-de-cores", "nome": "Sistemas de Cores" }],
  "arquivos_removidos": []
}
\`\`\``;
  assert.deepEqual(extractJsonArray<{ id: string; nome: string }>(text), [
    { id: "sistemas-de-cores", nome: "Sistemas de Cores" },
  ]);
});

test("extractJsonArray throws a clear error when no array can be found", () => {
  const text = '```json\n{"foo": "bar"}\n```';
  assert.throws(() => extractJsonArray(text), /não continha a lista esperada/);
});

test("withRetry returns the result immediately on first success without retrying", async () => {
  let calls = 0;
  const result = await withRetry(3, async () => {
    calls += 1;
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("withRetry retries after a failure and returns the result once it succeeds", async () => {
  let calls = 0;
  const result = await withRetry(3, async () => {
    calls += 1;
    if (calls < 2) throw new Error("flaky model output");
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(calls, 2);
});

test("withRetry throws the last error after exhausting all attempts", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(3, async () => {
      calls += 1;
      throw new Error(`attempt ${calls} failed`);
    }),
    /attempt 3 failed/,
  );
  assert.equal(calls, 3);
});
