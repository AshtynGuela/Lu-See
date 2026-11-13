import { test } from "node:test";
import assert from "node:assert/strict";
import { answerQuestion } from "../server/assistant.mjs";
const dependencies = {
  sites: [],
  loadData: async () => {
    throw Error("No science fixture requested");
  },
  loadTerrain: async () => null,
  signal: AbortSignal.timeout(5000),
};
test("visual request never reaches the text-only fallback", async () => {
  const previous = globalThis.fetch,
    or = process.env.OPENROUTER_API_KEY,
    g = process.env.GROQ_API_KEY,
    calls = [];
  process.env.OPENROUTER_API_KEY = "test-only";
  process.env.GROQ_API_KEY = "test-only";
  try {
    globalThis.fetch = async (url) => {
      calls.push(url);
      throw Error("simulated upstream failure in test");
    };
    await assert.rejects(
      () =>
        answerQuestion(
          {
            question: "Explain this map",
            image: "data:image/jpeg;base64,AAAA",
          },
          dependencies,
        ),
      /pending/,
    );
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes("openrouter.ai"));
  } finally {
    globalThis.fetch = previous;
    if (or === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = or;
    if (g === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = g;
  }
});
test("text-only request may fall back and must still pass answer validation", async () => {
  const previous = globalThis.fetch,
    or = process.env.OPENROUTER_API_KEY,
    g = process.env.GROQ_API_KEY,
    calls = [];
  process.env.OPENROUTER_API_KEY = "test-only";
  process.env.GROQ_API_KEY = "test-only";
  try {
    globalThis.fetch = async (url) => {
      calls.push(url);
      if (url.includes("openrouter.ai")) throw Error("test primary failure");
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({
                  speech: "Let us explore the Moon.",
                  details: "Choose a site to inspect its conditions.",
                  evidenceIds: [],
                  actions: [],
                }),
              },
            },
          ],
        }),
      };
    };
    const answer = await answerQuestion(
      { question: "How do I begin?" },
      dependencies,
    );
    assert.ok(answer.model.includes("GPT-OSS"));
    assert.equal(calls.length, 2);
    assert.equal(answer.evidence.length, 0);
  } finally {
    globalThis.fetch = previous;
    if (or === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = or;
    if (g === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = g;
  }
});
