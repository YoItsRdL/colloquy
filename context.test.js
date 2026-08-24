/**
 * Where what we learned about ourselves is kept (ADR-0007).
 *
 * `60-log/conversations/`, beside the session log the vault already defines. These are
 * records of what happened, and filing them as knowledge would put statements about us in
 * the folder reserved for claims about the world.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeContext, recentContext, recordPath, stampOf } from "./src/context.js";

function fakeVault(seed = {}) {
  const files = new Map(Object.entries(seed));
  const folders = new Set();
  const fileFor = (p) => ({ path: p, basename: p.split("/").pop().replace(/\.md$/, ""), stat: { mtime: 0 } });

  const app = {
    vault: {
      getAbstractFileByPath: (p) => (files.has(p) ? fileFor(p) : (folders.has(p) ? { path: p } : null)),
      getMarkdownFiles: () => [...files.keys()].map(fileFor),
      createFolder: async (p) => { if (folders.has(p)) throw new Error("exists"); folders.add(p); },
      create: async (p, text) => { files.set(p, text); return fileFor(p); },
      modify: async (file, text) => files.set(file.path, text),
      // Obsidian reads and writes in one call, which is why the code prefers it.
      process: async (file, fn) => { files.set(file.path, fn(files.get(file.path) ?? "")); },
    },
  };
  return { app, files, folders };
}

const AUGUST_19 = new Date(2026, 7, 19, 14, 30);
/** One vault's folder, passed in like any other now that it is configurable (ADR-0010). */
const LOG = "60-log/conversations";
const SOURCE = "00-inbox/2026/08/19/local-model-claude-limitations.md";
const ACCOUNT = "We were weighing local models against Claude, mostly on cost.";

test("records are filed by day, in the log rather than the knowledge base", () => {
  assert.equal(recordPath(SOURCE, AUGUST_19, LOG).startsWith("60-log/conversations/2026/08/19/"), true);
  assert.equal(stampOf(AUGUST_19), "2026-08-19");
});

test("a record is named for its conversation, under the day it happened", () => {
  assert.equal(recordPath(SOURCE, AUGUST_19, LOG),
    "60-log/conversations/2026/08/19/local-model-claude-limitations.md");
});

test("what was noticed is written, with a link back to where it came from", async () => {
  const { app, files } = fakeVault();
  const path = await writeContext(app, { context: { lately: ACCOUNT, about: "" }, source: SOURCE, root: LOG }, AUGUST_19);

  assert.match(files.get(path), /^type: context$/m);
  assert.match(files.get(path), /^author: agent$/m);
  assert.match(files.get(path), /^created: 2026-08-19$/m);
  assert.match(files.get(path), /^source: "\[\[local-model-claude-limitations\]\]"$/m);
  assert.match(files.get(path), /We were weighing local models/);
});

/** Statements about us do not belong in the folder reserved for claims about the world. */
test("nothing is written to the knowledge base", async () => {
  const { app, files } = fakeVault();
  await writeContext(app, { context: { lately: ACCOUNT, about: "" }, source: SOURCE, root: LOG }, AUGUST_19);
  assert.equal([...files.keys()].some((p) => p.startsWith("10-notes/")), false);
});

test("a conversation with nothing to say about us leaves nothing behind", async () => {
  const { app, files } = fakeVault();
  assert.equal(await writeContext(app, { context: { lately: "", about: "" }, source: SOURCE, root: LOG }, AUGUST_19), null);
  assert.equal(files.size, 0);
});

/**
 * A conversation picked up a week later is still one thing that happened. Two half-accounts
 * of it would be worse than one whole one, so the second reading replaces the first.
 */
test("reading a conversation again replaces its record rather than adding another", async () => {
  const { app, files } = fakeVault();
  const first = await writeContext(app, { context: { lately: ACCOUNT, about: "" }, source: SOURCE, root: LOG }, AUGUST_19);

  const later = "We came back to it and settled on gemma3 for reading, qwen3 for answering.";
  const second = await writeContext(app, { context: { lately: later, about: "" }, source: SOURCE, root: LOG }, AUGUST_19);

  assert.equal(second, first, "the same record");
  assert.equal(files.size, 1);
  assert.match(files.get(second), /settled on gemma3/);
  assert.doesNotMatch(files.get(second), /weighing local models/, "and not both halves at once");
});

/** A record nothing ever reads back is a log with ambitions, not memory. */
test("what has been noticed can be read back, most recent first", () => {
  const { app } = fakeVault({
    "60-log/conversations/2026/08/18/older.md": "",
    "60-log/conversations/2026/08/19/newer.md": "",
    "10-notes/2026/08/a-note.md": "",
  });
  const found = recentContext(app, LOG);
  assert.equal(found.length, 2, "only the log, never the notes");
  assert.equal(found.every((f) => f.path.startsWith("60-log/conversations/")), true);
});

test("only so much is read back, however much has accumulated", () => {
  const seed = {};
  for (let i = 0; i < 30; i++) seed[`60-log/conversations/2026/08/${i}/talk.md`] = "";
  assert.equal(recentContext(fakeVault(seed).app, LOG).length, 12);
});

/**
 * The day of the conversation, not the day it was read. Those are the same thing only the
 * first time, and when they diverge the promise above (a record is replaced, not added to)
 * quietly becomes two records saying different things about one conversation.
 */
test("reading a conversation months later still writes to its own record", async () => {
  const { app, files } = fakeVault();
  const inAugust = await writeContext(app, { context: { lately: ACCOUNT, about: "" }, source: SOURCE, root: LOG }, AUGUST_19);

  const inDecember = new Date("2026-12-01T09:00:00");
  const later = await writeContext(app, { context: { lately: "We came back to it.", about: "" }, source: SOURCE, root: LOG }, inDecember);

  assert.equal(later, inAugust, "the same record, under the conversation's own day");
  assert.equal(files.size, 1, "and not a second one under December");
});

/** Somebody else's folder scheme has no date in it, and still gets one record per conversation. */
test("a conversation filed outside a date folder still gets one record", async () => {
  const { app } = fakeVault();
  const flat = "chats/is-it-better-by-train.md";

  const first = await writeContext(app, { context: { lately: ACCOUNT, about: "" }, source: flat, root: LOG }, AUGUST_19);
  const again = await writeContext(app, { context: { lately: ACCOUNT, about: "" }, source: flat, root: LOG }, AUGUST_19);

  assert.equal(again, first);
});
