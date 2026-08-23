/**
 * What Obsidian actually loads.
 *
 * Deliberately thin, so what is worth asserting is the wiring rather than any logic: the
 * commands exist under the ids other things call them by, the panel opens beside what you
 * are reading rather than replacing it, and the one thing here that runs unasked is both
 * deferred and cancellable.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import ColloquyPlugin from "./src/main.js";
import { VIEW_TYPE } from "./src/view.js";

function obsidian({ leaves = [], stored = null } = {}) {
  const revealed = [];
  const created = [];
  let ready = null;

  const app = {
    workspace: {
      getLeavesOfType: (type) => (type === VIEW_TYPE ? leaves : []),
      revealLeaf: (leaf) => revealed.push(leaf),
      getRightLeaf: () => {
        const leaf = { setViewState: async (state) => created.push(state) };
        return leaf;
      },
      onLayoutReady: (fn) => { ready = fn; },
    },
    vault: { getMarkdownFiles: () => [], on: () => ({}) },
    metadataCache: { getFileCache: () => ({}) },
  };

  const plugin = new ColloquyPlugin(app, { id: "colloquy", version: "1.0.1" });
  plugin.data = stored;
  return { plugin, app, revealed, created, layoutReady: () => ready?.() };
}

test("the commands other things call by name are all there", async () => {
  const { plugin } = obsidian();
  await plugin.onload();

  assert.deepEqual(plugin.commands.map((c) => c.id).sort(), ["new-conversation", "open", "pick-conversation"]);
  assert.ok(plugin.commands.every((c) => c.name), "each with something a person can search for");
});

test("the panel is registered and reachable from the ribbon", async () => {
  const { plugin } = obsidian();
  await plugin.onload();

  assert.ok(plugin.views.has(VIEW_TYPE));
  assert.equal(plugin.ribbons.length, 1);
  assert.equal(plugin.tabs.length, 1, "and there is somewhere to configure it");
});

test("stored preferences win over the defaults, and the defaults fill the rest", async () => {
  const { plugin } = obsidian({ stored: { provider: "anthropic", autoRead: false } });
  await plugin.onload();

  assert.equal(plugin.settings.provider, "anthropic", "what was stored");
  assert.equal(plugin.settings.autoRead, false);
  assert.equal(plugin.settings.useMemory, true, "and what was never set");
});

/**
 * The right sidebar, not the editor area: this sits beside what you are reading rather
 * than replacing it, which is the difference between capture and a destination.
 */
test("opening it puts the panel beside what you are reading", async () => {
  const { plugin, created, revealed } = obsidian();
  await plugin.onload();

  await plugin.open();

  assert.deepEqual(created, [{ type: VIEW_TYPE, active: true }]);
  assert.equal(revealed.length, 1);
});

test("opening it again reveals the one that exists rather than making a second", async () => {
  const existing = { view: {} };
  const { plugin, created, revealed } = obsidian({ leaves: [existing] });
  await plugin.onload();

  await plugin.open();

  assert.deepEqual(created, [], "no second panel");
  assert.deepEqual(revealed, [existing]);
});

test("new conversation asks the open panel, or opens one when there is none", async () => {
  const started = [];
  const open = obsidian({ leaves: [{ view: { startNew: () => started.push("asked") } }] });
  await open.plugin.onload();
  open.plugin.commands.find((c) => c.id === "new-conversation").callback();
  assert.deepEqual(started, ["asked"]);

  const shut = obsidian();
  await shut.plugin.onload();
  shut.plugin.commands.find((c) => c.id === "new-conversation").callback();
  assert.equal(shut.created.length, 1, "opened instead");
});

test("preferences are written, and nothing else is", async () => {
  const { plugin } = obsidian();
  await plugin.onload();
  plugin.settings.autoName = false;

  await plugin.save();

  assert.equal(plugin.data.autoName, false);
  assert.equal(plugin.data, plugin.settings);
});

// ── the one thing that runs unasked ──────────────────────────────────────────────

/**
 * Starting a local model is the last thing that should compete with opening the vault, so
 * the catch-up waits, and it must be cancellable, or a quit inside that window leaves a
 * timer holding a plugin that has already unloaded.
 */
test("the catch-up waits half a minute, and only then", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { plugin, layoutReady } = obsidian();
  await plugin.onload();

  const caught = [];
  plugin.sweep = { catchUp: () => caught.push("read"), stop: () => {} };
  layoutReady();

  t.mock.timers.tick(29_000);
  assert.deepEqual(caught, [], "not while the vault is still opening");

  t.mock.timers.tick(2_000);
  assert.deepEqual(caught, ["read"]);
});

test("nothing is read unasked when reading unasked is turned off", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { plugin, layoutReady } = obsidian({ stored: { autoRead: false } });
  await plugin.onload();

  const caught = [];
  plugin.sweep = { catchUp: () => caught.push("read"), stop: () => {} };
  layoutReady();
  t.mock.timers.tick(60_000);

  assert.deepEqual(caught, []);
});

test("unloading cancels both the pending catch-up and the idle clock", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { plugin, layoutReady } = obsidian();
  await plugin.onload();

  const caught = [];
  let stopped = 0;
  plugin.sweep = { catchUp: () => caught.push("read"), stop: () => { stopped += 1; } };
  layoutReady();

  for (const dispose of plugin.disposers) dispose();
  t.mock.timers.tick(60_000);

  assert.equal(stopped, 1, "the idle clock");
  assert.deepEqual(caught, [], "and the deferred one");
});
