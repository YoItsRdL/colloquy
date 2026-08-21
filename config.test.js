/**
 * Assembling a turn's configuration (TKT-0002, ADR-0009).
 *
 * Almost nothing left to assemble. This file used to test a fallback chain — which provider
 * a turn walked to when the first refused, and which paid one it offered afterwards — and
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
 * plugin that will not start because of a preference — and a plugin that will not start is
 * one that has taken its conversation history with it.
 */
test("a provider that no longer exists falls back to the default rather than throwing", () => {
  const config = buildConfig({ provider: "a-provider-that-was-deleted" }, KEYS);
  assert.equal(config.provider.name, defaultProvider);
});

test("nothing chosen at all still produces something runnable", () => {
  const config = buildConfig({}, KEYS);
  assert.equal(config.provider.name, defaultProvider);
  assert.equal(typeof config.model, "string");
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
