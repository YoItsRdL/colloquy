/**
 * Noticing what a conversation was about (ADR-0007).
 *
 * The rules here exist because the prompt alone does not hold. A small model asked for a
 * first-person account will still hand back "The conversation outlines…", that exact
 * sentence is what this replaced, so the voice is checked rather than requested.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readContext, inspect, observeConversation } from "./src/observe.js";

const said = (context) => JSON.stringify({ context });
const GOOD = "We were weighing local models against Claude, mostly on cost. You would rather not spend more on API credits.";

test("a first-person account survives intact", () => {
  assert.equal(readContext(said(GOOD)), GOOD);
});

test("nothing to record is an answer, and not the same as no answer", () => {
  assert.equal(readContext(said("")), "");
  assert.equal(readContext("I could not find anything, sorry."), null);
  assert.equal(readContext(""), null);
  assert.equal(readContext(null), null);
  assert.equal(readContext('{"notes":[]}'), null, "the right shape, or nothing");
});

/**
 * Taken verbatim from what the old claim-extraction produced, which is the reason this
 * whole thing changed shape: an account written from outside describes a transcript, and a
 * system learning about us gains nothing from a description of a transcript.
 */
test("an account written from outside the conversation is refused", () => {
  for (const outside of [
    "The conversation clearly outlines the key differences between Qwen3 and Claude 3.",
    "This discussion establishes that trains beat buses.",
    "The user was asking about self-hosting local models.",
    "This exchange covers vault design.",
  ]) {
    assert.equal(readContext(said(outside)), null, outside);
  }
});

/**
 * Someone who was there can still refer to the thing they were in. Rejecting the phrase
 * outright threw away a genuinely good record for the sentence "we ultimately guided the
 * conversation towards…", which is exactly the voice this is trying to get.
 */
test("mentioning the conversation is fine; writing from outside it is not", () => {
  const inside = "We were comparing two models, and we guided the conversation towards cost.";
  assert.equal(readContext(said(inside)), inside);

  const outside = "The conversation covers two models. We looked at cost.";
  assert.equal(readContext(said(outside)), null, "the giveaway is where the sentence starts");
});

test("an account that never mentions us is not about us", () => {
  assert.equal(readContext(said("Qwen3 has an earlier training cutoff than Claude 3.")), null);
  assert.equal(readContext(said("Local models are cheaper to run.")), null);
});

test("second person counts as much as first", () => {
  const yours = "You would rather not spend more on API credits, so local models it is.";
  assert.equal(readContext(said(yours)), yours);
});

test("prose and code fences around the JSON cost nothing", () => {
  assert.equal(readContext("Sure!\n```json\n" + said(GOOD) + "\n```\nHope that helps."), GOOD);
});

test("a reasoning model's monologue is not part of the answer", () => {
  assert.equal(readContext(`<think>Hmm, {"context":""} would be safe.</think>${said(GOOD)}`), GOOD);
});

/** The prompt shows the model an example to copy, so it is the likeliest wrong answer. */
test("the format restated before the answer does not become the answer", () => {
  const echoed = `Format: ${said("We were ...")}\n\nHere is the real one:\n${said(GOOD)}`;
  assert.equal(readContext(echoed), GOOD);
});

test("an account long enough to be a summary is refused", () => {
  assert.equal(readContext(said(`We ${"talked about things ".repeat(90)}`)), null);
});

/**
 * This runs unattended, so one line on the settings screen is the only evidence anybody
 * ever gets that it is unhappy. "Could not read it", on repeat, tells you nothing you can
 * act on, which rule refused it does.
 */
test("a refusal says which rule refused it", () => {
  assert.match(inspect("no json here at all").why, /format/i);
  assert.match(inspect(said("The conversation covers two models.")).why, /outside/i);
  assert.match(inspect(said("Local models are cheaper.")).why, /never mentions us/i);
  assert.match(inspect(said(`We ${"talked about things ".repeat(90)}`)).why, /summary/i);

  assert.equal(inspect(said(GOOD)).why, null, "and a good account has nothing to explain");
  assert.equal(inspect(said("")).why, null, "nor does an honest 'nothing here'");
});

const model = (reply) => ({
  model: "gemma3:4b",
  key: "k",
  provider: { complete: async () => (reply instanceof Error ? Promise.reject(reply) : reply) },
});

test("the conversation reaches the model chosen in the chips", async () => {
  let saw;
  const spy = { model: "gemma3:4b", key: "k", provider: { complete: async (o) => { saw = o; return said(GOOD) } } };
  await observeConversation(spy, "a conversation about trains");

  assert.equal(saw.model, "gemma3:4b");
  assert.match(saw.messages[0].text, /a conversation about trains/);
  assert.match(saw.messages[0].text, /first person/i, "and the instruction that matters goes with it");
});

test("a provider failure is raised, never recorded as an uneventful conversation", async () => {
  await assert.rejects(() => observeConversation(model(new Error("ollama is not running")), "text"), /not running/);
  await assert.rejects(() => observeConversation({}, "text"), /no model is configured/);
});
