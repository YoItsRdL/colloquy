/**
 * One exchange: ask, stream, record (ADR-0009).
 *
 * These assertions are mostly about what no longer happens. A turn used to walk a chain of
 * providers, classify each refusal, and offer to continue somewhere that charged; the point
 * of this file is that a failure is now a failure, reported in the words the provider used.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runTurn } from "./src/turn.js";

const streaming = (chunks) => ({
  provider: {
    name: "ollama",
    label: "Ollama",
    keyKind: "url",
    async *stream() {
      for (const chunk of chunks) {
        if (chunk instanceof Error) throw chunk;
        yield chunk;
      }
    },
  },
  model: "gemma3:4b",
  key: "http://localhost:11434/v1",
});

const session = (history = [{ role: "user", text: "hello" }]) => ({ history });

test("the answer arrives in pieces and is returned whole", async () => {
  const seen = [];
  const out = await runTurn(streaming(["Hel", "lo ", "there."]), session(), { onChunk: (c) => seen.push(c) });

  assert.equal(out.reply, "Hello there.");
  assert.equal(out.detail, null);
  assert.deepEqual(seen, ["Hel", "lo ", "there."]);
});

test("what answered is what was asked, because there is nothing else it could be", async () => {
  const config = streaming(["hi"]);
  assert.equal((await runTurn(config, session())).answered, config);
});

/**
 * The whole of the change. There is no second provider to try, no verdict to record, and
 * nothing to offer — the provider said why, and that is what reaches the person.
 */
test("a refusal is reported in the provider's own words and goes no further", async () => {
  const out = await runTurn(streaming([new Error("deepseek 402: insufficient balance")]), session());

  assert.equal(out.detail, "deepseek 402: insufficient balance");
  assert.equal(out.answered, null);
  assert.equal(out.options, undefined, "nothing is offered instead");
});

/**
 * Whatever arrived before a stream broke is still what the model said, and it is usually
 * the most useful thing on screen when something has gone wrong.
 */
test("a partial answer survives the failure that interrupted it", async () => {
  const out = await runTurn(streaming(["The first half ", new Error("connection reset")]), session());

  assert.equal(out.reply, "The first half ");
  assert.match(out.detail, /connection reset/);
});

/**
 * "Failed to fetch" is what a browser says when a request produced nothing readable — no
 * connection, a blocked origin, or a refusal without the headers to read it. Three words
 * naming none of them, written into a note somebody re-reads weeks later.
 *
 * For a provider hosted on your own machine there is a likeliest cause worth naming, and
 * the address is worth printing: a server that is running means the address is wrong.
 */
test("a local provider that answers nothing is reported as not running", async () => {
  const out = await runTurn(streaming([new Error("Failed to fetch")]), session());

  assert.match(out.detail, /Ollama is not answering/);
  assert.match(out.detail, /http:\/\/localhost:11434\/v1/, "the address, so a wrong one is visible");
  assert.match(out.detail, /not running/);
});

/**
 * A hosted provider is not something anyone can go and start, so the same failure there
 * has no likeliest cause worth asserting.
 */
test("a metered provider that answers nothing is not diagnosed", async () => {
  const remote = streaming([new Error("Failed to fetch")]);
  remote.provider.name = "anthropic";
  remote.provider.label = "Claude";
  remote.provider.keyKind = "secret";

  const out = await runTurn(remote, session());

  assert.match(out.detail, /Claude/);
  assert.match(out.detail, /usually no connection/, "the possibilities, not a guess between them");
  assert.doesNotMatch(out.detail, /not running/);
});

/**
 * Stopping is not failing. The person asked for it, so there is nothing to report — and
 * what arrived before they stopped is the answer, because it is what the model said.
 */
test("a turn the person stopped keeps what arrived and reports no error", async () => {
  const control = new AbortController();
  const config = {
    provider: {
      name: "ollama",
      async *stream() {
        yield "The first half ";
        control.abort();
        throw new DOMException("Aborted", "AbortError");
      },
    },
    model: "gemma3:4b",
    key: "k",
  };

  const out = await runTurn(config, session(), {}, control.signal);
  assert.equal(out.reply, "The first half ");
  assert.equal(out.stopped, true);
  assert.equal(out.detail, null, "nothing to apologise for");
  assert.equal(out.answered, config, "and it still counts as the model having answered");
});

test("a failure that happens to coincide with no abort is still a failure", async () => {
  const out = await runTurn(streaming([new Error("connection reset")]), session(), {}, new AbortController().signal);
  assert.equal(out.stopped, false);
  assert.match(out.detail, /connection reset/);
});

test("an adapter that cannot stream is asked for the whole reply instead", async () => {
  const config = { provider: { name: "x", complete: async () => "all at once" }, model: "m", key: "k" };
  assert.equal((await runTurn(config, session())).reply, "all at once");
});

/**
 * Background rides in front of the conversation rather than inside it, so it is sent once
 * and never reaches the transcript.
 */
test("remembered context is sent ahead of the conversation, not merged into it", async () => {
  let sent;
  const config = {
    provider: { name: "x", complete: async ({ messages }) => { sent = messages; return "ok" } },
    model: "m",
    key: "k",
  };
  const s = { history: [{ role: "user", text: "what did we decide?" }], context: "We were comparing models." };

  await runTurn(config, s);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].text, "We were comparing models.");
  assert.equal(s.history.length, 1, "and the history it was sent with is untouched");
});

test("a conversation with no background sends exactly what was said", async () => {
  let sent;
  const config = {
    provider: { name: "x", complete: async ({ messages }) => { sent = messages; return "ok" } },
    model: "m",
    key: "k",
  };
  const s = session();

  await runTurn(config, s);
  assert.equal(sent, s.history);
});
