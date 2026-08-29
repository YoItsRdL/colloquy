/**
 * A turn, end to end: shown as it arrives, written once it is whole (ADR-0001).
 *
 * This is the one place where the panel, the file and the model meet, and the invariant
 * worth defending is that the file never falls behind the screen. A reply that failed
 * halfway still has somewhere to be recorded; a question that was asked is on disk before
 * the answer starts arriving.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ConversationView } from "./src/view.js";
import { folderAware } from "./test/obsidian.js";

const FOLDERS = { conversations: "00-inbox", context: "60-log/conversations" };

/** A vault that records what was written to it, and a model that says what it is told to. */
function panel({ chunks = ["Yes", ", by train."], key = "http://localhost:11434/v1", title = "By Train" } = {}) {
  const files = new Map();
  const asked = [];

  const app = {
    vault: {
      getAbstractFileByPath: (p) => (files.has(p) ? { path: p, name: p.split("/").pop(), basename: p.split("/").pop().replace(/\.md$/, "") } : null),
      getMarkdownFiles: () => [...files.keys()].map((p) => ({ path: p, name: p.split("/").pop(), basename: "x", stat: { mtime: 0 } })),
      createFolder: async () => {},
      create: async (p, text) => { files.set(p, text); return { path: p }; },
      append: async (file, text) => files.set(file.path, (files.get(file.path) ?? "") + text),
      read: async (file) => files.get(file.path) ?? "",
      cachedRead: async (file) => files.get(file.path) ?? "",
      process: async (file, fn) => files.set(file.path, fn(files.get(file.path) ?? "")),
    },
    metadataCache: { getFileCache: () => ({}) },
    fileManager: { renameFile: async () => {}, processFrontMatter: async () => {} },
    workspace: { getLeaf: () => ({ openFile: async () => {} }) },
  };

  const provider = {
    name: "ollama",
    label: "Ollama",
    keyKind: "url",
    async *stream() {
      for (const chunk of chunks) {
        if (chunk instanceof Error) throw chunk;
        yield chunk;
      }
    },
    complete: async (opts) => { asked.push(opts); return title; },
  };

  const touched = [];
  const plugin = {
    settings: { provider: "ollama", model: "gemma3:4b", folders: FOLDERS, keys: {}, autoRead: true, useMemory: false, autoName: false },
    sweep: { touch: (p) => touched.push(p), stop: () => {} },
    async save() {},
    async config() { return { provider, model: "gemma3:4b", key }; },
  };

  const view = new ConversationView({ app }, plugin);
  view.app = app;
  return { view, files, plugin, touched, asked };
}

const open = async (harness) => { await harness.view.onOpen(); return harness; };
const turns = (view) => view.thread.el.findAll((e) => e.hasClass("colloquy-turn"));
const conversation = (files) => [...files.entries()].find(([p]) => p.startsWith("00-inbox/"));

test("the panel is built with everything a question needs", async () => {
  const { view } = await open(panel());

  assert.ok(view.thread, "somewhere to read");
  assert.ok(view.composer, "somewhere to type");
  assert.ok(view.chips, "and a say in what answers");
  assert.ok(view.where, "and where it is being kept");
  assert.equal(view.sendButton.textContent, "Send");
  assert.deepEqual(view.attachments, []);
});

test("an empty box sends nothing", async () => {
  const { view, files } = await open(panel());

  await view.send();

  assert.deepEqual(turns(view), []);
  assert.equal(files.size, 0, "and writes nothing");
});

test("a question already being answered does not start a second", async () => {
  const { view, files } = await open(panel());
  view.busy = true;
  view.composer.input.value = "is it better by train?";

  await view.send();

  assert.equal(files.size, 0);
});

/**
 * The file exists before the answer does, so a reply that fails halfway still has somewhere
 * to be recorded.
 */
test("a whole turn reaches the screen and the file", async () => {
  const { view, files, touched } = await open(panel());
  view.composer.input.value = "is it better by train?";

  await view.send();

  assert.equal(turns(view).length, 2, "the question and the answer");
  const [path, text] = conversation(files);
  assert.match(text, /\*\*me\*\*/);
  assert.match(text, /is it better by train\?/);
  assert.match(text, /Yes, by train\./, "written whole, not chunk by chunk");
  assert.deepEqual(touched, [path], "and the idle clock starts");
  assert.equal(view.where.path, path, "the panel says where it went");
});

