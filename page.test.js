/**
 * Reading a page that was linked to (ADR-0014).
 *
 * No model can fetch anything, so a model that says it looked something up had something
 * around it do the looking. The rules worth holding are about restraint: how much of a
 * page travels, what is refused outright, and that a link nobody can read costs the
 * question nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { requests, answerWith, notices } from "./test/obsidian.js";
import { urlsIn, readable, pageAt } from "./src/page.js";
import { noticeLinks, clearAttachments } from "./src/attaching.js";
import { asLinks, asTurn } from "./src/attach.js";

const page = ({ title = "What is a Homelab?", description = "A homelab is just a computer you own.", body = "The body of the page." } = {}) => `
<html><head>
  <title>${title} - YouTube</title>
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <script>var ytcfg = {lots: "of javascript"};</script>
  <style>.a{color:red}</style>
</head><body><div><p>${body}</p></div></body></html>`;

const serving = (fn) => { requests.length = 0; answerWith(fn); };

// ── finding a link ───────────────────────────────────────────────────────────────

test("a link is found in a sentence, without the punctuation after it", () => {
  assert.deepEqual(urlsIn("look at https://example.com/a, and https://b.example.com."),
    ["https://example.com/a", "https://b.example.com"]);
  assert.deepEqual(urlsIn("nothing here"), []);
  assert.deepEqual(urlsIn(null), []);
});

// ── reading one ──────────────────────────────────────────────────────────────────

/**
 * The og: tags are what makes a video worth reading at all. Its page body is a script
 * bundle, and the title and description are the only prose anywhere in it.
 */
test("the title and description are taken, and the scripts are not", () => {
  const { title, text } = readable(page(), "https://www.youtube.com/watch?v=x");

  assert.equal(title, "What is a Homelab?");
  assert.match(text, /A homelab is just a computer you own\./);
  assert.match(text, /The body of the page\./);
  assert.ok(!text.includes("ytcfg"), "no javascript");
  assert.ok(!text.includes("color:red"), "and no stylesheet");
});

test("the address is in what is sent, so an answer can say what it read", () => {
  const { text } = readable(page(), "https://example.com/thing");

  assert.match(text, /https:\/\/example\.com\/thing/);
});

test("entities come back as the characters they stand for", () => {
  const { text } = readable(page({ description: "it isn&#39;t scary &amp; never was" }), "https://example.com");

  assert.match(text, /it isn't scary & never was/);
});

/** A long article sent whole crowds out the question and, on a metered provider, is a bill. */
test("only so much of a page travels, and it says where it stopped", () => {
  const { text } = readable(page({ body: "word ".repeat(3000) }), "https://example.com");

  assert.ok(text.length < 4200, `${text.length} characters`);
  assert.match(text, /the rest of the page was not sent/);
});

test("a page comes back shaped like any other attachment", async () => {
  serving(async () => ({ status: 200, text: page(), headers: { "content-type": "text/html" } }));

  const held = await pageAt("https://www.youtube.com/watch?v=x");

  assert.equal(held.kind, "text", "so it folds into the question like a note");
  assert.equal(held.name, "What is a Homelab?");
  assert.equal(held.path, "https://www.youtube.com/watch?v=x", "the address is where it lives");
});

test("a site that refuses says so, rather than sending an error page to a model", async () => {
  serving(async () => ({ status: 404, text: "<h1>Not found</h1>", headers: {} }));

  await assert.rejects(() => pageAt("https://example.com/gone"), /answered 404/);
});

/** A PDF or an image would arrive as bytes, and be sent to the model as mangled text. */
test("something that is not text is refused before it is read", async () => {
  serving(async () => ({ status: 200, text: "%PDF-1.7", headers: { "content-type": "application/pdf" } }));

  await assert.rejects(() => pageAt("https://example.com/paper.pdf"), /not text/);
});

// ── how it reaches the question ──────────────────────────────────────────────────

function panel() {
  const view = { attachments: [], shown: [], focused: 0, app: {} };
  view.composer = { focus() { view.focused += 1; }, showAttached(list) { view.shown.push(list.map((a) => a.name)); } };
  return view;
}

const settle = (ms = 900) => new Promise((resolve) => setTimeout(resolve, ms));

test("a link typed into the box is read and held, once the typing stops", async () => {
  serving(async () => ({ status: 200, text: page(), headers: { "content-type": "text/html" } }));
  const view = panel();

  noticeLinks(view, "what about https://www.youtube.com/watch?v=x");
  await settle();

  assert.deepEqual(view.attachments.map((a) => a.name), ["What is a Homelab?"]);
  assert.equal(requests.length, 1);
});

/**
 * Fetched on every keystroke, this would ask a stranger's server for every half-typed
 * address on the way to the real one.
 */
test("a link half-typed is not read on the way to being finished", async () => {
  serving(async () => ({ status: 200, text: page(), headers: { "content-type": "text/html" } }));
  const view = panel();

  for (const partial of ["https://exa", "https://exampl", "https://example.com/a"]) noticeLinks(view, partial);
  await settle();

  assert.equal(requests.length, 1, "the one that was finished");
  assert.equal(requests[0].url, "https://example.com/a");
});

test("the same link is not read twice", async () => {
  serving(async () => ({ status: 200, text: page(), headers: { "content-type": "text/html" } }));
  const view = panel();

  noticeLinks(view, "https://example.com/a");
  await settle();
  noticeLinks(view, "https://example.com/a and more typing");
  await settle();

  assert.equal(view.attachments.length, 1);
  assert.equal(requests.length, 1);
});

/** A link that cannot be read is worth saying so about, and the question still stands. */
test("a link that cannot be read leaves the question askable", async () => {
  notices.length = 0;
  serving(async () => { throw new Error("getaddrinfo ENOTFOUND"); });
  const view = panel();

  noticeLinks(view, "https://nowhere.invalid/x");
  await settle();

  assert.deepEqual(view.attachments, []);
  assert.match(notices.join(" "), /Could not read https:\/\/nowhere\.invalid\/x/);
});

/** A wikilink to a page that was never a note in the vault is a link to nothing. */
test("a page is linked to in the transcript by its address", () => {
  const held = { kind: "text", name: "What is a Homelab?", path: "https://www.youtube.com/watch?v=x", text: "..." };

  assert.equal(asLinks([held]), "[What is a Homelab?](https://www.youtube.com/watch?v=x)");
  assert.equal(asLinks([{ kind: "text", name: "plan.md", path: "notes/plan.md" }]), "[[plan.md]]",
    "and a note still by its name");
});

test("what the page said travels with the question", () => {
  const held = { kind: "text", name: "What is a Homelab?", path: "https://x", text: "A homelab is a computer you own." };

  const turn = asTurn("could we use it as a homelab?", [held]);

  assert.match(turn.text, /A homelab is a computer you own\./);
  assert.match(turn.text, /could we use it as a homelab\?$/, "the question stays last");
});
