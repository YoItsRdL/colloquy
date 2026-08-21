/**
 * The model label rule (TKT-0102).
 *
 * One rule with judgement in it: dropping the provider's name from the front of a model
 * id. "Gemini" beside "gemini-flash-latest" says gemini twice, and the repetition is the
 * loudest thing in a row whose only real action is Send.
 *
 * Tested because it is a guess about naming, and naming changes under it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { shorten } from "./src/label.js";

const gemini = { name: "gemini", label: "Gemini" };
const anthropic = { name: "anthropic", label: "Claude" };
const openai = { name: "openai", label: "ChatGPT" };
const deepseek = { name: "deepseek", label: "DeepSeek" };

test("the provider's own name is dropped from the front", () => {
  assert.equal(shorten("gemini-flash-latest", gemini), "flash-latest");
  assert.equal(shorten("deepseek-v4-flash", deepseek), "v4-flash");
});

test("the label counts too, not only the adapter name", () => {
  // Claude models are named after the product, not the company that serves them.
  assert.equal(shorten("claude-sonnet-5", anthropic), "sonnet-5");
});

test("an id that does not repeat the provider is left alone", () => {
  assert.equal(shorten("gpt-5", openai), "gpt-5");
  assert.equal(shorten("o3-mini", openai), "o3-mini");
});

test("a version number is never mistaken for a prefix", () => {
  assert.equal(shorten("gemini-2.5-pro", gemini), "2.5-pro");
});

test("only a whole leading segment is dropped", () => {
  // "geminix-1" starts with the letters but is a different family, and truncating it
  // would rename someone else's model.
  assert.equal(shorten("geminix-1", gemini), "geminix-1");
});

test("nothing is dropped when it would leave an empty label", () => {
  // A chip reading "" tells you less than one repeating the provider.
  assert.equal(shorten("gemini", gemini), "gemini");
  assert.equal(shorten("gemini-", gemini), "gemini-");
});

test("a provider without a label or name is survivable", () => {
  assert.equal(shorten("some-model", {}), "some-model");
  assert.equal(shorten("some-model", undefined), "some-model");
});
