/**
 * Proves the seam, without a network call or a real key (ADR-0001, TKT-0001).
 *
 * Until a second real provider exists, the stub adapter is the only evidence that
 * "provider-agnostic" is more than an assertion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, available } from "./src/providers/index.js";

test("resolves a known provider", () => {
  const p = resolve("stub");
  assert.equal(p.name, "stub");
  assert.ok(p.defaultModel, "adapter declares a default model");
  assert.ok(p.keyVar, "adapter declares which environment variable holds its key");
  assert.equal(typeof p.complete, "function");
});

test("every adapter satisfies the same contract", () => {
  for (const name of available()) {
    const p = resolve(name);
    for (const field of ["name", "defaultModel", "keyVar"]) {
      assert.equal(typeof p[field], "string", `${name}.${field} is a string`);
    }
    assert.equal(typeof p.complete, "function", `${name}.complete is a function`);
  }
});

test("an unknown provider fails loudly, and lists the real ones", () => {
  assert.throws(() => resolve("nope"), (err) => {
    assert.match(err.message, /unknown provider/);
    assert.match(err.message, /stub/, "the message names what is available");
    return true;
  });
});

test("completes through the neutral message shape", async () => {
  const p = resolve("stub");
  const reply = await p.complete({
    model: p.defaultModel,
    messages: [{ role: "user", text: "hello" }],
    key: "not-a-real-key",
  });
  assert.match(reply, /hello/);
});

test("a provider failure throws rather than returning empty text", async () => {
  const p = resolve("stub");
  await assert.rejects(
    () => p.complete({ model: p.defaultModel, messages: [{ role: "user", text: "!fail" }], key: "x" }),
    /deliberate failure/
  );
});

test("no adapter leaks its key into an error", async () => {
  const secret = "sk-should-never-appear-anywhere";
  const p = resolve("stub");
  try {
    await p.complete({ model: p.defaultModel, messages: [{ role: "user", text: "!fail" }], key: secret });
    assert.fail("expected a rejection");
  } catch (err) {
    assert.ok(!String(err.message).includes(secret), "the key is absent from the error");
  }
});
