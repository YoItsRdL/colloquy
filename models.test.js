/**
 * The model list (ADR-0005, TKT-0602).
 *
 * The important assertions are about what the listing cannot know. A provider describes
 * `gemini-2.5-pro` as a stable release right up until it returns "no longer available to
 * new users", and a text-to-speech model advertises `generateContent` identically to a
 * chat model. So the list is filtered by a heuristic that must stay narrow, and
 * corrected by what has actually failed.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { listModels, listAll, markBroken, isBroken, forgetModels, defaultModelFor } from "./src/models.js";

const configWith = (models, { model = "chosen-model" } = {}) => ({
  model,
  key: "not-real",
  provider: {
    name: "test",
    defaultModel: "fallback",
    models: async () => models,
  },
});

beforeEach(() => forgetModels());

test("the configured model is always present, and first", async () => {
  // It may be too new to appear in a provider's own list, and a menu that omits what is
  // currently running is broken.
  const models = await listModels(configWith([{ id: "other" }]));
  assert.equal(models[0].id, "chosen-model");
  assert.equal(models.length, 2);
});

/**
 * The bug that made this a rule: Ollama's `defaultModel` is `qwen3:4b`, a constant in
 * source rather than anything on the disk. Seeding it into the menu offered a model that
 * was not installed, above the two that were, ticked as the one in use. Clicking it wrote
 * it to the vault, and every turn after that asked for a model Ollama does not have.
 */
test("an adapter whose listing is the whole truth is not seeded with the configured model", async () => {
  const config = configWith([{ id: "gemma3:1b" }, { id: "gemma3:4b" }], { model: "qwen3:4b" });
  config.provider.listsEverything = true;

  const models = await listModels(config);
  assert.deepEqual(models.map((m) => m.id), ["gemma3:1b", "gemma3:4b"]);
});

/**
 * The chip and the turn must agree, and an adapter's `defaultModel` is the place they
 * stopped agreeing: a constant in source cannot know what is on the disk. Both sides ask
 * this, so neither can guess separately.
 */
test("a local provider's default is the first model it actually has", async () => {
  const config = configWith([{ id: "gemma3:1b" }, { id: "gemma3:4b" }], { model: null });
  config.provider.listsEverything = true;
  config.provider.defaultModel = "qwen3:4b";

  assert.equal(await defaultModelFor(config), "gemma3:1b", "not the constant, which is not installed");
});

test("a hosted provider keeps its constant, whose listing is hundreds long and unordered", async () => {
  const config = configWith([{ id: "gpt-4o" }, { id: "gpt-5" }], { model: null });
  config.provider.defaultModel = "gpt-5";

  assert.equal(await defaultModelFor(config), "gpt-5");
});

/** A default that needs the network to exist is not a default. */
test("a local provider that cannot be reached falls back to the constant", async () => {
  const config = configWith([], { model: null });
  config.provider.listsEverything = true;
  config.provider.defaultModel = "qwen3:4b";
  config.provider.models = async () => { throw new Error("connection refused") };

  assert.equal(await defaultModelFor(config), "qwen3:4b");
});

test("an adapter without models() reports its default alone", async () => {
  const models = await listModels({
    model: "fallback",
    key: "k",
    provider: { name: "bare", defaultModel: "fallback" },
  });
  assert.deepEqual(models, [{ id: "fallback" }], "one option, not an empty menu");
});

test("results are cached. A menu open does not spend a request", async () => {
  let calls = 0;
  const config = {
    model: "m",
    key: "k",
    provider: { name: "counted", defaultModel: "m", models: async () => { calls++; return [{ id: "m" }]; } },
  };
  await listModels(config);
  await listModels(config);
  await listModels(config);
  assert.equal(calls, 1);
});

test("models that cannot hold a conversation are filtered out", async () => {
  const models = await listModels(configWith([
    { id: "chat-model" },
    { id: "gemini-2.5-flash-preview-tts" },
    { id: "text-embedding-004" },
    { id: "imagen-3.0" },
  ]));
  const ids = models.map((m) => m.id);
  assert.ok(ids.includes("chat-model"));
  for (const hidden of ["gemini-2.5-flash-preview-tts", "text-embedding-004", "imagen-3.0"]) {
    assert.ok(!ids.includes(hidden), `${hidden} is not offered`);
  }
});

