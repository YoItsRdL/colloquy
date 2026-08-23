/**
 * The three pieces of panel furniture: where the conversation is being written, the action
 * bar above it, and the transcript itself.
 *
 * Small modules, but each carries a decision worth holding still. A control that must not
 * look clickable before there is anything to click, a transcript that must not yank the
 * page while somebody is reading it, and a human turn that must never be run through a
 * markdown renderer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { El, notices, MarkdownRenderer } from "./test/obsidian.js";
import { createWhere } from "./src/where.js";
import { createBar } from "./src/bar.js";
import { createThread } from "./src/thread.js";

const CONVERSATION = "00-inbox/2026/08/19/is-it-better-by-train.md";

function vault({ present = true } = {}) {
  const opened = [];
  const app = {
    vault: { getAbstractFileByPath: (p) => (present ? { path: p } : null) },
    workspace: { getLeaf: (split) => ({ split, openFile: async (file) => opened.push(file.path) }) },
  };
  return { app, opened };
}

// ── where ────────────────────────────────────────────────────────────────────────

test("before anything is written the control says so and cannot be clicked", () => {
  const { app } = vault();
  const where = createWhere(new El(), { app });

  assert.match(where.el.textContent, /Not written yet/);
  assert.equal(where.el.disabled, true, "an empty control reads as one that failed to load");
  assert.ok(where.el.hasClass("is-pending"));
});

test("once written it shows the name, and keeps the path in the tooltip", () => {
  const { app } = vault();
  const where = createWhere(new El(), { app });

  where.show(CONVERSATION);

  assert.equal(where.el.textContent, "is-it-better-by-train", "no extension: they are all .md");
  assert.equal(where.el.title, `Open ${CONVERSATION}`);
  assert.equal(where.el.disabled, false);
});

/**
 * Into the main area rather than this leaf. The panel is where the asking happens, and
 * replacing it with the transcript closes the thing being used.
 */
test("clicking opens the conversation somewhere other than the panel", async () => {
  const { app, opened } = vault();
  const where = createWhere(new El(), { app });
  where.show(CONVERSATION);

  await where.reveal();

  assert.deepEqual(opened, [CONVERSATION]);
});

test("a conversation that has been moved says so rather than failing quietly", async () => {
  notices.length = 0;
  const { app, opened } = vault({ present: false });
  const where = createWhere(new El(), { app });
  where.show(CONVERSATION);

  await where.reveal();

  assert.deepEqual(opened, [], "nothing opened");
  assert.match(notices.join(" "), /no longer where it was written/);
});

// ── bar ──────────────────────────────────────────────────────────────────────────

test("both actions are reachable, and the icon-only one is still named", () => {
  const container = new El();
  const pressed = [];
  createBar(container, { onNew: () => pressed.push("new"), onPick: () => pressed.push("pick") });

  const buttons = container.findAll((e) => e.tagName === "button");
  assert.equal(buttons.length, 2);
  assert.match(buttons[0].textContent, /New conversation/);
  assert.equal(buttons[1].textContent.trim(), "", "the second is an icon");
  assert.equal(buttons[1].getAttr("aria-label"), "Pick up a conversation", "so it needs a name of its own");

  buttons[0].click();
  buttons[1].click();
  assert.deepEqual(pressed, ["new", "pick"]);
});

// ── thread ───────────────────────────────────────────────────────────────────────

const threadIn = () => createThread(new El(), { app: {}, component: {} });

/**
 * A human turn was written, not generated. Running it through a markdown renderer would
 * quietly reinterpret somebody's own words back at them.
 */
test("a human turn is shown exactly as typed", () => {
  MarkdownRenderer.rendered.length = 0;
  const thread = threadIn();

  const row = thread.add("me", "look at *this* and <b>that</b>", { literal: true });

  assert.equal(row.body.textContent, "look at *this* and <b>that</b>");
  assert.deepEqual(MarkdownRenderer.rendered, [], "never rendered");
  assert.ok(row.turn.hasClass("is-mine"));
});

test("a model turn is rendered as markdown, replacing whatever was there", async () => {
  MarkdownRenderer.rendered.length = 0;
  const thread = threadIn();
  const row = thread.add("…", "", { pending: true });

  await thread.render(row, "**bold**", CONVERSATION);

  assert.equal(MarkdownRenderer.rendered.length, 1);
  assert.equal(MarkdownRenderer.rendered[0].markdown, "**bold**");
  assert.equal(row.body.findAll((e) => e.hasClass("colloquy-thinking")).length, 0, "the dots are gone");
});

/**
 * A local model can take half a minute before its first token, and a static ellipsis is
 * indistinguishable from a panel that has stopped working.
 */
test("a turn still being waited on animates rather than sitting still", () => {
  const thread = threadIn();
  const row = thread.add("…", "", { pending: true });

  const dots = row.body.find((e) => e.hasClass("colloquy-thinking"));
  assert.ok(dots, "something moving");
  assert.equal(dots.children.length, 3);
  assert.ok(!row.turn.hasClass("is-mine"), "and it is not attributed to the person waiting");
});

test("a failed turn is marked as one and keeps its text", () => {
  const thread = threadIn();
  const row = thread.add("could not finish", "Ollama is not answering", { failed: true, literal: true });

  assert.ok(row.turn.hasClass("is-failed"));
  assert.equal(row.body.textContent, "Ollama is not answering");
  assert.ok(!row.turn.hasClass("is-mine"), "a failure is not something the person said");
});

/**
 * Scrolling on every chunk makes a long reply impossible to read while it arrives, so an
 * answer is followed only by somebody who was already at the bottom.
 */
test("an arriving answer does not drag a reader who has scrolled up", async () => {
  const thread = threadIn();
  const row = thread.add("…", "", { pending: true });
  Object.assign(thread.el, { scrollHeight: 2000, clientHeight: 400, scrollTop: 200 });

  await thread.render(row, "a long answer");

  assert.equal(thread.el.scrollTop, 200, "left where they were reading");
});

test("an answer does follow a reader who was already at the bottom", async () => {
  const thread = threadIn();
  const row = thread.add("…", "", { pending: true });
  Object.assign(thread.el, { scrollHeight: 2000, clientHeight: 400, scrollTop: 1590 });

  await thread.render(row, "a long answer");

  assert.equal(thread.el.scrollTop, 2000);
});

test("saying something always scrolls, wherever the reader was", () => {
  const thread = threadIn();
  Object.assign(thread.el, { scrollHeight: 2000, clientHeight: 400, scrollTop: 0 });

  thread.add("me", "hello", { literal: true });

  assert.equal(thread.el.scrollTop, 2000, "you always want to see what you just sent");
});
