/**
 * An image on the wire, three ways (ADR-0011).
 *
 * Each API wants a different shape and none of them says so politely. A wrong shape comes
 * back as a generic 400, or worse, as an answer that quietly ignored the picture. These
 * assert the shapes against each provider's documented form.
 *
 * The other half is what happens when there is no image: the content must stay a bare
 * string. That is what all of these accepted before images existed, and wrapping every
 * ordinary turn in an array to serve the few that carry a picture would change every
 * request in the plugin.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as openai from "./src/providers/openai.js";
import * as anthropic from "./src/providers/anthropic.js";
import * as gemini from "./src/providers/gemini.js";

const PICTURE = { mime: "image/png", data: "iVBORw0KGgo=" };

/** Catches the request without making one, so these run with no network and no keys. */
function capture(run) {
  const real = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, options) => {
    sent = { url, body: JSON.parse(options.body) };
    throw new Error("captured");
  };
  return run().catch(() => {}).finally(() => { globalThis.fetch = real }).then(() => sent);
}

const ask = (text, images) => ({ model: "m", key: "k", messages: [{ role: "user", text, images }] });

test("openai sends the words first, then the image as a data URI", async () => {
  const sent = await capture(() => openai.complete(ask("what is this?", [PICTURE])));
  const content = sent.body.messages[0].content;

  assert.deepEqual(content[0], { type: "text", text: "what is this?" });
  assert.equal(content[1].type, "image_url");
  assert.equal(content[1].image_url.url, "data:image/png;base64,iVBORw0KGgo=");
});

/** This API's own advice: the picture reads better to the model when it is already there. */
test("anthropic sends the image first, as a base64 source block", async () => {
  const sent = await capture(() => anthropic.complete(ask("what is this?", [PICTURE])));
  const content = sent.body.messages[0].content;

  assert.deepEqual(content[0], {
    type: "image",
    source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" },
  });
  assert.deepEqual(content[1], { type: "text", text: "what is this?" });
});

test("gemini sends it as an inline part", async () => {
  const sent = await capture(() => gemini.complete(ask("what is this?", [PICTURE])));
  const parts = sent.body.contents[0].parts;

  assert.deepEqual(parts[0], { inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } });
  assert.deepEqual(parts[1], { text: "what is this?" });
});

/**
 * The shape every one of these accepted before images existed. A one-element array instead
 * would change every request the plugin makes to serve the few that carry a picture.
 */
test("a turn with no image is still a plain string", async () => {
  const sent = await capture(() => openai.complete(ask("just words")));
  assert.equal(sent.body.messages[0].content, "just words");

  const claude = await capture(() => anthropic.complete(ask("just words")));
  assert.equal(claude.body.messages[0].content, "just words");
});

test("an empty image list is the same as none", async () => {
  const sent = await capture(() => openai.complete(ask("just words", [])));
  assert.equal(sent.body.messages[0].content, "just words");
});

test("more than one image goes in the order it was attached", async () => {
  const second = { mime: "image/jpeg", data: "/9j/4AAQ" };
  const sent = await capture(() => openai.complete(ask("compare these", [PICTURE, second])));
  const content = sent.body.messages[0].content;

  assert.equal(content.length, 3);
  assert.match(content[1].image_url.url, /^data:image\/png/);
  assert.match(content[2].image_url.url, /^data:image\/jpeg/);
});
