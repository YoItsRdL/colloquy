/**
 * Holding what a question is about, until it is asked (ADR-0011).
 *
 * Two routes to the same list, the vault, and the rest of the machine, and one rule
 * underneath both: whatever is attached must be reachable from the transcript afterwards.
 * A file that was sent but never landed in the vault leaves a conversation pointing at
 * nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { El, Menu, Modal, menus, modals, notices } from "./test/obsidian.js";
import { pickAttachment, clearAttachments, showAttachments } from "./src/attaching.js";
import { AttachPicker, readAttachment } from "./src/attach-picker.js";
import { chooseFromDisk } from "./src/attach-disk.js";

const bytes = (n, fill = 65) => new Uint8Array(n).fill(fill).buffer;

function panel({ files = [], attachmentPath = "attachments/diagram.png", createBinary } = {}) {
  const created = [];
  const view = {
    attachments: [],
    shown: [],
    focused: 0,
    app: {
      vault: {
        getFiles: () => files,
        cachedRead: async (f) => `contents of ${f.name}`,
        readBinary: async () => bytes(8),
        createBinary: createBinary ?? (async (path) => { created.push(path); return { path, name: path.split("/").pop() }; }),
      },
      fileManager: { getAvailablePathForAttachment: async () => attachmentPath },
    },
    composer: {
      focus() { view.focused += 1; },
      showAttached(list) { view.shown.push(list.map((a) => a.name)); },
    },
  };
  view.created = created;
  return view;
}

const file = (path, mtime = 0) => ({ path, name: path.split("/").pop(), basename: path.split("/").pop().replace(/\.\w+$/, ""), stat: { mtime, size: 100 } });

// ── the two routes ───────────────────────────────────────────────────────────────

/**
 * The vault is first because it is usually the answer. Insisting on it would refuse the
 * photo on somebody's desktop for no better reason than where it happens to be.
 */
test("the paperclip offers the vault first, and the rest of the machine second", () => {
  menus.length = 0;
  pickAttachment(panel(), { type: "click" });

  assert.deepEqual(Menu.last().titles(), ["From your vault", "From your computer"]);
});

test("choosing from the vault opens a picker, and what is picked is held", async () => {
  menus.length = 0;
  modals.length = 0;
  const view = panel({ files: [file("notes/plan.md")] });

  pickAttachment(view, { type: "click" });
  Menu.last().choose("From your vault");
  Modal.last().pick("notes/plan.md");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(view.attachments.map((a) => a.name), ["plan.md"]);
  assert.deepEqual(view.shown.at(-1), ["plan.md"], "and the row is redrawn");
  assert.equal(view.focused, 1, "with the cursor back where the question goes");
});

/** The same file twice is a slip, not an instruction. It would be sent and paid for twice. */
test("the same file attached twice is held once", async () => {
  menus.length = 0;
  modals.length = 0;
  const view = panel({ files: [file("notes/plan.md")] });

  for (let i = 0; i < 2; i++) {
    pickAttachment(view, { type: "click" });
    Menu.last().choose("From your vault");
    Modal.last().pick("notes/plan.md");
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  assert.equal(view.attachments.length, 1);
});

test("changing your mind about one leaves the others", () => {
  const view = panel();
  view.attachments = [{ name: "a.md", path: "a.md" }, { name: "b.md", path: "b.md" }, { name: "c.md", path: "c.md" }];

  showAttachments(view);
  view.attachments.splice(1, 1);
  showAttachments(view);

  assert.deepEqual(view.shown.at(-1), ["a.md", "c.md"]);
});

test("clearing drops everything and redraws the row empty", () => {
  const view = panel();
  view.attachments = [{ name: "a.md", path: "a.md" }];

  clearAttachments(view);

  assert.deepEqual(view.attachments, []);
  assert.deepEqual(view.shown.at(-1), []);
});

// ── from the vault ───────────────────────────────────────────────────────────────

test("only files a model can actually read are offered, newest first", () => {
  const view = panel({ files: [file("old.md", 1), file("shot.png", 3), file("paper.pdf", 9), file("new.md", 5)] });
  const picker = new AttachPicker(view.app, () => {});

  assert.deepEqual(picker.getItems().map((f) => f.name), ["new.md", "shot.png", "old.md"], "no pdf, newest first");
});

test("a note is carried as its text, an image as its bytes", async () => {
  const view = panel();

  const note = await readAttachment(view.app, file("notes/plan.md"));
  assert.equal(note.kind, "text");
  assert.equal(note.text, "contents of plan.md");
  assert.equal(note.data, undefined, "no point encoding what is already readable");

  const image = await readAttachment(view.app, file("shot.png"));
  assert.equal(image.kind, "image");
  assert.equal(image.mime, "image/png");
  assert.match(image.data, /^[A-Za-z0-9+/=]+$/, "base64, for the wire");
});

/**
 * PDFs need extracting rather than encoding, and sending bytes a model will silently
 * ignore is worse than saying no.
 */
test("a file that cannot be read is refused, with the reason on screen", async () => {
  notices.length = 0;
  const view = panel();

  const refused = await readAttachment(view.app, file("paper.pdf"));

  assert.equal(refused, null);
  assert.ok(notices.length === 1, notices.join(" | "));
});

// ── from the machine ─────────────────────────────────────────────────────────────

/** The name Obsidian would have given it, so it lands where a dropped file would have. */
test("a file from the machine is copied into the vault before it is held", async () => {
  const view = panel({ attachmentPath: "attachments/diagram.png" });
  const held = [];

  chooseFromDisk(view.app, (a) => held.push(a));
  const input = activeDocument.body.children.at(-1);
  input.files = [{ name: "diagram.png", size: 100, arrayBuffer: async () => bytes(8) }];
  await input.onchange();

  assert.deepEqual(view.created, ["attachments/diagram.png"], "in the vault, at Obsidian's own path");
  assert.equal(held.length, 1);
  assert.equal(held[0].path, "attachments/diagram.png", "and the transcript links to where it landed");
});

test("a file the vault refuses names itself in the complaint", async () => {
  notices.length = 0;
  const view = panel({ createBinary: async () => { throw new Error("disk is full"); } });
  const held = [];

  chooseFromDisk(view.app, (a) => held.push(a));
  const input = activeDocument.body.children.at(-1);
  input.files = [{ name: "diagram.png", size: 100, arrayBuffer: async () => bytes(8) }];
  await input.onchange();

  assert.deepEqual(held, []);
  assert.match(notices.join(" "), /diagram\.png could not be brought into the vault: disk is full/);
});

test("the hidden input does not outlive the dialog", async () => {
  const view = panel();

  chooseFromDisk(view.app, () => {});
  const input = activeDocument.body.children.at(-1);
  input.files = [];
  await input.onchange();

  assert.ok(!activeDocument.body.children.includes(input), "nothing left behind in the document");
});
