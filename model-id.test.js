/**
 * The model id validator (TKT-0109).
 *
 * Thirty lines with no test, which refused every Ollama model — `qwen3:4b` was rejected
 * before a request was ever made, and it took running the thing to find out. This is the
 * cheapest test in the project and it should have existed first.
 *
 * The id is the one caller-supplied string that reaches a provider URL, so what it may
 * not contain is the security property, not a formatting preference.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeModelId, SAFE_ID } from "./src/providers/model-id.js";

test("the ids every provider actually uses are accepted", () => {
  for (const id of [
    "gemini-flash-latest",
    "gemini-2.5-pro",
    "claude-sonnet-5",
    "gpt-5",
    "deepseek-v4-flash",
    "qwen3:4b",          // the one that was refused
    "gemma3:27b-it-q4_K_M",
  ]) {
    assert.equal(safeModelId(id), id, id);
  }
});

test("nothing that could change where a request goes is allowed", () => {
  // A path separator could traverse, and a query separator could append parameters to a
  // provider's URL. These are the reason this function exists.
  for (const bad of [
    "../../etc/passwd",
    "models/../admin",
    "model?key=stolen",
    "model&alt=sse",
    "model#fragment",
    "model with spaces",
    "model\nInjected: header",
    "http://elsewhere.test/model",
  ]) {
    assert.throws(() => safeModelId(bad), /unusable model id/, JSON.stringify(bad));
  }
});

test("an absent id is refused before it can become the string 'undefined'", () => {
  for (const nothing of ["", "   ", null, undefined]) {
    assert.throws(() => safeModelId(nothing), /no model specified/, JSON.stringify(nothing));
  }
});

test("an implausibly long id is refused", () => {
  assert.throws(() => safeModelId("a".repeat(101)), /implausibly long/);
});

test("surrounding whitespace is trimmed rather than refused", () => {
  assert.equal(safeModelId("  gpt-5  "), "gpt-5");
});

test("the exported pattern is the same rule adapters filter listings by", () => {
  // Adapters use SAFE_ID to drop ids they would not be allowed to send. If it disagreed
  // with the validator, a menu would offer a model that fails on selection.
  assert.equal(SAFE_ID.test("qwen3:4b"), true);
  assert.equal(SAFE_ID.test("model?key=x"), false);
});
