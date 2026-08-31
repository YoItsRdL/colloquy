/**
 * Choosing which model does the work nobody asked for (ADR-0016).
 *
 * The screen this row is on refuses to name a provider or a model anywhere else, because
 * those are per-question choices and the chips own them. This one is not a per-question
 * choice, and the tests worth having are about the two ways it can be wrong: silently not
 * being what happens, and quietly costing money.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { El, Menu, menus, Platform } from "./test/obsidian.js";
import { renderBackground, SAME } from "./src/settings-background.js";
import { forgetModels } from "./src/models.js";

const real = globalThis.fetch;

/** Ollama's listing, which is the whole truth about what is on the disk (models.js). */
function serving(ids = ["gemma3:1b", "qwen3:4b"]) {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: ids.map((id) => ({ id })) }),
  });
}

afterEach(() => {
  globalThis.fetch = real;
  Platform.isMobile = false;
  // Listings are cached for the process, and these tests serve different ones.
  forgetModels();
  menus.length = 0;
});

function screen(settings = {}) {
  const containerEl = new El("div");
  const tab = {
    containerEl,
    saves: 0,
    plugin: {
      settings: { keys: {}, ...settings },
      async save() { tab.saves += 1; },
    },
    // The real one empties and rebuilds, which is how this row shows one control or two.
    display() {
      containerEl.empty();
      renderBackground(tab, containerEl);
    },
  };
  renderBackground(tab, containerEl);
  return tab;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const rows = (tab) => tab.containerEl.findAll((e) => e.hasClass("setting-item"));
const row = (tab) => rows(tab)[0];
const labels = (tab) => row(tab).findAll((e) => e.tagName === "button").map((b) => b.textContent.trim());
const warning = (tab) => tab.containerEl.find((e) => e.hasClass("colloquy-warning"))?.textContent ?? "";
const click = (tab, label) => row(tab).button(label).click();

/** Unset is the default, and it is not a model: it means whatever answers the questions. */
test("with nothing set, the row says the chat model answers for this too", () => {
  const tab = screen();

  assert.deepEqual(labels(tab), [SAME], "one control, because there is no model to name yet");
  assert.equal(warning(tab), "", "nothing is wrong and nothing is being charged for");
});

test("picking a provider stores it and offers what it has", async () => {
  serving();
  const tab = screen();

  click(tab, SAME);
  await Menu.last().choose("Ollama");

  assert.deepEqual(tab.plugin.settings.background, { provider: "ollama", model: null });
  assert.equal(tab.saves, 1);
  assert.equal(labels(tab).length, 2, "provider and model, the two questions the chips ask");
});

/**
 * A default is a constant in source and, for a provider that keeps its models on the disk,
 * a guess at somebody else's machine. The row shows the guess and then corrects it.
 */
test("a provider with no model named yet settles on what is actually installed", async () => {
  serving(["gemma3:1b"]);
  const tab = screen({ background: { provider: "ollama", model: null } });
  await settle();

  assert.deepEqual(labels(tab), ["Ollama", "gemma3:1b"]);
});

test("picking a model stores that model against that provider", async () => {
  serving();
  const tab = screen({ background: { provider: "ollama", model: "gemma3:1b" } });

  click(tab, "gemma3:1b");
  await settle();
  await Menu.last().choose("qwen3:4b");

  assert.deepEqual(tab.plugin.settings.background, { provider: "ollama", model: "qwen3:4b" });
});

/** A setting you cannot put back the way you found it is a trap. */
test("putting it back is the first thing on the menu", async () => {
  serving();
  const tab = screen({ background: { provider: "ollama", model: "gemma3:1b" } });

  click(tab, "Ollama");
  assert.equal(Menu.last().titles()[0], SAME, "first, before any provider");
  await Menu.last().choose(SAME);

  assert.equal(tab.plugin.settings.background, null);
  assert.deepEqual(labels(tab), [SAME]);
});

/** Changing provider clears the model: a model belongs to the provider that listed it. */
test("changing provider does not carry the old model to somewhere it means nothing", async () => {
  serving();
  const tab = screen({ keys: { OPENAI_API_KEY: "sk-test" }, background: { provider: "ollama", model: "gemma3:1b" } });

  click(tab, "Ollama");
  await Menu.last().choose("ChatGPT");

  assert.deepEqual(tab.plugin.settings.background, { provider: "openai", model: null });
});

/**
 * This is the setting that can spend money while nobody is looking, so what it will do is
 * said where it is chosen rather than found later on a bill.
 */
test("a provider that charges says so, in the row that chose it", () => {
  const tab = screen({ keys: { OPENAI_API_KEY: "sk-test" }, background: { provider: "openai", model: "gpt-5" } });

  assert.match(warning(tab), /charges for every request/);
  assert.match(warning(tab), /without being asked/);
});

/**
 * A preference can outlive the key it names. The work falls back to the chat model when
 * that happens (config.js), and this is the only place that is visible.
 */
test("a key removed since it was chosen is said plainly, not left looking set", () => {
  const tab = screen({ background: { provider: "openai", model: "gpt-5" } });

  assert.deepEqual(labels(tab), [SAME], "the row shows what will actually happen");
  assert.match(warning(tab), /ChatGPT has no key any more/, "named as the keys section names it");
});

/** Offering a choice between one thing and nothing. The keys section already says this. */
test("with no provider configured at all there is nothing to choose and no row", () => {
  Platform.isMobile = true;
  const tab = screen();

  assert.deepEqual(rows(tab), []);
});
