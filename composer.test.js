/**
 * The box you type in, and the row of controls under it (TKT-0102, ADR-0011).
 *
 * Two decisions here are worth holding still: Enter sends and Shift+Enter does not, which
 * is what everybody's hands already expect; and Send becomes Stop rather than going grey,
 * because a disabled control in the one place you are looking says only "wait".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { El } from "./test/obsidian.js";
import { createComposer } from "./src/composer.js";

function composerWith(handlers = {}) {
  const calls = { send: 0, stop: 0, attach: [] };
  const composer = createComposer(new El(), {
    onSend: () => { calls.send += 1; handlers.onSend?.(); },
    onStop: () => { calls.stop += 1; },
    onAttach: (event) => { calls.attach.push(event); },
  });
  return { composer, calls };
}

test("Enter sends, and does not also type a newline", () => {
  const { composer, calls } = composerWith();
  composer.input.value = "is it better by train?";

  const { defaultPrevented } = composer.input.press("Enter");

  assert.equal(calls.send, 1);
  assert.equal(defaultPrevented, true, "swallowed, or the question gains a blank line");
});

test("Shift+Enter types a newline and sends nothing", () => {
  const { composer, calls } = composerWith();

  const { defaultPrevented } = composer.input.press("Enter", { shiftKey: true });

  assert.equal(calls.send, 0);
  assert.equal(defaultPrevented, false, "left alone, so the box does what boxes do");
});

test("what is taken is trimmed, and clearing empties the box", () => {
  const { composer } = composerWith();
  composer.input.value = "   hello  \n";

  assert.equal(composer.take(), "hello");
  composer.clear();
  assert.equal(composer.input.value, "");
  assert.equal(composer.take(), "");
});

/**
 * The same control in the same place, doing the other job. A local model can take half a
 * minute to decide it has nothing useful to say, and the wait should feel like something
 * you are in rather than something happening to you.
 */
test("Send becomes Stop while an answer arrives, and stops rather than sending", () => {
  const { composer, calls } = composerWith();
  const button = composer.addSend();
  assert.equal(button.textContent, "Send");

  composer.sending(true, button);
  assert.equal(button.textContent, "Stop");
  button.click();
  assert.deepEqual([calls.send, calls.stop], [0, 1], "the same button, the other job");

  composer.sending(false, button);
  assert.equal(button.textContent, "Send");
  button.click();
  assert.deepEqual([calls.send, calls.stop], [1, 1]);
  assert.equal(button.disabled, false, "never greyed out");
});

test("the paperclip is named, and hands the event on so a menu can open at the pointer", () => {
  const { composer, calls } = composerWith();
  const button = composer.addAttach();

  assert.equal(button.getAttr("aria-label"), "Attach a note or an image");
  assert.equal(button.getAttr("data-icon"), "paperclip");

  button.click();
  assert.equal(calls.attach.length, 1);
});

// ── what is attached ─────────────────────────────────────────────────────────────

const chips = (composer) => composer.el.findAll((e) => e.hasClass("colloquy-attachment"));

test("each attachment gets a chip, named and removable", () => {
  const { composer } = composerWith();

  composer.showAttached([
    { name: "diagram.png", path: "a/diagram.png", kind: "image" },
    { name: "notes.md", path: "b/notes.md", kind: "note" },
  ], () => {});

  assert.deepEqual(chips(composer).map((c) => c.textContent.replace("×", "")), ["diagram.png", "notes.md"]);
  const [image, note] = chips(composer);
  assert.equal(image.find((e) => e.getAttr("data-icon"))?.getAttr("data-icon"), "image");
  assert.equal(note.find((e) => e.getAttr("data-icon"))?.getAttr("data-icon"), "file-text");
  assert.equal(image.button("×").getAttr("aria-label"), "Remove diagram.png");
});

test("removing one says which one, by position", () => {
  const { composer } = composerWith();
  const removed = [];
  const list = [{ name: "a.md", path: "a.md" }, { name: "b.md", path: "b.md" }, { name: "c.md", path: "c.md" }];

  composer.showAttached(list, (index) => removed.push(index));
  chips(composer)[1].button("×").click();

  assert.deepEqual(removed, [1]);
});

/**
 * Rebuilt rather than patched. The only two things that happen are "one more" and "not
 * that one", and rebuilding three chips is cheaper to be right about than tracking which
 * element belonged to which file.
 */
test("redrawing replaces the row rather than adding to it", () => {
  const { composer } = composerWith();

  composer.showAttached([{ name: "a.md", path: "a.md" }], () => {});
  composer.showAttached([{ name: "b.md", path: "b.md" }], () => {});

  assert.deepEqual(chips(composer).map((c) => c.textContent.replace("×", "")), ["b.md"]);
});

test("an empty row is marked empty, so it can take up no space", () => {
  const { composer } = composerWith();
  const row = composer.el.find((e) => e.hasClass("colloquy-attached"));

  composer.showAttached([{ name: "a.md", path: "a.md" }], () => {});
  assert.ok(row.hasClass("has-any"));

  composer.showAttached([], () => {});
  assert.ok(!row.hasClass("has-any"));
  assert.deepEqual(chips(composer), []);
});

/**
 * The one action is at the end of its line, always. It used to be put there by the filename
 * beside it absorbing the slack, which stopped being true when that moved to its own line.
 */
test("Send is the control the row ends on", () => {
  const { composer } = composerWith();
  composer.addAttach();
  const send = composer.addSend();

  assert.ok(send.hasClass("colloquy-send"), "named, so the stylesheet can anchor it");
  const buttons = composer.controls.findAll((e) => e.tagName === "button");
  assert.equal(buttons.at(-1), send, "and last in the row");
});

/** A screenshot is on the clipboard before it is anywhere else, so the box hands it on. */
test("a paste into the box is handed on, text and files alike", () => {
  const pasted = [];
  const composer = createComposer(new El(), { onSend: () => {}, onPaste: (event) => pasted.push(event) });

  composer.input.paste([{ name: "shot.png" }]);
  composer.input.paste([], "just some words");

  assert.equal(pasted.length, 2, "the decision about which is which is not the box's");
  assert.equal(pasted[0].clipboardData.files[0].name, "shot.png");
});
