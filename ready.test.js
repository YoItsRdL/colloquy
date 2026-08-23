/**
 * What the panel shows before it can answer anything (ADR-0012).
 *
 * The state this replaced was three controls saying nothing: a provider chip naming none,
 * a model chip naming none, and a filename saying it had not been written, under a bright
 * Send that could not send. Every one was honest and none helped, so the rule these tests
 * hold is: nothing on screen that cannot be used, and one thing that can.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { El, Platform, notices } from "./test/obsidian.js";
import { createReady, canAnswer } from "./src/ready.js";
import { ConversationView } from "./src/view.js";

const KEYED = { keys: { ANTHROPIC_API_KEY: "a" } };
const BARE = { keys: {} };

/**
 * On a desktop the local provider carries a default address, so something can always
 * answer and this state is unreachable, correctly. It exists for the device that has no
 * localhost to assume (ADR-0012), so that is the device these run on.
 */
const onAPhone = (fn) => async (...args) => {
  Platform.isMobile = true;
  try { return await fn(...args); } finally { Platform.isMobile = false; }
};

function readyIn(settings, { setting } = {}) {
  const container = new El();
  const opened = [];
  const app = { setting: setting ?? { open: () => opened.push("open"), openTabById: (id) => opened.push(id) } };
  const ready = createReady(container, { app, plugin: { settings, manifest: { id: "colloquy" } } });
  return { ready, container, opened };
}

test("a desktop can always answer, because the local provider has a default address", () => {
  assert.equal(canAnswer(BARE), true);
});

test("a phone with nothing configured cannot answer, and a key is enough", onAPhone(() => {
  assert.equal(canAnswer(BARE), false);
  assert.equal(canAnswer(KEYED), true);
}));

test("the panel says what is missing and offers the one thing that fixes it", onAPhone(() => {
  const { ready, container } = readyIn(BARE);

  ready.show(true);

  assert.ok(container.find((e) => e.hasClass("is-shown")), "shown");
  assert.match(container.textContent, /Nothing to answer with yet/);
  assert.match(container.textContent, /Add a key for a provider/);
  assert.ok(container.button("Open settings"));
}));

test("the button opens this plugin's own settings, not just settings", onAPhone(() => {
  const { ready, container, opened } = readyIn(BARE);
  ready.show(true);

  container.button("Open settings").click();

  assert.deepEqual(opened, ["open", "colloquy"]);
}));

/** Obsidian does not document that API, so a failure has to leave a way through. */
test("if settings cannot be opened, it says where to go by hand", onAPhone(() => {
  notices.length = 0;
  const { ready, container } = readyIn(BARE, { setting: { open() { throw new Error("no"); } } });
  ready.show(true);

  container.button("Open settings").click();

  assert.match(notices.join(" "), /Settings → Community plugins → Colloquy/);
}));

/**
 * A blank page above a composer needs no explaining. Saying "ask something" where the
 * placeholder already says it is the kind of help that is really noise.
 */
test("a configured panel with nothing in it explains nothing", () => {
  const { ready, container } = readyIn(KEYED);

  ready.show(true);

  assert.equal(container.find((e) => e.hasClass("is-shown")), null);
});

/** Whatever is wrong now, what was already said still stands. */
test("a conversation on screen is never covered over", onAPhone(() => {
  const { ready, container } = readyIn(BARE);

  ready.show(false);

  assert.equal(container.find((e) => e.hasClass("is-shown")), null);
}));

// ── what the panel does with it ──────────────────────────────────────────────────

function panel(settings) {
  const app = { workspace: {}, vault: {}, metadataCache: {} };
  const view = new ConversationView({ app }, { settings, manifest: { id: "colloquy" }, sweep: {}, async save() {} });
  view.app = app;
  return view;
}

test("with nothing configured, Send does not offer to send and the chips are gone", onAPhone(async () => {
  const view = panel(BARE);
  await view.onOpen();

  assert.equal(view.sendButton.disabled, true, "the brightest thing on screen cannot fail");
  const chips = view.contentEl.findAll((e) => e.hasClass("colloquy-chip"));
  assert.ok(chips.every((c) => c.hasClass("is-hidden")), "nothing to choose between");
  assert.ok(view.contentEl.find((e) => e.hasClass("is-shown")), "and the reason is on screen");
}));

test("with a key set, the controls are there and Send works", async () => {
  const view = panel(KEYED);
  await view.onOpen();

  assert.equal(view.sendButton.disabled, false);
  const chips = view.contentEl.findAll((e) => e.hasClass("colloquy-chip"));
  assert.ok(chips.every((c) => !c.hasClass("is-hidden")));
  assert.equal(view.contentEl.find((e) => e.hasClass("is-shown")), null);
});

/**
 * It used to say "Not written yet", a whole row on a phone, answering a question nobody
 * had yet asked.
 */
test("where the conversation is being written is not shown until it is", async () => {
  const view = panel(KEYED);
  await view.onOpen();

  assert.ok(view.where.el.hasClass("is-hidden"));

  view.where.show("00-inbox/2026/08/23/trains.md");
  assert.ok(!view.where.el.hasClass("is-hidden"));
  assert.equal(view.where.el.textContent, "trains");
});

/**
 * The empty thread keeps its half of the panel unless it is told not to, which pushed all
 * of this into the bottom half against the composer's edge. And a composer that cannot
 * send still has a live Enter key, around the button saying it will not.
 */
test("the panel is only the one thing, not the one thing above two dead ones", onAPhone(async () => {
  const view = panel(BARE);
  await view.onOpen();

  assert.ok(view.contentEl.hasClass("is-unconfigured"), "so the thread and composer stand down");
}));

test("and it stands aside the moment something can answer", onAPhone(async () => {
  const view = panel(BARE);
  await view.onOpen();
  assert.ok(view.contentEl.hasClass("is-unconfigured"));

  view.plugin.settings.keys = { ANTHROPIC_API_KEY: "a" };
  view.refresh();

  assert.ok(!view.contentEl.hasClass("is-unconfigured"), "without a restart");
  assert.equal(view.sendButton.disabled, false);
}));
