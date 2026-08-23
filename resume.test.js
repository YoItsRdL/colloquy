/**
 * Picking a conversation up, and putting one down (TKT-0110).
 *
 * Everything is rebuilt from the file, because the file is the record and there is nothing
 * behind it. That is what lets a conversation edited by hand, or written on another machine
 * and synced here, resume exactly like one this panel just wrote — so these tests hand it
 * markdown and read the screen that comes back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { El, notices, MarkdownRenderer } from "./test/obsidian.js";
import { createThread } from "./src/thread.js";
import { createWhere } from "./src/where.js";
import { resumeConversation, startConversationAfresh, pickConversation } from "./src/resume.js";
import { ConversationPicker } from "./src/picker.js";

const PATH = "00-inbox/2026/08/19/is-it-better-by-train.md";

const TRANSCRIPT = `---
uid: 20260819T130100
---

# Is It Better By Train

**me** _(13:01)_

is it better by train?

**gemma3:4b** _(13:02)_

**Yes** — it is faster door to door.

**error** _(13:05)_

Ollama is not answering.
`;

function panel(text = TRANSCRIPT, { busy = false, settings = {} } = {}) {
  const file = { path: PATH, basename: "is-it-better-by-train", stat: { mtime: Date.now() } };
  const app = {
    vault: { read: async () => text, getAbstractFileByPath: (p) => ({ path: p }), getMarkdownFiles: () => [file] },
    workspace: { getLeaf: () => ({ openFile: async () => {} }) },
  };
  const view = {
    app,
    file,
    busy,
    named: false,
    session: { history: [{ role: "user", text: "old" }], file: "somewhere/else.md" },
    plugin: { settings },
    attachments: [{ path: "note.md", name: "note.md" }],
    thread: createThread(new El(), { app, component: {} }),
    where: createWhere(new El(), { app }),
    focused: 0,
    shown: [],
    composer: {
      focus() { view.focused += 1; },
      showAttached(list) { view.shown.push(list.length); },
    },
  };
  return view;
}

const turnsOn = (view) => view.thread.el.findAll((e) => e.hasClass("colloquy-turn"));

test("a conversation is rebuilt from its file, error turns and all", async () => {
  MarkdownRenderer.rendered.length = 0;
  const view = panel();

  await resumeConversation(view, view.file);

  assert.equal(turnsOn(view).length, 2, "the two real turns; the error is not history");
  assert.equal(view.session.history.length, 2);
  assert.deepEqual(view.session.history.map((t) => t.role), ["user", "assistant"]);
  assert.equal(view.session.file, PATH);
});

/**
 * A human turn was written, not generated; only the model's half is markdown. Getting this
 * the wrong way round reinterprets somebody's own words back at them.
 */
test("only the model's half of a resumed conversation is rendered", async () => {
  MarkdownRenderer.rendered.length = 0;
  const view = panel();

  await resumeConversation(view, view.file);

  assert.equal(MarkdownRenderer.rendered.length, 1);
  assert.match(MarkdownRenderer.rendered[0].markdown, /^\*\*Yes\*\*/);
  assert.equal(MarkdownRenderer.rendered[0].sourcePath, PATH, "so its links resolve from the right note");
});

/**
 * It earned its title on the first answer. Renaming it now would move a file that may
 * already be linked from a note somebody wrote.
 */
test("a resumed conversation is not renamed again", async () => {
  const view = panel();

  await resumeConversation(view, view.file);

  assert.equal(view.named, true);
});

test("resuming shows where it is and puts the cursor back in the composer", async () => {
  const view = panel();

  await resumeConversation(view, view.file);

  assert.equal(view.where.path, PATH);
  assert.equal(view.where.el.textContent, "is-it-better-by-train");
  assert.equal(view.focused, 1);
});

test("a conversation with nothing in it says so", async () => {
  notices.length = 0;
  const view = panel("---\nuid: x\n---\n\n# Empty\n");

  await resumeConversation(view, view.file);

  assert.equal(turnsOn(view).length, 0);
  assert.match(notices.join(" "), /nothing in it yet/);
});

test("picking one up mid-answer is refused rather than queued", async () => {
  notices.length = 0;
  const view = panel(TRANSCRIPT, { busy: true });

  await resumeConversation(view, view.file);
  pickConversation(view);

  assert.match(notices.join(" "), /Still answering/);
  assert.equal(turnsOn(view).length, 0, "the thread on screen is untouched");
});

// ── starting afresh ──────────────────────────────────────────────────────────────

/**
 * Nothing is lost and nothing is asked: the previous conversation is a note in the vault.
 * Saying where it went is the point — that is the question this moment raises.
 */
test("starting afresh clears the panel and says where the last one went", async () => {
  notices.length = 0;
  const view = panel();
  await resumeConversation(view, view.file);

  startConversationAfresh(view);

  assert.equal(view.session, null);
  assert.equal(view.named, false);
  assert.equal(turnsOn(view).length, 0);
  assert.equal(view.where.path, null);
  assert.match(notices.join(" "), /Saved as is-it-better-by-train\.md/);
});

/**
 * Whatever was attached belonged to the question that was never asked. Carrying it into a
 * new conversation would send it somewhere it was never meant for — and pay for it.
 */
test("starting afresh drops what was attached to the question never asked", () => {
  const view = panel();

  startConversationAfresh(view);

  assert.deepEqual(view.attachments, []);
  assert.deepEqual(view.shown, [0], "and the row is redrawn empty");
});

/**
 * Clearing the thread while a reply is arriving would orphan it: the file would keep the
 * answer and the screen would not.
 */
test("starting afresh mid-answer is refused", () => {
  notices.length = 0;
  const view = panel(TRANSCRIPT, { busy: true });

  startConversationAfresh(view);

  assert.ok(view.session, "the conversation is still there");
  assert.match(notices.join(" "), /Still answering/);
});

// ── the picker ───────────────────────────────────────────────────────────────────

test("a conversation is offered by its subject, not its filename", () => {
  const view = panel();
  const picker = new ConversationPicker(view.app, "00-inbox", () => {});

  assert.equal(picker.getItemText(view.file), "is it better by train");
});

test("choosing one hands it back to whoever asked", () => {
  const view = panel();
  const picked = [];
  const picker = new ConversationPicker(view.app, "00-inbox", (file) => picked.push(file.path));

  picker.onChooseItem(view.file);

  assert.deepEqual(picked, [PATH]);
});
