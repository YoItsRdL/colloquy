/**
 * The settings that are not secret, kept where a clone can find them (ADR-0015).
 *
 * These exist because of a real morning: a vault was cloned to a second machine, the
 * plugin came back with its code and none of its configuration, and it spent the next
 * hour writing conversations into a folder nobody had chosen while reporting that it knew
 * nothing about the person using it. The rule underneath every test here is that the file
 * this writes must never be worth protecting.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHARED, sharedOf, readShared, writeShared } from "./src/preferences.js";

const SETTINGS = {
  provider: "ollama",
  model: "gemma3:4b",
  folders: { conversations: "00-inbox", context: "60-log/conversations" },
  autoName: true,
  autoRead: true,
  useMemory: true,
  keys: { OPENAI_API_KEY: "sk-test", OLLAMA_URL: "http://localhost:11434/v1" },
};

/** An adapter that is a Map, which is all of Obsidian this needs. */
const adapterOver = (files = new Map()) => ({
  files,
  async read(path) {
    if (!files.has(path)) throw new Error("ENOENT");
    return files.get(path);
  },
  async write(path, text) { files.set(path, text); },
});

/**
 * The one rule the whole file exists to keep. An allowlist that grew a key by accident
 * would commit it, and the gate cannot catch that: the store lives in whichever vault this
 * is installed into and is not in this repository to be scanned.
 */
test("the mirror carries no key, whatever else it carries", () => {
  assert.equal(SHARED.includes("keys"), false, "not by name");
  assert.equal(Object.hasOwn(sharedOf(SETTINGS), "keys"), false, "and not in what is written");

  const written = JSON.stringify(sharedOf(SETTINGS));
  assert.ok(!written.includes("sk-test"), "nor by any other route");
  assert.ok(!written.includes("OPENAI_API_KEY"), "nor the shape of one");
});

/**
 * The address of a local server is configuration, not a secret, but it lives among the
 * keys and travels with them. Mirroring it would put one machine's localhost on another.
 */
test("an address stored among the keys stays with the keys", () => {
  assert.ok(!JSON.stringify(sharedOf(SETTINGS)).includes("11434"));
});

test("what is mirrored is what a clone needs to behave the same", () => {
  assert.deepEqual(sharedOf(SETTINGS), {
    provider: "ollama",
    model: "gemma3:4b",
    folders: { conversations: "00-inbox", context: "60-log/conversations" },
    autoName: true,
    autoRead: true,
    useMemory: true,
  });
});

/** A setting nobody has set is not a setting, and writing null for it would make it one. */
test("nothing is invented for a field that was never set", () => {
  assert.deepEqual(sharedOf({ provider: "ollama" }), { provider: "ollama" });
  assert.deepEqual(sharedOf({}), {});
  assert.deepEqual(sharedOf(undefined), {});
});

test("a mirror written on one machine is read back on the next", async () => {
  const adapter = adapterOver();
  await writeShared(adapter, "prefs.json", SETTINGS);

  assert.deepEqual(await readShared(adapter, "prefs.json"), sharedOf(SETTINGS));
});

/**
 * Every failure is the same failure and none is worth a message: the answer in all of them
 * is to carry on with the defaults, which is what a vault with no file at all does.
 */
test("an absent, unreadable or half-written mirror is simply no mirror", async () => {
  assert.deepEqual(await readShared(adapterOver(), "missing.json"), {});

  const damaged = adapterOver(new Map([["half.json", '{"provider": "oll']]));
  assert.deepEqual(await readShared(damaged, "half.json"), {});

  const wrong = adapterOver(new Map([["list.json", '["provider"]']]));
  assert.deepEqual(await readShared(wrong, "list.json"), {}, "valid JSON of the wrong shape");
});

/** A key pasted into the file by hand is not read back either, in or out of the allowlist. */
test("what is read back is filtered too, not trusted for having been on disk", async () => {
  const meddled = adapterOver(new Map([["prefs.json", JSON.stringify({ provider: "ollama", keys: { OPENAI_API_KEY: "sk-test" } })]]));

  assert.deepEqual(await readShared(meddled, "prefs.json"), { provider: "ollama" });
});

/**
 * The store is the live local copy. A mirror that overrode it would mean a setting changed
 * on this machine losing to one committed months ago on another.
 */
test("a write that fails costs the copy, never the setting", async () => {
  const readOnly = { async read() { throw new Error("ENOENT") }, async write() { throw new Error("EACCES") } };

  assert.equal(await writeShared(readOnly, "prefs.json", SETTINGS), false, "says so");
  await assert.doesNotReject(() => writeShared(readOnly, "prefs.json", SETTINGS), "but never throws");
});
