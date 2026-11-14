import { test } from "node:test";
import assert from "node:assert/strict";
import { answerQuestion, materializeAnswer, groundExactFactCopies } from "../server/assistant.mjs";
test("evidence units are inserted once and ungrounded numbers remain rejected",()=>{
  const facts=[{id:"f1",value:"150",unit:"%"},{id:"f2",value:"3",unit:"h"}];
  const result=materializeAnswer({speech:"Rocky will resize to {{f1}} percent.",details:"{{f2}} hours more sunlight.",evidenceIds:["f1","f2"],actions:[]},facts);
  assert.equal(result.speech,"Rocky will resize to 150 %.");
  assert.equal(result.details,"3 h more sunlight.");
  assert.throws(()=>materializeAnswer({...result,speech:"Try 800 hours"},facts),/placeholders/);
  const scienceFacts=[{id:"f1",value:"Apollo 12",unit:""},{id:"f2",value:"24.00",unit:"h"}];
  const repaired=materializeAnswer(groundExactFactCopies({speech:"Apollo 12 gives 24.00 hours.",details:"",evidenceIds:[],actions:[]},scienceFacts),scienceFacts);
  assert.equal(repaired.speech,"Apollo 12 gives 24.00 h.");
  assert.deepEqual(repaired.evidenceIds,["f1","f2"]);
  assert.equal(materializeAnswer(groundExactFactCopies({speech:"24‑hour contact",details:"",evidenceIds:[],actions:[]},scienceFacts),scienceFacts).speech,"24.00 h contact");
  assert.throws(()=>materializeAnswer(groundExactFactCopies({speech:"Try 24.001 hours",details:"",evidenceIds:[],actions:[]},scienceFacts),scienceFacts),/placeholders/);
});
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
    globalThis.fetch = async (url, request) => {
      calls.push(url);
      if (url.includes("openrouter.ai")) throw Error("test primary failure");
      const body = JSON.parse(request.body);
      assert.equal(body.tools, undefined);
      assert.deepEqual(body.response_format, { type: "json_object" });
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
