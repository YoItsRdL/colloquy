/**
 * The keys section of the settings screen (ADR-0004).
 *
 * The rules here are about what reaches the screen, so the assertions read the rendered
 * tree rather than the calls that built it: a stored secret must never come back into a
 * field, and a button that does nothing must fail a test rather than a person.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { El, notices } from "./test/obsidian.js";
import { renderKeys } from "./src/settings-keys.js";
import { status } from "./src/keys.js";
import { all as allAdapters } from "./src/providers/index.js";

/**
 * Not shaped like a real key on purpose: the gate refuses a commit containing anything that
 * looks like one, in a test fixture as readily as in source, and it is right to.
 */
const SECRET = "a-key-that-is-not-a-key";

/** The settings screen, rendered, and redrawn the way the real tab redraws it. */
function screen(settings) {
  const containerEl = new El("div");
  const tab = {
    containerEl,
    removing: null,
    redraws: 0,
    saves: 0,
    plugin: { settings, save: async () => { tab.saves += 1; } },
    display() {
      this.redraws += 1;
      containerEl.empty();
      this.keys = status(allAdapters(), settings);
      renderKeys(this, containerEl);
    },
  };
  tab.display();
  return tab;
}

const rows = (tab) => tab.containerEl.findAll((e) => e.hasClass("setting-item"));
const row = (tab, name) => rows(tab).find((r) => r.find((e) => e.hasClass("setting-item-name"))?.textContent.trim() === name);
const trashIn = (r) => r.find((e) => e.getAttr("data-icon") === "trash");
const fieldIn = (r) => r.find((e) => e.tagName === "input");
/** onClick handlers are not awaited by the button, so give their promises a turn. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a configured key offers to be removed, and an unset one has nothing to remove", () => {
  const tab = screen({ keys: { ANTHROPIC_API_KEY: SECRET } });

  assert.ok(trashIn(row(tab, "Claude")), "the configured one");
  assert.equal(trashIn(row(tab, "ChatGPT")), null, "the unset one");
});

/**
 * The rule ADR-0004 exists for. A stored key is never handed back to the interface, so it
 * cannot be read off the screen, copied out of it, or written into a screenshot.
 */
test("a stored secret never comes back to the screen", () => {
  const tab = screen({ keys: { ANTHROPIC_API_KEY: SECRET } });
  const field = fieldIn(row(tab, "Claude"));

  assert.equal(field.value, "", "not in the field");
  assert.equal(field.type, "password", "and not in a box that would show it");
  assert.ok(!tab.containerEl.textContent.includes(SECRET), "nor anywhere else on the screen");
});

/**
 * An address is configuration rather than a secret, and seeing it is how somebody notices
 * it is pointing at the wrong machine.
 */
test("an address is shown, in a field that does not pretend it is a password", () => {
  const tab = screen({ keys: { OLLAMA_URL: "http://192.168.1.4:11434/v1" } });
  const field = fieldIn(row(tab, "Ollama"));

  assert.equal(field.value, "http://192.168.1.4:11434/v1");
  assert.equal(field.type, "text");
});

test("removing a key is asked about before it happens", () => {
  const tab = screen({ keys: { ANTHROPIC_API_KEY: SECRET } });
  trashIn(row(tab, "Claude")).click();

  assert.ok(tab.containerEl.button("Remove"), "the confirmation");
  assert.ok(tab.containerEl.button("Cancel"), "and a way out of it");
  assert.deepEqual(tab.plugin.settings.keys, { ANTHROPIC_API_KEY: SECRET }, "nothing gone yet");
});

/**
 * This shipped in 1.0.0 doing nothing at all. The handler called two functions left behind
 * by the fallback chain deleted in ADR-0009, threw before it reached the end, and so never
 * saved and never redrew: the key was cleared in memory, left on disk, and the
 * confirmation stayed on screen looking untouched.
 */
test("confirming a removal clears the key, writes it, and redraws", async () => {
  const tab = screen({ keys: { ANTHROPIC_API_KEY: SECRET, OPENAI_API_KEY: "sk-other" } });
  trashIn(row(tab, "Claude")).click();
  const before = tab.redraws;

  tab.containerEl.button("Remove").click();
  await settle();

  assert.deepEqual(tab.plugin.settings.keys, { OPENAI_API_KEY: "sk-other" }, "gone, and only that one");
  assert.equal(tab.saves, 1, "written, not just forgotten");
  assert.ok(tab.redraws > before, "and the screen shows it");
  assert.equal(tab.containerEl.button("Remove"), null, "the confirmation is gone");
});

test("cancelling a removal keeps the key", async () => {
  const tab = screen({ keys: { ANTHROPIC_API_KEY: SECRET } });
  trashIn(row(tab, "Claude")).click();

  tab.containerEl.button("Cancel").click();
  await settle();

  assert.deepEqual(tab.plugin.settings.keys, { ANTHROPIC_API_KEY: SECRET });
  assert.equal(tab.saves, 0, "nothing to write");
  assert.ok(row(tab, "Claude"), "and the row is back");
});

/**
 * Removing the key for the provider in use would leave the selection pointing at something
 * that cannot answer, and this screen has no provider dropdown to correct it with.
 */
test("removing the key in use moves the selection to one that can answer", async () => {
  const settings = { provider: "anthropic", model: "claude-3", keys: { ANTHROPIC_API_KEY: SECRET, GEMINI_API_KEY: "g" } };
  const tab = screen(settings);
  trashIn(row(tab, "Claude")).click();

  tab.containerEl.button("Remove").click();
  await settle();

  assert.equal(settings.provider, "gemini", "the one still configured");
  assert.equal(settings.model, null, "and no model left over from the old one");
});

test("a key pasted with whitespace is refused, and said so", async () => {
  notices.length = 0;
  const tab = screen({ keys: {} });
  const r = row(tab, "Claude");

  fieldIn(r).enter("sk-ant secret");
  r.find((e) => e.tagName === "button").click();
  await settle();

  assert.deepEqual(tab.plugin.settings.keys, {}, "not stored");
  assert.match(notices.join(" "), /whitespace/, "and the reason is on screen");
});
