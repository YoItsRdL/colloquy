/**
 * Naming a conversation after the fact (TKT-0107).
 *
 * The rules that matter are the refusals. A model asked for a title will sometimes return
 * a sentence, an apology, its own reasoning, or the word "Title:" followed by one — and a
 * wrong name is worse than the plain one already on the file, because the plain one at
 * least says what was asked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, slugFrom, proposeTitle } from "./src/title.js";

test("a plain title is taken as it is", () => {
  assert.equal(cleanTitle("How hash tables work"), "How hash tables work");
});

test("the decoration models add is stripped", () => {
  assert.equal(cleanTitle('"How hash tables work"'), "How hash tables work");
  assert.equal(cleanTitle("Title: How hash tables work"), "How hash tables work");
  assert.equal(cleanTitle("How hash tables work."), "How hash tables work");
  assert.equal(cleanTitle("  How hash tables work  "), "How hash tables work");
});

test("a reasoning model's working is discarded, not titled", () => {
  // qwen3 emits its deliberation. Titling a note with a model thinking aloud is the same
  // failure as letting that monologue into the reply.
  assert.equal(cleanTitle("<think>They want something short</think>\nHash table basics"), "Hash table basics");
});

test("only the first line is a title", () => {
  assert.equal(cleanTitle("Hash table basics\n\nI chose this because it is concise."), "Hash table basics");
});

test("a sentence is refused rather than truncated", () => {
  // Cutting it would produce a name that reads like a bug. Keeping the plain one is
  // honest, and the plain one already says what was asked.
  assert.equal(cleanTitle("This conversation is about how hash tables achieve constant time lookup"), null);
});

test("a model narrating instead of answering is refused", () => {
  for (const said of ["I'm sorry, I can't", "Sure! Here it is", "Here is a title", "Certainly"]) {
    assert.equal(cleanTitle(said), null, said);
  }
});

test("nothing is not a title", () => {
  for (const said of ["", "   ", null, undefined, "\n\n"]) assert.equal(cleanTitle(said), null);
});

test("a slug is safe on any filesystem", () => {
  assert.equal(slugFrom("How hash tables work"), "how-hash-tables-work");
  assert.equal(slugFrom("C++ vs Rust: which?"), "c-vs-rust-which");
  assert.equal(slugFrom("¿Qué es esto?"), "qu-es-esto");
  assert.equal(slugFrom("!!!"), null, "punctuation alone leaves nothing to name it");
});

test("the model that answered is the one asked, and only the first exchange", async () => {
  let sawModel = null;
  let sawPrompt = "";
  const candidate = {
    model: "the-one-that-answered",
    key: "k",
    provider: { complete: async ({ model, messages }) => { sawModel = model; sawPrompt = messages[0].text; return "Hash table basics"; } },
  };
  const history = [
    { role: "user", text: "what is a hash table" },
    { role: "assistant", text: "A data structure..." },
    { role: "user", text: "and a trie?" },
  ];

  assert.equal(await proposeTitle(candidate, history), "Hash table basics");
  assert.equal(sawModel, "the-one-that-answered", "not the configured one, the answering one");
  assert.ok(!sawPrompt.includes("and a trie?"), "the later turns cost tokens and add nothing");
});

test("a failed request leaves the conversation named as it was", async () => {
  // This runs after the answer is already on disk. Nothing here is worth losing a turn.
  const candidate = { model: "m", key: "k", provider: { complete: async () => { throw new Error("no"); } } };
  assert.equal(await proposeTitle(candidate, [{ role: "user", text: "hi" }]), null);
});

test("a provider that cannot complete is not asked", async () => {
  assert.equal(await proposeTitle({ model: "m", provider: {} }, []), null);
  assert.equal(await proposeTitle(null, []), null);
});
