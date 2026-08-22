/**
 * Writing and renaming conversations (TKT-0108).
 *
 * Against a stand-in for Obsidian rather than a real vault, so the rules can be checked
 * without an app running. This module had no tests at all until the filing scheme changed,
 * which is how a filename came to repeat the folder it was already in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startConversation, appendTurn, renameConversation } from "./src/vault.js";

/** Just enough Obsidian: a map of paths to contents, and folders that remember existing. */
function fakeVault() {
  const files = new Map();
  const folders = new Set();
  const renames = [];

  const app = {
    vault: {
      getAbstractFileByPath: (p) => (files.has(p) ? { path: p } : (folders.has(p) ? { path: p, folder: true } : null)),
      createFolder: async (p) => {
        if (folders.has(p)) throw new Error("exists");
        folders.add(p);
      },
      create: async (p, text) => { files.set(p, text); return { path: p }; },
      append: async (file, text) => files.set(file.path, (files.get(file.path) ?? "") + text),
      read: async (file) => files.get(file.path) ?? "",
      modify: async (file, text) => files.set(file.path, text),
      // Obsidian reads and writes in one call, which is why the code prefers it.
      process: async (file, fn) => { files.set(file.path, fn(files.get(file.path) ?? "")); },
    },
    fileManager: {
      renameFile: async (file, to) => {
        renames.push([file.path, to]);
        files.set(to, files.get(file.path));
        files.delete(file.path);
      },
      // Enough of Obsidian's frontmatter editing to see the field change: rewrites the one
      // line in place, which is what it does to a file that already has that key.
      processFrontMatter: async (file, fn) => {
        const front = {};
        fn(front);
        let text = files.get(file.path) ?? "";
        for (const [key, value] of Object.entries(front)) {
          text = text.replace(new RegExp(`^${key}: .*$`, "m"), `${key}: ${value}`);
        }
        files.set(file.path, text);
      },
    },
  };
  return { app, files, folders, renames };
}

const AUGUST_19 = new Date(2026, 7, 19, 14, 30, 5);

const start = (app, question, now = AUGUST_19) =>
  startConversation(app, {
    question, provider: "ollama", model: "qwen3:4b", now,
    root: "00-inbox", context: "60-log/conversations",
  });

test("a conversation is filed by day, and named only for its subject", async () => {
  const { app } = fakeVault();
  const path = await start(app, "is it better to go to Malaga from Calpe by train or by bus");
  assert.equal(path, "00-inbox/2026/08/19/is-it-better-to-go-to-malaga-from-calpe-by-train-or-by-bus.md");
});

test("every folder in the path is created", async () => {
  const { app, folders } = fakeVault();
  await start(app, "hello");
  assert.deepEqual([...folders], ["00-inbox", "00-inbox/2026", "00-inbox/2026/08", "00-inbox/2026/08/19"]);
});

test("the same question twice in a day keeps both", async () => {
  const { app } = fakeVault();
  const first = await start(app, "hello");
  const second = await start(app, "hello");
  assert.notEqual(first, second);
  assert.equal(second, "00-inbox/2026/08/19/hello-2.md");
});

test("the frontmatter carries the date the filename no longer does", async () => {
  // Removing it from the name must not lose it: this is what a query would read.
  const { app, files } = fakeVault();
  const text = files.get(await start(app, "hello"));
  assert.match(text, /^created: 2026-08-19$/m);
  assert.match(text, /^uid: 20260819T143005$/m);
});

/**
 * The vault's schema is seven fields, and the rule beside it is "do not invent other
 * fields — unmaintained metadata lies". This wrote `source`, `provider`, `model` and
 * `started` as well, and nothing ever read any of them: `started` was `uid` again in
 * another format, and `provider`/`model` froze whichever model answered first while the
 * chips moved on.
 */
test("nothing is written that the vault's schema did not ask for", async () => {
  const { app, files } = fakeVault();
  const text = files.get(await start(app, "hello"));

  const fields = text.split("---")[1].trim().split("\n").map((line) => line.split(":")[0]);
  assert.deepEqual(fields, ["uid", "type", "created", "updated", "author", "tags", "aliases"]);
});

test("a turn is appended whole, under who said it", async () => {
  const { app, files } = fakeVault();
  const path = await start(app, "hello");
  await appendTurn(app, path, "me", "hello", AUGUST_19);
  await appendTurn(app, path, "qwen3:4b", "Hello back", AUGUST_19);

  const text = files.get(path);
  assert.match(text, /\*\*me\*\* _\(14:30\)_\n\nhello/);
  assert.match(text, /\*\*qwen3:4b\*\* _\(14:30\)_\n\nHello back/);
});

/**
 * It used to be written once at creation and never again, so a conversation carried on for
 * a week still claimed to be untouched since the day it started. A field that says
 * something false is worse than one that says nothing.
 */
test("the date it changed is the date it changed", async () => {
  const { app, files } = fakeVault();
  const path = await start(app, "hello");
  assert.match(files.get(path), /^updated: 2026-08-19$/m);

  await appendTurn(app, path, "me", "and again", new Date(2026, 7, 26, 9, 0));
  assert.match(files.get(path), /^updated: 2026-08-26$/m);
  assert.match(files.get(path), /^created: 2026-08-19$/m, "and created still says when it began");
});

test("appending to a conversation that has gone says so", async () => {
  // Silence here would lose a turn, which standard 5 puts above everything.
  const { app } = fakeVault();
  await assert.rejects(appendTurn(app, "00-inbox/2026/08/19/gone.md", "me", "hi"), /gone/);
});

test("renaming moves the file and rewrites the heading with it", async () => {
  const { app, files, renames } = fakeVault();
  const path = await start(app, "hello");
  const moved = await renameConversation(app, path, { text: "Train or bus to Malaga", slug: "train-or-bus-to-malaga" });

  assert.equal(moved, "00-inbox/2026/08/19/train-or-bus-to-malaga.md");
  assert.equal(renames.length, 1, "through fileManager, so links follow");
  assert.match(files.get(moved), /^# Train or bus to Malaga$/m, "the note does not disagree with itself");
});

test("renaming onto a name already taken does not overwrite it", async () => {
  const { app, files } = fakeVault();
  await start(app, "train or bus to malaga");          // the name the title would want
  const second = await start(app, "hello");
  const moved = await renameConversation(app, second, { text: "Train or bus to Malaga", slug: "train-or-bus-to-malaga" });

  assert.equal(moved, "00-inbox/2026/08/19/train-or-bus-to-malaga-2.md");
  assert.equal(files.size, 2, "both conversations survive");
});

test("a rename that fails leaves the conversation exactly as it was", async () => {
  // This runs after the answer is on disk. Nothing here is worth losing a turn over.
  const { app, files } = fakeVault();
  const path = await start(app, "hello");
  app.fileManager.renameFile = async () => { throw new Error("locked"); };

  assert.equal(await renameConversation(app, path, { text: "Something", slug: "something" }), path);
  assert.ok(files.has(path), "still there under the name it had");
});

test("renaming a conversation that no longer exists is not an error", async () => {
  const { app } = fakeVault();
  const missing = "00-inbox/2026/08/19/gone.md";
  assert.equal(await renameConversation(app, missing, { text: "X", slug: "x" }), missing);
});
