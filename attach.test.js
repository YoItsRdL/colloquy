/**
 * Asking about something in your vault (ADR-0011).
 *
 * Two kinds, because they are genuinely different problems: a note folds into the question
 * and every provider reads it without knowing anything happened, while an image has to
 * reach the wire in whatever shape that provider expects.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { kindOf, mimeOf, refuse, asTurn, asLinks, MAX_IMAGE_BYTES, MAX_TEXT_CHARS } from "./src/attach.js";

const note = (name, text) => ({ kind: "text", name, path: name, text });
const image = (name) => ({ kind: "image", name, path: name, mime: mimeOf(name), data: "AAAA" });

test("what a model can read is what can be attached", () => {
  assert.equal(kindOf("diagram.png"), "image");
  assert.equal(kindOf("PHOTO.JPEG"), "image");
  assert.equal(kindOf("a-note.md"), "text");
  assert.equal(kindOf("data.csv"), "text");
  assert.equal(kindOf("script.py"), "text");
});

test("anything else is refused rather than sent and ignored", () => {
  assert.equal(kindOf("recording.mp3"), null);
  assert.equal(kindOf("archive.zip"), null);
  assert.equal(kindOf("paper.pdf"), null, "not yet. A PDF needs extracting, not encoding");
  assert.match(refuse({ name: "recording.mp3", size: 10 }), /not a kind of file/);
});

/** Said in the words of the thing refused, not as a code. The size is the whole point. */
test("an image too large to send says how large it is", () => {
  const why = refuse({ name: "screenshot.png", size: MAX_IMAGE_BYTES + 1 });
  assert.match(why, /screenshot\.png/);
  assert.match(why, /4MB/);
  assert.equal(refuse({ name: "screenshot.png", size: MAX_IMAGE_BYTES }), null, "the limit itself is allowed");
});

test("a note has no size limit of its own, only a length one", () => {
  assert.equal(refuse({ name: "huge.md", size: 99 * 1024 * 1024 }), null);
});

test("a question with nothing attached is the question", () => {
  const turn = asTurn("what is this?");
  assert.equal(turn.text, "what is this?");
  assert.deepEqual(turn.images, []);
});

/**
 * Named and fenced, so the model is told which file it is reading and where it stops.
 * Pasted in bare, two notes become one run-on document.
 */
test("a note is folded into the question, named and bounded", () => {
  const turn = asTurn("what does this say?", [note("staleness.md", "Usage signals beat elapsed time.")]);
  assert.match(turn.text, /^--- staleness\.md ---$/m);
  assert.match(turn.text, /Usage signals beat elapsed time\./);
  assert.match(turn.text, /^--- end ---$/m);
  assert.ok(turn.text.endsWith("what does this say?"), "and the question comes last");
});

test("several notes stay separate", () => {
  const turn = asTurn("compare these", [note("a.md", "first"), note("b.md", "second")]);
  assert.equal((turn.text.match(/^--- /gm) ?? []).length, 4, "two openings and two closings");
});

/** A note that stops mid-sentence reads as a note that ends there, unless it says so. */
test("a note too long to send says where it was cut", () => {
  const turn = asTurn("what does this say?", [note("long.md", "x".repeat(MAX_TEXT_CHARS + 500))]);
  assert.match(turn.text, /continues beyond what was sent/);
  assert.ok(turn.text.length < MAX_TEXT_CHARS + 500);
});

test("an image travels beside the words, never inside them", () => {
  const turn = asTurn("what is in this picture?", [image("diagram.png")]);
  assert.equal(turn.text, "what is in this picture?");
  assert.deepEqual(turn.images, [{ mime: "image/png", data: "AAAA" }]);
});

test("notes and images together each go their own way", () => {
  const turn = asTurn("explain", [note("a.md", "text here"), image("b.jpg")]);
  assert.match(turn.text, /text here/);
  assert.equal(turn.images.length, 1);
  assert.equal(turn.images[0].mime, "image/jpeg");
});

/**
 * Links, not copies. The file is already in the vault, and Obsidian renders an embedded
 * image from a wikilink without this having to store a second one.
 */
test("the transcript records what was asked about, as links", () => {
  assert.equal(asLinks([image("diagram.png"), note("staleness.md", "x")]),
    "![[diagram.png]]\n[[staleness.md]]");
  assert.equal(asLinks([]), "");
});
