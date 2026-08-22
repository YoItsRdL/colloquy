/**
 * Reading conversations without being asked (ADR-0006).
 *
 * This is the only code in the plugin that writes to the vault with nobody watching, so
 * the assertions are about restraint rather than function: it does not run on a provider
 * that charges, it does not read the same conversation twice, and it does not mark
 * anything done that it has not actually filed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSweep, isFree, wasRead } from "./src/sweep.js";

const FOLDERS = { conversations: "00-inbox", context: "60-log/conversations" };
const CONVERSATION = "00-inbox/2026/08/19/trains.md";
const good = '{"context":"We were working out whether the train beats the bus, and you would rather not change twice."}';

/** A plugin, a vault, and a model — enough of each to watch the sweep behave. */
function harness({ reply = good, keyKind = "url" } = {}) {
  const files = new Map([[CONVERSATION, "a conversation about trains"]]);
  const front = new Map();
  const asked = [];

  const fileFor = (p) => ({ path: p, name: p.split("/").pop(), basename: p.split("/").pop().replace(/\.md$/, "") });

  const app = {
    vault: {
      getAbstractFileByPath: (p) => (files.has(p) ? fileFor(p) : null),
      getMarkdownFiles: () => [...files.keys()].map(fileFor),
      createFolder: async () => {},
      create: async (p, text) => { files.set(p, text); return fileFor(p); },
      read: async (file) => files.get(file.path) ?? "",
    },
    metadataCache: { getFileCache: (file) => ({ frontmatter: front.get(file.path) }) },
    fileManager: {
      processFrontMatter: async (file, fn) => {
        const current = front.get(file.path) ?? {};
        fn(current);
        front.set(file.path, current);
      },
    },
  };

  const plugin = {
    app,
    // Named explicitly rather than left to the defaults: these fixtures use one vault's
    // scheme, and the shipped default is deliberately not that (ADR-0010).
    settings: { folders: FOLDERS },
    config: async () => ({
      model: "gemma3:4b",
      key: "http://localhost:11434/v1",
      provider: {
        keyKind,
        complete: async (opts) => {
          asked.push(opts);
          if (reply instanceof Error) throw reply;
          return reply;
        },
      },
    }),
  };

  return { plugin, app, files, front, asked };
}

/** What the sweep left behind, which is one record per conversation it read. */
const records = (files) => [...files.keys()].filter((p) => p.startsWith("60-log/conversations/"));

test("a local provider is free to read everything; a metered one is not", () => {
  assert.equal(isFree({ provider: { keyKind: "url" } }), true);
  assert.equal(isFree({ provider: { keyKind: "secret" } }), false);
  assert.equal(isFree({ provider: {} }), false);
  assert.equal(isFree(null), false, "unknown is treated as costing money");
});

test("a quiet conversation is read and what it said about us is filed", async () => {
  const { plugin, files, front } = harness();
  await createSweep(plugin).read(CONVERSATION);

  assert.equal(records(files).length, 1);
  assert.equal(front.get(CONVERSATION).noticed, new Date().toISOString().slice(0, 10));
});

/**
 * Passive means every conversation, including the ones nobody would have bothered to
 * process. On a metered provider that is a bill that grows without anyone pressing
 * anything, against an explicit constraint of this vault's owner.
 */
test("nothing is read on a provider that charges for it", async () => {
  const { plugin, files, front, asked } = harness({ keyKind: "secret" });
  await createSweep(plugin).read(CONVERSATION);

  assert.deepEqual(asked, [], "the request is never made");
  assert.deepEqual(records(files), []);
  assert.equal(front.has(CONVERSATION), false, "and it stays unread, not marked done");
});

test("a conversation already read is left alone", async () => {
  const { plugin, front, asked } = harness();
  front.set(CONVERSATION, { noticed: "2026-08-18" });
  await createSweep(plugin).read(CONVERSATION);

  assert.deepEqual(asked, []);
  assert.equal(wasRead(plugin.app, { path: CONVERSATION }), true);
});

/**
 * Marked only once the record is on disk. The other order loses what a conversation said
 * about us permanently to a crash in between, and nothing would ever look at it again.
 */
test("a conversation that could not be filed is not marked as done", async () => {
  const { plugin, files, front } = harness({ reply: new Error("ollama is not running") });
  await createSweep(plugin).read(CONVERSATION);

  assert.deepEqual(records(files), []);
  assert.equal(front.has(CONVERSATION), false, "so the next sweep picks it up");
});

test("an unreadable answer leaves the conversation for another time", async () => {
  const { plugin, files, front } = harness({ reply: "I'm afraid I can't help with that." });
  await createSweep(plugin).read(CONVERSATION);

  assert.deepEqual(records(files), []);
  assert.equal(front.has(CONVERSATION), false);
});

