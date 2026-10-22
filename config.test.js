/**
 * Assembling a turn's configuration (TKT-0002, ADR-0009).
 *
 * Almost nothing left to assemble. This file used to test a fallback chain, which provider
 * a turn walked to when the first refused, and which paid one it offered afterwards, and
 * all of it went with the chain. What survives is the one rule that still has a decision in
 * it: a preference naming something that no longer exists must not stop the plugin.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConfig, backgroundConfig, migrate } from "./src/config.js";
import { resolve as resolveProvider, defaultProvider } from "./src/providers/index.js";

const KEYS = { OPENAI_API_KEY: "sk-test", OLLAMA_URL: "http://localhost:11434/v1" };

test("what the chips say is what the turn runs against", () => {
  const config = buildConfig({ provider: "openai", models: { openai: "gpt-5" } }, KEYS);
  assert.equal(config.provider.name, "openai");
  assert.equal(config.model, "gpt-5");
  assert.equal(config.key, "sk-test");
});

test("no model chosen means the provider's own default", () => {
  const openai = resolveProvider("openai");
  assert.equal(buildConfig({ provider: "openai" }, KEYS).model, openai.defaultModel);
});

/**
 * A stored provider can name something removed in an update. Throwing here would mean a
 * plugin that will not start because of a preference, and a plugin that will not start is
 * one that has taken its conversation history with it.
 */
test("a provider that no longer exists falls back rather than throwing", () => {
  const config = buildConfig({ provider: "a-provider-that-was-deleted" }, KEYS);
  assert.ok(config.key, "falls back to one that can actually answer");
});

/**
 * The default is a name in a constant, not a promise that a key exists for it. Falling
 * back to it when nothing can use it is how "No key for Gemini" got shown to someone who
 * runs Ollama and had chosen nothing at all.
 */
test("nothing chosen at all falls back to a provider with a key, not to the default", () => {
  const config = buildConfig({}, KEYS);
  assert.notEqual(config.provider.name, defaultProvider);
  assert.ok(config.key);
  assert.equal(typeof config.model, "string");
});

/**
 * The bug this rule exists for: one provider configured, a stale preference naming
 * another, and a panel that named the usable one while every turn ran the useless one.
 */
test("a stored provider whose key is gone gives way to one that has a key", () => {
  const config = buildConfig({ provider: "gemini" }, { OLLAMA_URL: "http://localhost:11434/v1" });
  assert.equal(config.provider.name, "ollama");
  assert.equal(config.key, "http://localhost:11434/v1");
});

/**
 * When nothing can answer, the error should name the provider someone picked. Rerouting
 * to an arbitrary keyless one would report a provider they had never heard of.
 */
test("with no keys at all the stored choice is kept, so the error names it", () => {
  const config = buildConfig({ provider: "anthropic" }, {});
  assert.equal(config.provider.name, "anthropic");
  assert.equal(config.key, undefined);
});

/**
 * The chain is gone, and so is every trace of it in what a turn is handed. A stray `chain`
 * or `alternatives` would be dead weight that the next person reads as a feature.
 */
test("a turn is handed one provider and no alternatives", () => {
  assert.deepEqual(Object.keys(buildConfig({ provider: "openai" }, KEYS)).sort(),
    ["key", "model", "provider"]);
});

test("a missing key is reported as missing, not substituted", () => {
  assert.equal(buildConfig({ provider: "openai" }, {}).key, undefined);
});

// ── the model for the work nobody asked for (ADR-0016) ───────────────────────────

/**
 * Unset is not a model. It means the chat one, so a vault that has never opened that
 * setting reads and names exactly as it did before there was one.
 */
test("with nothing set, the unattended work runs on the chat model", () => {
  const config = backgroundConfig({ provider: "openai", models: { openai: "gpt-5" } }, KEYS);

  assert.equal(config.provider.name, "openai");
  assert.equal(config.model, "gpt-5");
  assert.equal(config.chosen, false, "inherited, not picked");
});

test("a model set for it is what the unattended work runs on, whatever the chips say", () => {
  const config = backgroundConfig(
    { provider: "openai", models: { openai: "gpt-5" }, background: { provider: "ollama", model: "gemma3:1b" } },
    KEYS,
  );

  assert.equal(config.provider.name, "ollama");
  assert.equal(config.model, "gemma3:1b");
  assert.equal(config.key, KEYS.OLLAMA_URL);
  assert.equal(config.chosen, true, "picked, which is what lets it charge if it charges");
});

/** A provider chosen for it, with no model named yet: the provider's own default. */
test("a provider set for it with no model runs that provider's default", () => {
  const config = backgroundConfig({ background: { provider: "openai" } }, KEYS);

  assert.equal(config.provider.name, "openai");
  assert.equal(config.model, resolveProvider("openai").defaultModel);
});

/**
 * The work runs unattended, and unattended work that stops has nobody to tell. Both of the
 * ways this preference can outlive what it names fall back rather than fail.
 */
test("a key removed since it was chosen gives way to the chat model", () => {
  const config = backgroundConfig(
    { provider: "ollama", background: { provider: "openai", models: { openai: "gpt-5" } } },
    { OLLAMA_URL: "http://localhost:11434/v1" },
  );

  assert.equal(config.provider.name, "ollama");
  assert.equal(config.chosen, false, "and it stops counting as a choice, so the free rule applies again");
});

test("a provider that no longer exists gives way rather than throwing", () => {
  const config = backgroundConfig({ background: { provider: "a-provider-that-was-deleted" } }, KEYS);

  assert.ok(config.key);
  assert.equal(config.chosen, false);
});

test("a stored model is only ever the stored provider's, even when another provider answers", () => {
  // Gemini is stored, but only OpenAI has a key, so OpenAI answers. Gemini's model must not
  // be sent there.
  const config = buildConfig({ provider: "gemini", models: { gemini: "gemini-2.5-flash" } }, { OPENAI_API_KEY: "k" });
  assert.equal(config.provider.name, "openai");
  assert.notEqual(config.model, "gemini-2.5-flash");
  assert.equal(config.model, config.provider.defaultModel);
});

test("settings from before models were kept per provider are moved to their provider", () => {
  const migrated = migrate({ provider: "openai", model: "gpt-5", keys: {} });
  assert.deepEqual(migrated.models, { openai: "gpt-5" });
  assert.equal("model" in migrated, false, "so it cannot be read as anyone else's");
  assert.deepEqual(migrate({ provider: "openai", models: { openai: "x" } }).models, { openai: "x" }, "new ones left alone");
});
