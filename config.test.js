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
import { buildConfig } from "./src/config.js";
import { resolve as resolveProvider, defaultProvider } from "./src/providers/index.js";

const KEYS = { OPENAI_API_KEY: "sk-test", OLLAMA_URL: "http://localhost:11434/v1" };

test("what the chips say is what the turn runs against", () => {
  const config = buildConfig({ provider: "openai", model: "gpt-5" }, KEYS);
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
