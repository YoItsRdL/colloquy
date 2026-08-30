/**
 * Provider and model, as two chips beside the composer.
 *
 * The rule underneath all of this is that the chip and the turn must agree. A chip naming
 * a provider whose key has gone would sit there confidently while every question failed
 * with "no key", and that is the failure these tests exist to prevent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { El, Menu, menus } from "./test/obsidian.js";
import { createChips } from "./src/chips.js";
import { forgetModels } from "./src/models.js";

/** Somewhere nothing is listening, so listing models fails the way an absent server does. */
const NOWHERE = "http://127.0.0.1:1/v1";

function chipsFor(settings) {
  menus.length = 0;
  forgetModels();
  const container = new El();
  const plugin = { settings, saves: 0, async save() { plugin.saves += 1; } };
  let changes = 0;
  const chips = createChips({ container, plugin, onChange: () => { changes += 1; } });
  const buttons = container.findAll((e) => e.hasClass("colloquy-chip"));
  return { chips, plugin, container, provider: buttons[0], model: buttons[1], get changes() { return changes; } };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Ollama is always among them: it needs an address rather than a secret, and it carries a
 * working default, so it is configured without anyone typing anything.
 */
test("only providers that can answer are offered, and a local one always can", () => {
  const ui = chipsFor({ provider: "gemini", keys: { GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" } });

  ui.provider.click();
  const offered = Menu.last().titles();

  assert.deepEqual(offered.sort(), ["Claude", "Gemini", "Ollama"]);
  assert.ok(!offered.includes("DeepSeek"), "no key and no default: offering it offers a failure");
  assert.ok(!offered.includes("ChatGPT"));
});

test("with nothing to choose between, the provider chip does not invite a click", () => {
  const bare = chipsFor({ keys: {} });
  assert.equal(bare.provider.disabled, true, "only the local one, so there is no choice to make");

  const two = chipsFor({ provider: "gemini", keys: { GEMINI_API_KEY: "g" } });
  assert.equal(two.provider.disabled, false, "Gemini and Ollama is a choice");
});

/**
 * A model belongs to the provider that listed it, so it cannot travel, sending one
 * provider's model to another fails on the first turn.
 */
test("changing provider drops the model that belonged to the old one", async () => {
  const settings = { provider: "gemini", model: "gemini-2.5-flash", keys: { GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" } };
  const ui = chipsFor(settings);

  ui.provider.click();
  await Menu.last().choose("Claude");
  await settle();

  assert.equal(settings.provider, "anthropic");
  assert.equal(settings.model, null, "not carried across");
  assert.equal(ui.plugin.saves, 1);
  assert.equal(ui.changes, 1, "and the panel is told, so the next turn uses it");
});

test("choosing the provider already in use changes nothing", async () => {
  const settings = { provider: "gemini", model: "gemini-2.5-flash", keys: { GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" } };
  const ui = chipsFor(settings);

  ui.provider.click();
  await Menu.last().choose("Gemini");
  await settle();

  assert.equal(settings.model, "gemini-2.5-flash", "kept");
  assert.equal(ui.plugin.saves, 0, "and nothing written");
});

/**
 * A stored choice can outlive its key. The adapter still resolves, so the chip would name a
 * provider confidently while every turn failed.
 */
test("a provider whose key has been removed is not the one the chip names", () => {
  const ui = chipsFor({ provider: "anthropic", keys: { GEMINI_API_KEY: "g" } });

  assert.equal(ui.provider.textContent.trim(), "Gemini", "the one that can actually answer");
});

test("a provider that no longer exists at all falls back rather than throwing", () => {
  const ui = chipsFor({ provider: "some-retired-thing", keys: { GEMINI_API_KEY: "g" } });

  assert.equal(ui.provider.textContent.trim(), "Gemini");
});

/**
 * A fresh install with nothing typed in still has somewhere to send a question, which is
 * the whole point of the local default.
 */
test("a fresh install already points at the local provider", () => {
  const ui = chipsFor({ provider: "gemini", keys: {} });

  assert.equal(ui.provider.textContent.trim(), "Ollama");
  assert.equal(ui.model.disabled, false, "there is a model to pick");
});

/**
 * The label deliberately drops part of a model id to fit, so the whole of it has to be
 * somewhere, otherwise two models that shorten alike are indistinguishable.
 */
test("the model chip keeps the whole id in its tooltip", () => {
  const ui = chipsFor({ provider: "gemini", model: "gemini-2.5-flash-preview-09-2025", keys: { GEMINI_API_KEY: "g" } });

  assert.equal(ui.model.title, "gemini-2.5-flash-preview-09-2025");
});

/**
 * One provider failing to list is not a reason to offer nothing: its default is still a
 * usable option, and more use than a menu that will not open.
 */
test("a provider that cannot be reached still offers its default model", async () => {
  const ui = chipsFor({ provider: "ollama", keys: { OLLAMA_URL: NOWHERE } });

  await ui.model.onclick({ type: "click" });

  assert.equal(Menu.last().titles().length, 1, "one option rather than none");
  assert.ok(ui.model.textContent.trim().length > 0, "and the chip is not left saying loading…");
});

/**
 * The regression this pins. The chip used to paint the adapter's `defaultModel` while the
 * turn resolved the first installed model, which is the Gemini failure one level down:
 * two places answering one question and agreeing until they did not.
 */
test("the model chip names what a turn would run, not the adapter's constant", async () => {
  const ui = chipsFor({ provider: "ollama", model: null, keys: { OLLAMA_URL: NOWHERE } });
  await settle();

  // Nothing is listening, so the constant is all there is and the chip says so rather than
  // emptying itself or waiting for ever.
  assert.equal(ui.model.findAll((e) => e.hasClass("colloquy-chip-label"))[0].textContent, "qwen3:4b");
  assert.equal(ui.model.disabled, false, "and it can still be opened to choose another");
});
