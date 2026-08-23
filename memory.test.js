/**
 * Handing back what earlier conversations noticed (ADR-0008).
 *
 * The assertions are about restraint. This is the only place vault content is sent to a
 * provider without the person having typed it, so what goes and what does not is the whole
 * of the design, and it must cost nothing at all in a vault that has none.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { recall, attachMemory } from "./src/memory.js";

const record = (body) => `---\ntype: context\nauthor: agent\n---\n\n${body}\n`;

function fakeVault(seed = {}) {
  const files = new Map(Object.entries(seed));
  let mtime = 0;
  const fileFor = (p) => ({ path: p, basename: p.split("/").pop(), stat: { mtime: mtime++ } });
  return {
    vault: {
      getMarkdownFiles: () => [...files.keys()].map(fileFor),
      read: async (file) => files.get(file.path) ?? "",
    },
  };
}

const LOG = "60-log/conversations";
const RECENT = `${LOG}/2026/08/19-trains.md`;

test("what was noticed comes back as background", async () => {
  const app = fakeVault({ [RECENT]: record("We were choosing between the train and the coach.") });
  const block = await recall(app, { root: LOG });
  assert.match(block, /We were choosing between the train and the coach\./);
});

/**
 * These records are a small model's reading of a conversation, and a reading can be skewed.
 * The one thing a wrong record must never do is arrive with the authority of something we
 * actually said.
 */
test("it is offered as a hint, never as instruction", async () => {
  const app = fakeVault({ [RECENT]: record("We were choosing between the train and the coach.") });
  const block = await recall(app, { root: LOG });
  assert.match(block, /may be wrong/i);
  assert.match(block, /hint\s+rather than fact/i);
  assert.match(block, /Do not repeat it back/i);
});

test("the frontmatter this plugin wrote is not sent with it", async () => {
  const app = fakeVault({ [RECENT]: record("We were choosing between train and coach.") });
  const block = await recall(app, { root: LOG });
  assert.doesNotMatch(block, /type: context/);
  assert.doesNotMatch(block, /author: agent/);
});

/** A vault with nothing noticed yet must cost nothing, no block, no request, no tokens. */
test("an empty vault sends nothing at all", async () => {
  assert.equal(await recall(fakeVault(), { root: LOG }), null);
  assert.equal(await recall(fakeVault({ [RECENT]: record("") }), { root: LOG }), null, "and neither does an empty record");
});

test("only the log is read back, never the notes", async () => {
  const app = fakeVault({
    [RECENT]: record("We were choosing between train and coach."),
    "10-notes/2026/08/a-claim.md": record("Trains beat buses."),
  });
  const block = await recall(app, { root: LOG });
  assert.doesNotMatch(block, /Trains beat buses/);
});

test("the most recent are the ones that come back", async () => {
  const seed = {};
  for (let i = 0; i < 20; i++) seed[`60-log/conversations/2026/08/${i}-talk.md`] = record(`We did thing ${i}.`);
  const block = await recall(fakeVault(seed), { root: LOG, limit: 3 });
  assert.equal(block.match(/^- /gm).length, 3);
});

/**
 * Whole records only. Half an account read back is worse than one fewer account, because
 * the half that survives reads as the whole of what we thought.
 */
test("a budget drops whole records rather than cutting one in half", async () => {
  const long = "We ".concat("talked ".repeat(80));
  const app = fakeVault({
    "60-log/conversations/2026/08/1-a.md": record(long),
    "60-log/conversations/2026/08/2-b.md": record(long),
  });
  const block = await recall(app, { root: LOG, budget: long.length + 10 });
  assert.equal(block.match(/^- /gm).length, 1);
  assert.doesNotMatch(block, /talked t$/m, "nothing is left mid-word");
});

/**
 * Held on the session rather than pushed into its history: the transcript records what was
 * said, and this was not said by anybody, and a preamble in the history would be re-sent
 * with every turn, growing the request for as long as the conversation lasted.
 */
test("background attaches once and never reaches the transcript", async () => {
  const app = fakeVault({ [RECENT]: record("We were choosing between train and coach.") });
  const session = { history: [{ role: "user", text: "hello" }] };

  const settings = { folders: { context: LOG } };

  await attachMemory(app, session, { settings });
  assert.match(session.context, /train and the coach|train and coach/);
  assert.equal(session.history.length, 1, "the history is untouched");

  const first = session.context;
  await attachMemory(app, session, { settings });
  assert.equal(session.context, first, "and it is not rebuilt on the next turn");
});

test("turning it off sends nothing and asks the vault for nothing", async () => {
  let read = false;
  const app = fakeVault({ [RECENT]: record("We were choosing.") });
  app.vault.getMarkdownFiles = () => { read = true; return [] };

  const session = { history: [] };
  await attachMemory(app, session, { enabled: false });
  assert.equal(session.context, undefined);
  assert.equal(read, false, "the vault is not even consulted");
});