/**
 * A conversation with nothing in it is the normal case, and it is genuinely finished —
 * unlike a failure, it must not be read again on every future sweep.
 */
test("a conversation worth nothing is still marked read", async () => {
  const { plugin, files, front } = harness({ reply: '{"context":""}' });
  await createSweep(plugin).read(CONVERSATION);

  assert.deepEqual(records(files), []);
  assert.equal(Boolean(front.get(CONVERSATION)?.noticed), true);
});

/**
 * The marker was called `processed`, which is also what `/process` does to a conversation —
 * promote it into a note and archive it. Two different meanings under one key, on the same
 * files, is a trap for whoever reads that frontmatter next.
 */
test("the old marker is cleared as each conversation comes past", async () => {
  const { plugin, front } = harness();
  front.set(CONVERSATION, { processed: "2026-08-18" });

  await createSweep(plugin).read(CONVERSATION);
  assert.equal(front.get(CONVERSATION).processed, undefined, "no stale key left behind");
  assert.equal(Boolean(front.get(CONVERSATION).noticed), true);
});

test("a conversation that has since been moved is not resurrected", async () => {
  const { plugin, asked } = harness();
  await createSweep(plugin).read("00-inbox/2026/08/19/gone.md");
  assert.deepEqual(asked, []);
});

/** The clock measures silence, so a conversation is read once finished, not once old. */
test("each turn pushes the read further out", async () => {
  const { plugin, asked } = harness();
  const sweep = createSweep(plugin, { idleMs: 40 });

  sweep.touch(CONVERSATION);
  await new Promise((r) => setTimeout(r, 25));
  sweep.touch(CONVERSATION);
  await new Promise((r) => setTimeout(r, 25));
  assert.deepEqual(asked, [], "still mid-conversation");

  await new Promise((r) => setTimeout(r, 40));
  assert.equal(asked.length, 1, "and read once it actually went quiet");
});

/**
 * Starting a second conversation must not silently abandon the first. One timer per
 * plugin meant `touch(B)` cancelled A's pending read, and since nothing ever rescans for
 * unread conversations, A would have stayed unread permanently.
 */
test("a conversation is still read after you move on to another", async () => {
  const { plugin, files, asked } = harness();
  const OTHER = "00-inbox/2026/08/19/buses.md";
  files.set(OTHER, "a conversation about buses");

  const sweep = createSweep(plugin, { idleMs: 30 });
  sweep.touch(CONVERSATION);
  sweep.touch(OTHER);

  await new Promise((r) => setTimeout(r, 120));
  assert.equal(asked.length, 2, "both conversations were read, not just the last one");
});

test("stopping cancels a read that has not happened yet", async () => {
  const { plugin, asked } = harness();
  const sweep = createSweep(plugin, { idleMs: 30 });

  sweep.touch(CONVERSATION);
  sweep.stop();
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(asked, []);
});

test("two reads cannot overlap", async () => {
  const { plugin, asked } = harness();
  const sweep = createSweep(plugin);
  await Promise.all([sweep.read(CONVERSATION), sweep.read(CONVERSATION)]);
  assert.equal(asked.length, 1);
});

/**
 * One read at a time keeps a 4B model off the GPU the person is about to use — but a busy
 * flag that *drops* the second conversation is silent loss, not backpressure.
 */
test("a conversation arriving mid-read waits rather than being dropped", async () => {
  const { plugin, files, asked } = harness();
  const OTHER = "00-inbox/2026/08/19/buses.md";
  files.set(OTHER, "a conversation about buses");

  const sweep = createSweep(plugin);
  await Promise.all([sweep.read(CONVERSATION), sweep.read(OTHER)]);
  assert.equal(asked.length, 2);
});

/**
 * Without this the `noticed:` marker is write-only. An evening when Ollama was off, a
 * quit before the timer fired, a crash — and nothing in the system would ever look at
 * those conversations again.
 */
test("conversations the idle clock never reached are picked up later", async () => {
  const { plugin, files, front, asked } = harness();
  files.set("00-inbox/2026/08/18/older.md", "an older conversation");
  front.set("00-inbox/2026/08/18/older.md", {});   // seen, never read

  const remaining = await createSweep(plugin).catchUp();
  assert.equal(asked.length, 2, "both unread conversations were read");
  assert.equal(remaining, 0);
});

test("catching up does not re-read what was already done", async () => {
  const { plugin, front, asked } = harness();
  front.set(CONVERSATION, { noticed: "2026-08-18" });

  assert.equal(await createSweep(plugin).catchUp(), 0);
  assert.deepEqual(asked, []);
});

/**
 * The shipped default puts the account folder inside the conversation folder, so that
 * everything this plugin writes is one folder somebody can move or delete in one gesture.
 * Without this filter every account would look like an unread conversation, and the sweep
 * would read its own writing and write accounts of that.
 */
