/**
 * Reading a conversation back out of the file it was written to (TKT-0110).
 *
 * The file is the only record — there is no session store — so this parser is what stands
 * between "pick up where you left off" and starting again from nothing. It is tested
 * against what `appendTurn` actually writes, not against a shape invented here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readTranscript, conversationsIn } from "./src/transcript.js";
import { DEFAULT_FOLDERS } from "./src/folders.js";
import { appendTurn } from "./src/vault.js";

const HEADER = [
  "---",
  "uid: 20260819T130105",
  "type: source",
  "author: mixed",
  "---",
  "",
  "# Is it better to go by train",
  "",
  "> Captured automatically. A few minutes after this goes quiet it is read.",
  "",
  "",
].join("\n");

/** Built with the real writer, so the two can never drift apart unnoticed. */
async function written(turns) {
  let text = HEADER;
  const app = {
    vault: {
      getAbstractFileByPath: () => ({ path: "c.md" }),
      append: async (_file, addition) => { text += addition; },
    },
  };
  for (const [who, what] of turns) await appendTurn(app, "c.md", who, what, new Date(2026, 7, 19, 13, 1));
  return text;
}

test("a conversation comes back as the turns it was written from", async () => {
  const text = await written([["me", "is it better by train"], ["gemma3:4b", "Yes, because of the transfer."]]);
  assert.deepEqual(readTranscript(text), [
    { who: "me", role: "user", text: "is it better by train" },
    { who: "gemma3:4b", role: "assistant", text: "Yes, because of the transfer." },
  ]);
});

test("the header this plugin wrote is not mistaken for something somebody said", async () => {
  const turns = readTranscript(await written([["me", "hello"]]));
  assert.equal(turns.length, 1);
  assert.equal(turns[0].text, "hello");
});

test("an empty conversation is empty rather than broken", () => {
  assert.deepEqual(readTranscript(HEADER), []);
  assert.deepEqual(readTranscript(""), []);
  assert.deepEqual(readTranscript(null), []);
});

/**
 * The model label changes mid-conversation whenever a fallback chain moves, so the speaker
 * cannot be matched against a known name — only "me" is the person.
 */
test("a reply is a reply whichever model gave it", async () => {
  const text = await written([
    ["me", "first"], ["gemma3:4b", "one"],
    ["me", "second"], ["deepseek-chat", "two"],
  ]);
  assert.deepEqual(readTranscript(text).map((t) => t.role), ["user", "assistant", "user", "assistant"]);
});

/**
 * A failure is worth keeping in the transcript a person reads and worth leaving out of the
 * history a model is asked to continue from — it is a fact about a provider, not about the
 * subject.
 */
test("a recorded failure is not fed back to the model", async () => {
  const text = await written([["me", "hello"], ["error", "deepseek 402: insufficient balance"], ["gemma3:4b", "Hi."]]);
  const turns = readTranscript(text);
  assert.deepEqual(turns.map((t) => t.who), ["me", "gemma3:4b"]);
});

test("a multi-paragraph answer keeps its shape", async () => {
  const answer = "First paragraph.\n\n- a point\n- another\n\nLast word.";
  const text = await written([["me", "explain"], ["gemma3:4b", answer]]);
  assert.equal(readTranscript(text)[1].text, answer);
});

/**
 * The file is the interface between one sitting and the next, so a conversation somebody
 * edited by hand — or wrote themselves — has to load like any other.
 */
test("a conversation written by hand loads too", () => {
  const byHand = "# Notes\n\n**me** _(9:05)_\n\nwhat about buses\n\n**claude** _(9:06)_\n\nSlower.\n";
  assert.deepEqual(readTranscript(byHand), [
    { who: "me", role: "user", text: "what about buses" },
    { who: "claude", role: "assistant", text: "Slower." },
  ]);
});

test("bold text inside an answer is not read as a new speaker", async () => {
  const text = await written([["me", "hi"], ["gemma3:4b", "The **important** part is this.\n\n**Also** worth noting."]]);
  assert.equal(readTranscript(text).length, 2);
});

const vaultOf = (...paths) => ({
  vault: { getMarkdownFiles: () => paths.map(([path, mtime]) => ({ path, stat: { mtime } })) },
});

test("conversations are offered most recently touched first", () => {
  const app = vaultOf(
    ["Chats/2026/08/18/older.md", 100],
    ["Chats/2026/08/19/newer.md", 300],
    ["Notes/2026/08/a-note.md", 999],
  );
  assert.deepEqual(conversationsIn(app, "Chats").map((f) => f.path), [
    "Chats/2026/08/19/newer.md",
    "Chats/2026/08/18/older.md",
  ]);
});

/**
 * There were two answers to "where do conversations live" — this function's own default and
 * the shipped one — and they disagreed. Only the fact that every caller passes a root kept
 * that hidden, which is the kind of thing that surfaces the first time one does not.
 */
test("there is one answer to where conversations live", () => {
  const app = vaultOf([`${DEFAULT_FOLDERS.conversations}/2026/08/19/a-chat.md`, 1]);
  assert.equal(conversationsIn(app).length, 1, "the default matches the shipped default");
});
