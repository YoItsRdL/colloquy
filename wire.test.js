/**
 * The streaming parsers (TKT-0109).
 *
 * Three of them — one per wire format — and until now none had a test. They are the code
 * every reply passes through, and their failure mode is quiet: a mishandled record does
 * not throw, it silently drops a sentence from a note.
 *
 * Driven by a stubbed fetch, so the cases that matter can be produced deliberately:
 * records split across reads, a terminator, an error arriving after the stream opened,
 * and framing noise that must be ignored rather than fatal.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as openaiWire from "./src/providers/openai-wire.js";
import * as gemini from "./src/providers/gemini.js";
import * as anthropic from "./src/providers/anthropic.js";

const real = globalThis.fetch;
afterEach(() => { globalThis.fetch = real; });

/** A response whose body arrives in exactly the pieces given, as a network would. */
function serve(pieces, { ok = true, status = 200, body = "" } = {}) {
  globalThis.fetch = async () => ({
    ok,
    status,
    text: async () => body,
    json: async () => JSON.parse(body || "{}"),
    body: {
      getReader() {
        const chunks = [...pieces];
        return {
          read: async () => (chunks.length
            ? { done: false, value: new TextEncoder().encode(chunks.shift()) }
            : { done: true }),
          cancel: async () => {},
        };
      },
    },
  });
}

const collect = async (iterator) => {
  const out = [];
  for await (const chunk of iterator) out.push(chunk);
  return out;
};

const WIRE = { name: "test", base: "https://example.test/v1" };
const opts = { model: "m", key: "k", messages: [{ role: "user", text: "hi" }] };

beforeEach(() => { globalThis.fetch = real; });

// ── the OpenAI format, shared by three providers ────────────────────────────────
test("openai: chunks arrive in order", async () => {
  serve([
    'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
    "data: [DONE]\n\n",
  ]);
  assert.deepEqual(await collect(openaiWire.stream(WIRE, opts)), ["Hello", " there"]);
});

test("openai: a record split across two reads is not lost", async () => {
  // The case a hand-rolled parser gets wrong. A network splits wherever it likes, and a
  // half-record must be held rather than parsed or dropped.
  serve(['data: {"choices":[{"delta":{"con', 'tent":"split"}}]}\n\n', "data: [DONE]\n\n"]);
  assert.deepEqual(await collect(openaiWire.stream(WIRE, opts)), ["split"]);
});

test("openai: framing noise is skipped, not fatal", async () => {
  // Keepalives and comments appear mid-stream. Failing on one kills a stream that is fine.
  serve([
    ": keepalive\n\n",
    'data: {"choices":[{"delta":{}}]}\n\n',
    "data: not json\n\n",
    'data: {"choices":[{"delta":{"content":"survived"}}]}\n\n',
  ]);
  assert.deepEqual(await collect(openaiWire.stream(WIRE, opts)), ["survived"]);
});

test("openai: an error after the stream opens is raised, not swallowed", async () => {
  // It arrives in the body rather than the status line, so nothing else would notice.
  serve(['data: {"error":{"message":"upstream died"}}\n\n']);
  await assert.rejects(collect(openaiWire.stream(WIRE, opts)), /upstream died/);
});

test("openai: a refusal names the status and the machine-readable kind", async () => {
  serve([], { ok: false, status: 429, body: JSON.stringify({ error: { message: "no credit", type: "insufficient_quota" } }) });
  await assert.rejects(collect(openaiWire.stream(WIRE, opts)), /429.*insufficient_quota.*no credit/);
});

test("openai: a whole reply is read from a non-streamed response", async () => {
  serve([], { body: JSON.stringify({ choices: [{ message: { content: "whole" } }] }) });
  assert.equal(await openaiWire.complete(WIRE, opts), "whole");
});

test("openai: a reply with no content says why rather than returning nothing", async () => {
  serve([], { body: JSON.stringify({ choices: [{ finish_reason: "length" }] }) });
  await assert.rejects(openaiWire.complete(WIRE, opts), /length/);
});

// ── Gemini ──────────────────────────────────────────────────────────────────────
test("gemini: chunks arrive in order, across a split record", async () => {
  serve([
    'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n',
    'data: {"candidates":[{"content":{"par',
    'ts":[{"text":"lo"}]}}]}\n\n',
  ]);
  assert.deepEqual(await collect(gemini.stream(opts)), ["Hel", "lo"]);
});

test("gemini: a refusal carries the provider's own explanation", async () => {
  serve([], { ok: false, status: 429, body: JSON.stringify({ error: { message: "prepayment credits are depleted" } }) });
  await assert.rejects(collect(gemini.stream(opts)), /429.*depleted/);
});

// ── Anthropic ───────────────────────────────────────────────────────────────────
test("anthropic: only content deltas become text", async () => {
  // Most of its events carry no text at all. Treating them as content, or failing on
  // them, are the two ways this goes wrong.
  serve([
    'event: message_start\ndata: {"type":"message_start"}\n\n',
    'event: ping\ndata: {"type":"ping"}\n\n',
    'data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\n',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
  ]);
  assert.deepEqual(await collect(anthropic.stream(opts)), ["Hello"]);
});

test("anthropic: an error event mid-stream is raised", async () => {
  serve(['data: {"type":"error","error":{"message":"overloaded"}}\n\n']);
  await assert.rejects(collect(anthropic.stream(opts)), /overloaded/);
});
