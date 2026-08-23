/**
 * The key store (ADR-0004, TKT-0003).
 *
 * Keys live in Obsidian's plugin data, which is the native place and the only one a phone
 * can reach. That directory is tracked in this repository, so the assertions worth having
 * are the ones about what never leaves the store and what happens to an existing setup.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { keysOf, status, setKey, KeyError } from "./src/keys.js";

const adapters = [
  { name: "one", label: "One", keyVar: "ONE_API_KEY" },
  { name: "two", label: "Two", keyVar: "TWO_API_KEY" },
  { name: "keyless", label: "Keyless" },
];

test("status says whether a key exists, never what it is", () => {
  const settings = { keys: { ONE_API_KEY: "super-secret-value" } };
  const shown = status(adapters, settings);

  assert.ok(!JSON.stringify(shown).includes("super-secret-value"), "no value, by construction");
  assert.equal(shown.find((k) => k.keyVar === "ONE_API_KEY").configured, true);
  assert.equal(shown.find((k) => k.keyVar === "TWO_API_KEY").configured, false);
});

test("a provider with no key variable is not offered a field", () => {
  assert.ok(!status(adapters, {}).some((k) => k.name === "keyless"));
});

test("saving keeps other keys untouched", () => {
  const settings = { keys: { ONE_API_KEY: "first" } };
  setKey(settings, "TWO_API_KEY", "second");
  assert.deepEqual(settings.keys, { ONE_API_KEY: "first", TWO_API_KEY: "second" });
});

test("an empty value removes the key rather than storing emptiness", () => {
  // A stored empty string would read as configured everywhere that checks truthiness.
  const settings = { keys: { ONE_API_KEY: "first" } };
  setKey(settings, "ONE_API_KEY", "");
  assert.deepEqual(settings.keys, {});
});

test("a value with whitespace in it is refused", () => {
  // The usual damage from a copy-paste, and it otherwise fails much later with an error
  // that says nothing about why.
  for (const bad of ["has space", "trailing\nnewline", "tab\there"]) {
    assert.throws(() => setKey({ keys: {} }, "ONE_API_KEY", bad), KeyError, bad);
  }
});

test("surrounding whitespace is trimmed rather than refused", () => {
  const settings = { keys: {} };
  setKey(settings, "ONE_API_KEY", "  a-real-key  ");
  assert.equal(settings.keys.ONE_API_KEY, "a-real-key");
});

test("an unusable variable name is refused", () => {
  for (const bad of ["", "lower_case", "HAS SPACE", "DOT.NAME", "1LEADING"]) {
    assert.throws(() => setKey({ keys: {} }, bad, "x"), KeyError, `${bad} refused`);
  }
});

test("keysOf hands back a copy, so a turn cannot mutate the store", () => {
  const settings = { keys: { ONE_API_KEY: "first" } };
  const taken = keysOf(settings);
  taken.ONE_API_KEY = "changed";
  assert.equal(settings.keys.ONE_API_KEY, "first");
});

/**
 * An address is not a secret, so a provider that names its own default is configured
 * without anyone typing it — but only where that default could be true (ADR-0012).
 */
const local = [{ name: "ollama", label: "Ollama", keyVar: "OLLAMA_URL", keyKind: "url", defaultKey: "http://localhost:11434/v1" }];

test("a local provider is configured by its own default, without ceremony", () => {
  const keys = keysOf({ keys: {} }, local, { mobile: false });

  assert.equal(keys.OLLAMA_URL, "http://localhost:11434/v1");
});

/**
 * Nothing listens on a phone's own localhost. Assuming it there names a provider on the
 * chip that cannot answer, and fails every question with advice — start the server — that
 * cannot be taken on that device.
 */
test("on a phone the local default is not assumed", () => {
  const keys = keysOf({ keys: {} }, local, { mobile: true });

  assert.equal(keys.OLLAMA_URL, undefined, "so nothing claims to be configured that is not");
});

/** The case that matters on a phone: Ollama on a desktop, reached over the network. */
test("on a phone an address typed in by hand is still used", () => {
  const keys = keysOf({ keys: { OLLAMA_URL: "http://192.168.1.4:11434/v1" } }, local, { mobile: true });

  assert.equal(keys.OLLAMA_URL, "http://192.168.1.4:11434/v1");
});