test("the heuristic never hides the model actually in use", async () => {
  // Wrong in the recoverable direction: a hidden model can still be requested with
  // GATEWAY_MODEL, and if someone did, the menu must not erase it.
  const models = await listModels(configWith([{ id: "other" }], { model: "some-tts" }));
  assert.equal(models[0].id, "some-tts", "the running model survives its own filter");
});

test("a version number is not mistaken for a modality", async () => {
  const models = await listModels(configWith([
    { id: "model-3-image-preview" },   // an image model, hidden
    { id: "model-3.5-turbo" },         // a version, kept
    { id: "claude-sonnet-5" },
  ]));
  const ids = models.map((m) => m.id);
  assert.ok(!ids.includes("model-3-image-preview"));
  assert.ok(ids.includes("model-3.5-turbo"));
  assert.ok(ids.includes("claude-sonnet-5"));
});

test("a model that failed is dropped from the menu", async () => {
  const config = configWith([{ id: "works" }, { id: "refused" }]);
  assert.ok((await listModels(config)).some((m) => m.id === "refused"));

  markBroken("test", "refused", "test 404: no longer available to new users");

  const after = await listModels(config);
  assert.ok(!after.some((m) => m.id === "refused"), "observing beats predicting");
  assert.ok(after.some((m) => m.id === "works"), "and the rest are untouched");
});

test("the reason a model was dropped is retrievable", () => {
  markBroken("test", "gone", "test 404: no longer available to new users");
  assert.match(isBroken("test", "gone"), /no longer available/);
  assert.equal(isBroken("test", "fine"), undefined);
});

test("every provider with a key is listed, grouped and labelled", async () => {
  const config = {
    ...configWith([{ id: "chat" }]),
    provider: { name: "first", label: "First", defaultModel: "d", models: async () => [{ id: "chat" }] },
    alternatives: [{
      provider: { name: "other", label: "Other", defaultModel: "spare", models: async () => [{ id: "spare" }] },
      model: "spare",
      key: "k",
    }],
  };
  const groups = await listAll(config);
  assert.deepEqual(groups.map((g) => g.label), ["First", "Other"]);
  assert.ok(groups[1].models.some((m) => m.id === "spare"));
});

test("one provider failing to list does not empty the menu", async () => {
  // One option is more use than a menu that will not open.
  const config = {
    ...configWith([{ id: "chat" }]),
    alternatives: [{
      provider: {
        name: "down", label: "Down", defaultModel: "its-default",
        models: async () => { throw new Error("503"); },
      },
      model: "its-default",
      key: "k",
    }],
  };
  const groups = await listAll(config);
  assert.equal(groups.length, 2, "the failing provider is still offered");
  assert.deepEqual(groups[1].models, [{ id: "its-default" }]);
});

test("a provider without a key is not listed at all", async () => {
  const config = { ...configWith([{ id: "chat" }]), alternatives: [] };
  assert.equal((await listAll(config)).length, 1);
});

test("providers are asked concurrently, not one after another", async () => {
  // Sequential awaits cost the sum of every provider's latency for a menu someone is
  // waiting on. With four configured that is the difference between a pause and a wait.
  const slow = (name) => ({
    provider: {
      name, label: name, defaultModel: "d",
      models: async () => { await new Promise((r) => setTimeout(r, 60)); return [{ id: `${name}-m` }]; },
    },
    model: "d",
    key: "k",
  });
  const config = {
    model: "primary",
    key: "k",
    provider: { name: "first", label: "First", defaultModel: "d", models: async () => [{ id: "quick" }] },
    alternatives: [slow("a"), slow("b"), slow("c")],
  };

  const started = Date.now();
  const groups = await listAll(config);
  const took = Date.now() - started;

  assert.equal(groups.length, 4);
  assert.ok(took < 150, `three 60ms listings overlapped (took ${took}ms)`);
  assert.deepEqual(groups.map((g) => g.provider), ["first", "a", "b", "c"], "order kept");
});

test("models that are not conversational at all are filtered out", async () => {
  // A provider that lists a hundred entries mostly lists things that cannot hold a
  // conversation. Still modality names, never version numbers, see the heuristic.
  const listed = ["chat-5", "whisper-1", "dall-e-3", "omni-moderation-latest",
                  "chat-audio-preview", "chat-transcribe", "chat-realtime-preview"];
  const models = await listAll({
    model: "chat-5",
    key: "k",
    provider: { name: "p", label: "P", defaultModel: "chat-5", models: async () => listed.map((id) => ({ id })) },
    alternatives: [],
  });
  assert.deepEqual(models[0].models.map((m) => m.id), ["chat-5"]);
});
