/**
 * A provider configured by an address rather than a secret (TKT-0105).
 *
 * Ollama has no API key. Everything here gated on having one, so the interesting
 * assertions are about the seam that had to widen — and about the property that must not
 * widen with it: a secret is still never handed back to the interface.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { keysOf, status } from "./src/keys.js";
import { all as allAdapters, resolve as resolveProvider } from "./src/providers/index.js";
import { buildConfig } from "./src/config.js";

const ollama = resolveProvider("ollama");

test("it declares an address, not a key", () => {
  assert.equal(ollama.keyKind, "url");
  assert.match(ollama.defaultKey, /^http:\/\/localhost:11434/);
  assert.ok(ollama.keyHint, "and says what the field wants, in words");
});

test("it is usable with nothing typed", () => {
  // The address is right often enough that asking for it first would be ceremony — and a
  // provider that needs no account should not need a setup step to prove it.
  const keys = keysOf({ keys: {} }, allAdapters());
  assert.equal(keys.OLLAMA_URL, ollama.defaultKey);

  const shown = status(allAdapters(), { keys: {} }).find((k) => k.name === "ollama");
  assert.equal(shown.configured, true);
});

test("a typed address wins over the default", () => {
  const keys = keysOf({ keys: { OLLAMA_URL: "http://box:11434/v1" } }, allAdapters());
  assert.equal(keys.OLLAMA_URL, "http://box:11434/v1");
});

test("the address is shown, and a key never is", () => {
  // Seeing the URL is how you notice it points at the wrong machine. Seeing a key is how
  // a secret ends up on a screen, which ADR-0004 refuses.
  const settings = { keys: { GEMINI_API_KEY: "super-secret-value", OLLAMA_URL: "http://box:11434/v1" } };
  const shown = JSON.stringify(status(allAdapters(), settings));

  assert.ok(!shown.includes("super-secret-value"), "no secret comes back");
  assert.ok(shown.includes("http://box:11434/v1"), "the address does");
});

test("it can be the provider a turn runs against", () => {
  const config = buildConfig({ provider: "ollama" }, keysOf({ keys: {} }, allAdapters()));
  assert.equal(config.provider.name, "ollama");
  assert.equal(config.key, ollama.defaultKey, "the address is what reaches the adapter");
  assert.equal(config.model, ollama.defaultModel);
});

/**
 * There was a test here about whether a local server with nothing listening should be
 * offered as an alternative when another provider refused. There are no alternatives any
 * more (ADR-0009): the chips name one provider, that provider answers or says why.
 */
test("a local provider is configured even when nothing is listening", () => {
  // Whether anything is running is only knowable by asking, and that is the turn's job.
  // What this screen can say is whether an address has been set, which it has.
  const config = buildConfig({ provider: "ollama" }, keysOf({ keys: {} }, allAdapters()));
  assert.equal(config.key, ollama.defaultKey);
});
