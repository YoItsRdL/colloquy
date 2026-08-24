/**
 * Models installed on this machine (TKT-0106).
 *
 * Gigabytes and minutes, which is what makes this section different from the rest of the
 * screen: a server that is off is the ordinary case rather than an error, a download that
 * sits still for twenty minutes must say what it is doing, and a deletion is worth asking
 * about because getting it back means fetching it again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { El, Modal, modals, notices } from "./test/obsidian.js";
import { renderLibrary } from "./src/settings-models.js";

const ADDRESS = "http://localhost:11434/v1";

const model = (name, size, parameter_size, quantization_level) =>
  ({ name, size, details: { parameter_size, quantization_level } });

/** Answers the endpoints the local provider actually calls, and refuses everything else. */
function serving({ models = null, unreachable = false } = {}) {
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (unreachable) throw new TypeError("Failed to fetch");
    if (String(url).endsWith("/api/tags")) return { ok: true, json: async () => ({ models: models ?? [] }) };
    if (String(url).endsWith("/api/delete")) return { ok: true, json: async () => ({}) };
    return { ok: false, status: 404, text: async () => "no" };
  };
  return requests;
}

function screen(settings = { keys: {} }) {
  const containerEl = new El("div");
  const tab = {
    app: {},
    containerEl,
    redraws: 0,
    refreshed: 0,
    plugin: {
      settings,
      async save() {},
      refreshPanel() { tab.refreshed += 1; },
    },
    // The real one empties and rebuilds. Rebuilding is the whole point of two of these
    // tests, so this does it too.
    display() {
      this.redraws += 1;
      containerEl.empty();
      renderLibrary(this, containerEl);
    },
  };
  renderLibrary(tab, containerEl);
  return tab;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const rows = (tab) => tab.containerEl.findAll((e) => e.hasClass("setting-item"));
const row = (tab, name) => rows(tab).find((r) => r.find((e) => e.hasClass("setting-item-name"))?.textContent.trim() === name);
const descOf = (r) => r.find((e) => e.hasClass("setting-item-description"))?.textContent ?? "";

/**
 * Shown only for adapters that export a `library`, so a hosted provider offers nothing here
 * and this file still names no provider.
 */
test("only a provider that manages its own models gets a section", async () => {
  serving({ models: [] });
  const tab = screen({ keys: { ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" } });
  await settle();

  const headings = rows(tab).map((r) => r.find((e) => e.hasClass("setting-item-name"))?.textContent.trim());
  assert.ok(headings.includes("Ollama models"), headings.join(" | "));
  assert.ok(!headings.some((h) => /Claude|Gemini/.test(h ?? "")), "the hosted ones manage nothing here");
});

/** A server that is not running is the ordinary case, not an error worth alarm. */
test("a server that is off says where it was looked for", async () => {
  serving({ unreachable: true });
  const tab = screen();
  await settle();

  assert.match(tab.containerEl.textContent, new RegExp(`Not reachable at ${ADDRESS.replace(/[/]/g, "\\/")}`));
  assert.match(tab.containerEl.textContent, /Start it, or correct the address above/);
});

test("an empty machine says what to do about it", async () => {
  serving({ models: [] });
  const tab = screen();
  await settle();

  assert.match(tab.containerEl.textContent, /Nothing installed yet\. Name a model below to download one\./);
});

/**
 * "4.0B · Q4_K_M" is what decides whether a model fits in 8 GB, and the name does not
 * always say.
 */
test("each model shows the two numbers that decide whether it fits", async () => {
  serving({ models: [model("gemma3:4b", 3_300_000_000, "4.0B", "Q4_K_M")] });
  const tab = screen();
  await settle();

  const listed = row(tab, "gemma3:4b");
  assert.ok(listed, "listed by the name the provider uses");
  assert.equal(descOf(listed), "4.0B · Q4_K_M · 3.3 GB");
});

// ── downloading ──────────────────────────────────────────────────────────────────

test("the download button waits until there is something to download", async () => {
  serving({ models: [] });
  const tab = screen();
  await settle();

  const puller = row(tab, "Download a model");
  const button = puller.find((e) => e.tagName === "button");
  assert.equal(button.disabled, true, "nothing typed yet");

  puller.find((e) => e.tagName === "input").enter("qwen3:8b");
  assert.equal(button.disabled, false);
});

/**
 * A button that sits still for twenty minutes is indistinguishable from one that has
 * failed, so progress goes where the eye already is rather than into a notice that would
 * have to be replaced hundreds of times.
 */
test("a download reports progress in the row it was started from", async () => {
  serving({ models: [] });
  const tab = screen();
  await settle();

  // The provider's own pull, replaced so the test is about the screen rather than the wire.
  const { all } = await import("./src/providers/index.js");
  const ollama = all().find((a) => a.name === "ollama");
  const real = ollama.library.pull;
  ollama.library.pull = async (_opts, onProgress) => {
    onProgress({ status: "pulling manifest" });
    onProgress({ status: "downloading", completed: 500, total: 1000 });
  };

  try {
    const puller = row(tab, "Download a model");
    puller.find((e) => e.tagName === "input").enter("qwen3:8b");
    await puller.find((e) => e.tagName === "button").onclick();

    assert.match(descOf(puller), /downloading, 50%/);
    assert.match(notices.join(" "), /qwen3:8b is ready/);
    assert.ok(tab.redraws >= 1, "and the list is rebuilt with it in");
  } finally {
    ollama.library.pull = real;
  }
});

/**
 * The row this would have been written to may have been rebuilt since the download began,
 * and a download that fails silently is indistinguishable from one still running.
 */
test("a download that fails says so somewhere that survives a redraw", async () => {
  serving({ models: [] });
  notices.length = 0;
  const tab = screen();
  await settle();

  const { all } = await import("./src/providers/index.js");
  const ollama = all().find((a) => a.name === "ollama");
  const real = ollama.library.pull;
  ollama.library.pull = async () => { throw new Error("no space left on device"); };

  try {
    const puller = row(tab, "Download a model");
    puller.find((e) => e.tagName === "input").enter("qwen3:8b");
    await puller.find((e) => e.tagName === "button").onclick();

    assert.match(notices.join(" "), /qwen3:8b did not download: no space left on device/);
    assert.equal(tab.pulling, null, "and nothing is left claiming to be in flight");
    assert.equal(row(tab, "Download a model").find((e) => e.tagName === "button").disabled, true,
      "the rebuilt row starts empty, as it does on first open");
  } finally {
    ollama.library.pull = real;
  }
});

/**
 * Removing a model rebuilt the whole screen under a download in progress, which left the
 * percentage reporting into a row that had been thrown away: a five gigabyte pull looked as
 * though it had never been started.
 */
test("a download in progress survives the screen being rebuilt under it", async () => {
  serving({ models: [] });
  const tab = screen();
  await settle();

  const { all } = await import("./src/providers/index.js");
  const ollama = all().find((a) => a.name === "ollama");
  const real = ollama.library.pull;
  let report;
  ollama.library.pull = (_opts, onProgress) => new Promise(() => { report = onProgress; });

  try {
    const puller = row(tab, "Download a model");
    puller.find((e) => e.tagName === "input").enter("qwen3:8b");
    puller.find((e) => e.tagName === "button").onclick();
    report({ status: "downloading", completed: 300, total: 1000 });
    assert.match(descOf(row(tab, "Download a model")), /downloading, 30%/);

    tab.display();

    const rebuilt = row(tab, "Download a model");
    assert.match(descOf(rebuilt), /downloading, 30%/, "it picks the pull back up");
    assert.equal(rebuilt.find((e) => e.tagName === "input").value, "qwen3:8b", "and still names it");

    report({ status: "downloading", completed: 900, total: 1000 });
    assert.match(descOf(row(tab, "Download a model")), /downloading, 90%/, "and keeps reporting");
  } finally {
    ollama.library.pull = real;
    tab.pulling = null;
  }
});

/**
 * The panel would otherwise be left pointing at a model that is no longer on the machine,
 * and every question after it failing at the provider.
 */
test("removing the model in use moves the selection to one still installed", async () => {
  serving({ models: [model("gemma3:4b", 3e9, "4.3B", "Q4_K_M"), model("qwen3:4b", 2e9, "4.0B", "Q4_K_M")] });
  modals.length = 0;
  const tab = screen({ keys: {}, model: "qwen3:4b" });
  await settle();

  row(tab, "qwen3:4b").find((e) => e.getAttr("data-icon") === "trash").onclick();
  await settle();
  Modal.last().contentEl.button("Remove").click();
  await settle();

  assert.equal(tab.plugin.settings.model, "gemma3:4b", "the one still there");
  assert.equal(tab.refreshed, 1, "and the panel is told, so its chip agrees");
});

test("removing a model that was not selected leaves the selection alone", async () => {
  serving({ models: [model("gemma3:4b", 3e9, "4.3B", "Q4_K_M"), model("qwen3:4b", 2e9, "4.0B", "Q4_K_M")] });
  modals.length = 0;
  const tab = screen({ keys: {}, model: "gemma3:4b" });
  await settle();

  row(tab, "qwen3:4b").find((e) => e.getAttr("data-icon") === "trash").onclick();
  await settle();
  Modal.last().contentEl.button("Remove").click();
  await settle();

  assert.equal(tab.plugin.settings.model, "gemma3:4b");
  assert.equal(tab.refreshed, 0, "nothing changed, so nothing to tell");
});

// ── removing ─────────────────────────────────────────────────────────────────────

/** Asked first: this is gigabytes, and getting it back means downloading it again. */
test("removing a model is asked about, and cancelling removes nothing", async () => {
  serving({ models: [model("gemma3:4b", 3_300_000_000, "4.0B", "Q4_K_M")] });
  modals.length = 0;
  const tab = screen();
  await settle();

  const removing = row(tab, "gemma3:4b").find((e) => e.getAttr("data-icon") === "trash");
  removing.onclick();
  await settle();

  const asked = Modal.last();
  assert.match(asked.titleEl.textContent, /Remove gemma3:4b\?/);
  assert.match(asked.contentEl.textContent, /frees 3\.3 GB/);

  asked.contentEl.button("Cancel").click();
  await settle();
  assert.ok(row(tab, "gemma3:4b"), "still there");
});
