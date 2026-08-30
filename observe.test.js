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

const said = (lately, about = "") => JSON.stringify({ lately, about });

/** Both halves as one string, which is what every rule about voice is judged on. */
const account = (raw) => {
  const context = readContext(raw);
  return context === null ? null : `${context.lately} ${context.about}`.trim();
};
const GOOD = "We were weighing local models against Claude, mostly on cost. You would rather not spend more on API credits.";

test("a first-person account survives intact", () => {
  assert.equal(account(said(GOOD)), GOOD);
});

test("nothing to record is an answer, and not the same as no answer", () => {
  assert.equal(account(said("")), "");
  assert.equal(account("I could not find anything, sorry."), null);
  assert.equal(account(""), null);
  assert.equal(account(null), null);
  assert.equal(account('{"notes":[]}'), null, "the right shape, or nothing");
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
    assert.equal(account(said(outside)), null, outside);
  }
});

/**
 * Someone who was there can still refer to the thing they were in. Rejecting the phrase
 * outright threw away a genuinely good record for the sentence "we ultimately guided the
 * conversation towards…", which is exactly the voice this is trying to get.
 */
test("mentioning the conversation is fine; writing from outside it is not", () => {
  const inside = "We were comparing two models, and we guided the conversation towards cost.";
  assert.equal(account(said(inside)), inside);

  const outside = "The conversation covers two models. We looked at cost.";
  assert.equal(account(said(outside)), null, "the giveaway is where the sentence starts");
});

test("an account that never mentions us is not about us", () => {
  assert.equal(account(said("Qwen3 has an earlier training cutoff than Claude 3.")), null);
  assert.equal(account(said("Local models are cheaper to run.")), null);
});

test("second person counts as much as first", () => {
  const yours = "You would rather not spend more on API credits, so local models it is.";
  assert.equal(account(said(yours)), yours);
});

test("prose and code fences around the JSON cost nothing", () => {
  assert.equal(account("Sure!\n```json\n" + said(GOOD) + "\n```\nHope that helps."), GOOD);
});

test("a reasoning model's monologue is not part of the answer", () => {
  assert.equal(account(`<think>Hmm, {"context":""} would be safe.</think>${said(GOOD)}`), GOOD);
});

/** The prompt shows the model an example to copy, so it is the likeliest wrong answer. */
test("the format restated before the answer does not become the answer", () => {
  const echoed = `Format: ${said("We were ...")}\n\nHere is the real one:\n${said(GOOD)}`;
  assert.equal(account(echoed), GOOD);
});

test("an account long enough to be a summary is refused", () => {
  assert.equal(account(said(`We ${"talked about things ".repeat(90)}`)), null);
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

/** A conversation as it is written to the vault, which is the only shape this ever sees. */
const TRANSCRIPT = `---
uid: 20260824T101500
---

# Which Card

**me** _(10:15)_

is a GTX 1070 enough for an 8B model?

**qwen3:8b** _(10:16)_

Yes, your GTX 1070 Ti handles qwen3:7b comfortably at 4-bit.
`;

test("the conversation reaches the model chosen in the chips", async () => {
  let saw;
  const spy = { model: "gemma3:4b", key: "k", provider: { complete: async (o) => { saw = o; return said(GOOD) } } };
  await observeConversation(spy, TRANSCRIPT);

  assert.equal(saw.model, "gemma3:4b");
  assert.match(saw.messages[0].text, /is a GTX 1070 enough for an 8B model\?/);
  assert.match(saw.messages[0].text, /first person/i, "and the instruction that matters goes with it");
});

/**
 * The loop this closes: an answer was summarised into something we had settled, handed to
 * the next conversation as background, agreed with, and summarised again. Nothing outside
 * it ever disagreed. Both errors below are real ones it produced (ADR-0013).
 */
test("what the model said is not read back, only what we said", async () => {
  let saw;
  const spy = { model: "gemma3:4b", key: "k", provider: { complete: async (o) => { saw = o; return said(GOOD) } } };
  await observeConversation(spy, TRANSCRIPT);

  const sent = saw.messages[0].text;
  assert.ok(!sent.includes("1070 Ti"), "a card we do not own");
  assert.ok(!sent.includes("qwen3:7b"), "a model that does not exist");
  assert.ok(!sent.includes("comfortably at 4-bit"), "nor anything else it asserted");
});

test("a conversation we never spoke in has nothing of ours to record", async () => {
  let asked = false;
  const spy = { model: "gemma3:4b", key: "k", provider: { complete: async () => { asked = true; return said("") } } };
  const { context, why } = await observeConversation(spy, "notes somebody pasted in, with no turns in them");

  assert.equal(asked, false, "there is nothing to ask about, so nothing is asked");
  assert.deepEqual(context, { lately: "", about: "" }, "looked, found nothing");
  assert.equal(why, null, "which is an answer, not a failure to get one");
});

/**
 * The fabrication this floor exists for. Asked to write two to four sentences about
 * "hello", gemma3:4b wrote two to four sentences: it invented a project, an approach and a
 * decision, and that account was handed to later conversations as background on somebody
 * who had said nothing. The prompt already allowed an empty reply and it was never taken.
 */
test("a greeting is never sent to be summarised", async () => {
  let asked = false;
  const invents = async () => { asked = true; return said("We were refining the initial parameters for the project.") };
  const spy = { model: "gemma3:4b", key: "k", provider: { complete: invents } };

  const greeting = "**me** _(21:19)_\n\nhello\n\n**me** _(21:20)_\n\nwhat do you know about me?\n";
  const { context, why } = await observeConversation(spy, greeting);

  assert.equal(asked, false);
  assert.deepEqual(context, { lately: "", about: "" });
  assert.equal(why, null, "marked read, so the same greeting is not re-read for ever");
});

test("a short real question is still worth an account", async () => {
  let asked = false;
  const spy = { model: "gemma3:4b", key: "k", provider: { complete: async () => { asked = true; return said(GOOD) } } };
  await observeConversation(spy, TRANSCRIPT);

  assert.equal(asked, true, "the floor separates greetings from short questions, not from short conversations");
});

test("a provider failure is raised, never recorded as an uneventful conversation", async () => {
  // A real transcript, because a greeting never reaches the provider at all.
  await assert.rejects(() => observeConversation(model(new Error("ollama is not running")), TRANSCRIPT), /not running/);
  await assert.rejects(() => observeConversation({}, TRANSCRIPT), /no model is configured/);
});

/**
 * The two halves have different lifespans: what we were doing on a Tuesday is worth a week,
 * what we work under is worth years. Kept apart so that reading them back can spend its
 * budget on the half that lasts.
 */
test("the two halves come back separately", () => {
  const both = inspect(JSON.stringify({
    lately: "We were pricing a graphics card against what it can still run.",
    about: "We work to a tight budget and prefer tools that stay cheap to run.",
  }));

  assert.equal(both.why, null);
  assert.match(both.context.lately, /pricing a graphics card/);
  assert.match(both.context.about, /tight budget/);
});

test("a conversation with nothing durable in it leaves that half empty", () => {
  const { context, why } = inspect(JSON.stringify({ lately: "We were checking a train time.", about: "" }));

  assert.equal(why, null);
  assert.equal(context.about, "", "not everything said is worth keeping for a year");
});

/** One half in the wrong voice is the account being written badly, not half an account. */
test("the voice is judged across both halves, not one at a time", () => {
  const { context, why } = inspect(JSON.stringify({
    lately: "We were comparing two models.",
    about: "The user prefers cheaper tools.",
  }));

  assert.equal(context, null);
  assert.match(why, /outside the conversation/);
});