test("the sweep never reads what it wrote itself", async () => {
  const { plugin, files, asked } = harness();
  plugin.settings.folders = { conversations: "Conversations", context: "Conversations/context" };
  files.set("Conversations/2026/08/19/a-real-conversation.md", "a conversation");
  files.set("Conversations/context/2026/08/19-a-real-conversation.md", "an account of it");

  await createSweep(plugin).catchUp();
  assert.equal(asked.length, 1, "the conversation, and not the account of it");
});

test("only conversations are caught up, not notes somebody wrote", async () => {
  const { plugin, files, asked } = harness();
  files.set("10-notes/2026/08/a-note-somebody-wrote.md", "not a conversation");

  await createSweep(plugin).catchUp();
  assert.equal(asked.length, 1, "the note is none of this plugin's business");
});

/**
 * This runs when the app opens. An inbox of two hundred must not mean ten minutes of GPU
 * the moment somebody opens their vault — the rest waits for the next time.
 */
test("a large backlog is read in bounded batches, and says what is left", async () => {
  const { plugin, files, asked } = harness();
  for (let i = 0; i < 8; i++) files.set(`00-inbox/2026/08/18/talk-${i}.md`, "a conversation");

  const remaining = await createSweep(plugin).catchUp({ limit: 3 });
  assert.equal(asked.length, 3);
  assert.equal(remaining, 6, "and the rest are reported rather than silently dropped");
});

/**
 * Picking a conversation up again is the case the `noticed:` marker gets wrong on its
 * own: it was read, truthfully, and then grew. Without this the second half of a resumed
 * conversation is never looked at by anything.
 */
test("a conversation that grows after being read is read again", async () => {
  const { plugin, front, asked } = harness();
  const sweep = createSweep(plugin, { idleMs: 20 });

  await sweep.read(CONVERSATION);
  assert.equal(asked.length, 1);
  assert.equal(Boolean(front.get(CONVERSATION)?.noticed), true);

  sweep.touch(CONVERSATION);                            // a new turn arrives
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(asked.length, 2, "the new half gets read despite the marker");
});

/**
 * Obsidian's metadata cache lags the frontmatter write by a moment, so a conversation read
 * seconds ago still looks unread. Found in the running app: the first catch-up marked a
 * conversation on disk and then reported it as still waiting.
 */
test("a conversation is not re-read while the metadata cache catches up", async () => {
  const { plugin, front, asked } = harness();
  const sweep = createSweep(plugin);

  await sweep.read(CONVERSATION);
  assert.equal(asked.length, 1);

  front.delete(CONVERSATION);   // exactly what a lagging cache looks like
  await sweep.read(CONVERSATION);
  assert.equal(asked.length, 1, "still once");
  assert.equal(await sweep.catchUp(), 0, "and the count does not double-report it");
});

/**
 * The sweep never interrupts anyone, which makes "nothing has happened for a week"
 * indistinguishable from "Ollama has been down for a week" unless the reason is kept.
 */
test("why nothing was read is recorded, even though nobody is interrupted", async () => {
  const { plugin } = harness({ reply: new Error("ollama is not running") });
  await createSweep(plugin).read(CONVERSATION);
  assert.match(plugin.lastRead.reason, /ollama is not running/);

  const metered = harness({ keyKind: "secret" });
  await createSweep(metered.plugin).read(CONVERSATION);
  assert.match(metered.plugin.lastRead.reason, /charges per request/);

  const fine = harness();
  await createSweep(fine.plugin).read(CONVERSATION);
  assert.equal(fine.plugin.lastRead.reason, null, "and success clears it");
});

/**
 * The clock is keyed on path and the first answer renames the file. Told nothing, the timer
 * fires on a name nothing lives at, returns without a word, and the conversation waits for
 * the next catch-up — which is how 1.0.0 shipped.
 */
test("a conversation renamed mid-countdown is still read when it goes quiet", async () => {
  const { plugin, files } = harness();
  const named = "00-inbox/2026/08/19/is-the-train-quicker.md";
  const sweep = createSweep(plugin, { idleMs: 5 });

  sweep.touch(CONVERSATION);
  files.set(named, files.get(CONVERSATION));
  files.delete(CONVERSATION);
  sweep.renamed(CONVERSATION, named);
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(records(files).length, 1, "read under the name it ended up with");
});

test("a clock left on the old name reads nothing at all", async () => {
  const { plugin, files } = harness();
  const named = "00-inbox/2026/08/19/is-the-train-quicker.md";
  const sweep = createSweep(plugin, { idleMs: 5 });

  sweep.touch(CONVERSATION);
  files.set(named, files.get(CONVERSATION));
  files.delete(CONVERSATION);
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.deepEqual(records(files), [], "which is the failure the line above prevents");
});