test("the box is emptied and the cursor put back, ready for the next one", async () => {
  const { view } = await open(panel());
  view.composer.input.value = "is it better by train?";

  await view.send();

  assert.equal(view.composer.input.value, "");
  assert.equal(view.composer.input.focused, true);
  assert.equal(view.sendButton.textContent, "Send", "and the button is a Send again");
  assert.equal(view.busy, false);
});

test("what was attached is sent once and then let go", async () => {
  const { view, files } = await open(panel());
  view.attachments = [{ kind: "image", name: "map.png", path: "a/map.png", mime: "image/png", data: "AAA" }];
  view.composer.input.value = "what is this?";

  await view.send();

  assert.deepEqual(view.attachments, [], "not carried into the next question");
  assert.match(conversation(files)[1], /map\.png/, "and the transcript links to it");
});

// ── when it goes wrong ───────────────────────────────────────────────────────────

/**
 * Said plainly, with the one thing a person wants next. Choosing a different provider is
 * something they do with the chips, when they want to (ADR-0009).
 */
test("a failed turn says so on screen, in the file, and offers to try again", async () => {
  const { view, files } = await open(panel({ chunks: [new Error("Failed to fetch")] }));
  view.composer.input.value = "is it better by train?";

  await view.send();

  const failure = turns(view).find((t) => t.hasClass("is-failed"));
  assert.ok(failure, "on screen");
  assert.match(failure.textContent, /not answering/);
  assert.ok(failure.button("Try again"), "with the one thing wanted next");
  assert.match(conversation(files)[1], /\*\*error\*\*/, "and in the file, so the record is honest");
});

/** The question is already in the history and already in the file, so it is not written twice. */
test("trying again does not ask the file to hold the question twice", async () => {
  const harness = await open(panel({ chunks: [new Error("Failed to fetch")] }));
  const { view, files } = harness;
  view.composer.input.value = "is it better by train?";
  await view.send();

  const failure = turns(view).find((t) => t.hasClass("is-failed"));
  failure.button("Try again").click();
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Counted as turns rather than as text: the working heading is made from the question
  // too, so the words appear twice in a file that only ever recorded one question.
  const said = conversation(files)[1].match(/\*\*me\*\*/g) ?? [];
  assert.equal(said.length, 1, "asked once, recorded once");
  assert.equal(view.session.history.filter((h) => h.role === "user").length, 1, "and remembered once");
});

test("a turn that produced nothing leaves no empty row behind", async () => {
  const { view } = await open(panel({ chunks: [new Error("Failed to fetch")] }));
  view.composer.input.value = "is it better by train?";

  await view.send();

  const blank = turns(view).filter((t) => !t.textContent.replace(/^(me|could not finish)/, "").trim());
  assert.deepEqual(blank, [], "the pending row is cleared rather than left as an empty bubble");
});

/**
 * Naming the place it can be fixed. "No key" without that is a dead end.
 */
test("a missing key names the screen it is fixed on", async () => {
  const { view } = await open(panel({ key: null }));
  view.composer.input.value = "hello";

  await view.send();

  const failure = turns(view).find((t) => t.hasClass("is-failed"));
  assert.match(failure.textContent, /Settings → Colloquy/);
});

// ── stopping ─────────────────────────────────────────────────────────────────────

/**
 * Whatever has already been said is kept, because it is what the model said, and the
 * usual reason for stopping is that enough has arrived to know the rest is not wanted.
 */
test("stopping keeps what had already arrived", async () => {
  const { view, files } = await open(panel());
  view.composer.input.value = "write me an essay";

  const sending = view.send();
  view.stop();
  await sending;

  assert.equal(view.busy, false);
  assert.ok(conversation(files), "the conversation still exists");
});

test("reading unasked can be turned off, and then nothing is scheduled", async () => {
  const harness = await open(panel());
  harness.plugin.settings.autoRead = false;
  harness.view.composer.input.value = "is it better by train?";

  await harness.view.send();

  assert.deepEqual(harness.touched, []);
});
