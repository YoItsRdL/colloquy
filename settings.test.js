/**
 * The settings screen as a whole: which sections it shows, in what order, and what each
 * toggle actually does (ADR-0004, ADR-0010).
 *
 * The two toggles that send text somewhere are the reason this file exists. One writes to
 * the vault unasked and the other puts earlier conversations in front of a paid provider,
 * so "off means off" is a claim worth a test rather than a comment.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { El, opened } from "./test/obsidian.js";
import { SettingsTab, DEFAULTS } from "./src/settings.js";

function screen(settings = {}, { lastRead = null } = {}) {
  const plugin = {
    settings: { ...DEFAULTS, ...settings },
    lastRead,
    saves: 0,
    stopped: 0,
    sweep: { stop() { plugin.stopped += 1; } },
    async save() { plugin.saves += 1; },
  };
  const tab = new SettingsTab({}, plugin);
  tab.display();
  return tab;
}

const rows = (tab) => tab.containerEl.findAll((e) => e.hasClass("setting-item"));
const names = (tab) => rows(tab).map((r) => r.find((e) => e.hasClass("setting-item-name"))?.textContent.trim());
const row = (tab, name) => rows(tab).find((r) => r.find((e) => e.hasClass("setting-item-name"))?.textContent.trim() === name);
const fieldIn = (r) => r.find((e) => e.tagName === "input");
const toggleIn = (tab, name) => row(tab, name).find((e) => e.hasClass("checkbox-container"));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the screen is built in the order a first run needs it, and asks for money last", () => {
  const shown = names(screen());

  assert.equal(shown[0], "Keys", "credentials first: nothing works without one");
  assert.equal(shown.at(-1), "Support", "and the ask is last, once you have what you came for");
  assert.ok(shown.includes("Where things go"));
  assert.ok(shown.includes("Read conversations automatically"));
});

/**
 * Provider and model are per-question choices with controls beside the composer. A setting
 * duplicating a control is two truths waiting to disagree.
 */
test("provider and model are deliberately not on this screen", () => {
  const shown = names(screen());

  assert.ok(!shown.includes("Provider"), shown.join(" | "));
  assert.ok(!shown.includes("Model"), shown.join(" | "));
});

// ── the two toggles that move text ───────────────────────────────────────────────

/** Off must stop the clock as well as the setting, or it reads once more after you said no. */
test("turning automatic reading off stops the sweep already scheduled", async () => {
  const tab = screen({ autoRead: true });

  toggleIn(tab, "Read conversations automatically").click();
  await settle();

  assert.equal(tab.plugin.settings.autoRead, false);
  assert.equal(tab.plugin.stopped, 1, "the pending read is cancelled, not left to fire once more");
  assert.ok(tab.plugin.saves >= 1);
});

test("the memory toggle turns off without touching anything else", async () => {
  const tab = screen({ useMemory: true });

  toggleIn(tab, "Use what earlier conversations noticed").click();
  await settle();

  assert.equal(tab.plugin.settings.useMemory, false);
  assert.equal(tab.plugin.stopped, 0, "nothing to stop: this one only affects the next question");
});

test("automatic naming turns off", async () => {
  const tab = screen({ autoName: true });

  toggleIn(tab, "Name conversations automatically").click();
  await settle();

  assert.equal(tab.plugin.settings.autoName, false);
});

test("what the automatic reading toggle says names the folder it writes to", () => {
  const tab = screen({ folders: { context: "60-log/conversations" } });
  const desc = row(tab, "Read conversations automatically").find((e) => e.hasClass("setting-item-description"));

  assert.match(desc.textContent, /60-log\/conversations\//, "the actual folder, not the default");
  assert.match(desc.textContent, /Only runs on a local model/, "and why it cannot cost money");
});

test("the memory toggle says plainly that a paid provider may see it", () => {
  const tab = screen();
  const desc = row(tab, "Use what earlier conversations noticed").find((e) => e.hasClass("setting-item-description"));

  assert.match(desc.textContent, /including a paid one/);
});

/**
 * Reading never interrupts anyone, which leaves "nothing worth keeping lately"
 * indistinguishable from "Ollama has been off for a week". This is the only place that
 * difference is visible.
 */
test("a failed read is reported, but only while reading is on", () => {
  const failing = { at: Date.now(), reason: "Ollama is not answering" };

  const on = screen({ autoRead: true }, { lastRead: failing });
  assert.match(on.containerEl.textContent, /Last attempt did not file anything: Ollama is not answering/);

  const off = screen({ autoRead: false }, { lastRead: failing });
  assert.ok(!off.containerEl.textContent.includes("Last attempt did not file"), "nothing to report when it is off");

  const quiet = screen({ autoRead: true }, { lastRead: { at: Date.now(), reason: null } });
  assert.ok(!quiet.containerEl.textContent.includes("Last attempt did not file"), "and nothing when it worked");
});

// ── folders ──────────────────────────────────────────────────────────────────────

test("the folder fields start from what is configured, and suggest the defaults", () => {
  const tab = screen({ folders: { conversations: "00-inbox" } });

  assert.equal(fieldIn(row(tab, "Conversations")).value, "00-inbox");
  assert.equal(fieldIn(row(tab, "What was noticed")).value, "");
  assert.equal(fieldIn(row(tab, "What was noticed")).placeholder, "Conversations/context");
});

/**
 * The gap between what was typed and what will be used is where the surprises live: a
 * leading slash, a stray `..`, a character Windows will not take in a name.
 */
test("a path that will be changed says so before anything is written", async () => {
  const tab = screen();
  const field = fieldIn(row(tab, "Conversations"));

  field.enter("/notes/chats/");
  const preview = row(tab, "Conversations").find((e) => e.hasClass("colloquy-folder-preview"));

  assert.match(preview.textContent, /Will be: notes\/chats\//);
});

test("a path that survives cleaning unchanged is not read back at you", () => {
  const tab = screen();
  const field = fieldIn(row(tab, "Conversations"));

  field.enter("notes/chats");
  const preview = row(tab, "Conversations").find((e) => e.hasClass("colloquy-folder-preview"));

  assert.equal(preview.textContent, "", "repeating somebody's own input is noise");
});

test("typing a folder stores the normalised form and writes it", async () => {
  const tab = screen();

  fieldIn(row(tab, "Conversations")).enter("//notes//chats//");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(tab.plugin.settings.folders.conversations, "notes/chats");
  assert.ok(tab.plugin.saves >= 1, "written, not just held");
});

test("clearing a folder stores nothing rather than an empty path", async () => {
  const tab = screen({ folders: { conversations: "00-inbox" } });

  fieldIn(row(tab, "Conversations")).enter("   ");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(tab.plugin.settings.folders.conversations, "", "which falls back to the default at every use");
});

// ── support ──────────────────────────────────────────────────────────────────────

test("the support button opens the funding page and nothing else", () => {
  opened.length = 0;
  const tab = screen();

  tab.containerEl.button("Buy me a coffee").click();

  assert.deepEqual(opened, ["https://buymeacoffee.com/ibonescalap"]);
});
