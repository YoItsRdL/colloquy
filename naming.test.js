/**
 * Naming a conversation from what it turned out to be about.
 *
 * The rename moves a file the idle clock is already counting down on. That clock is keyed
 * on path, so whoever renames the file owes the sweep the new one. 1.0.0 did not, and the
 * three-minute read silently never happened for any conversation that got a title.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { nameConversation } from "./src/naming.js";

const OLD = "00-inbox/2026/08/19/hello.md";
const NAMED = "00-inbox/2026/08/19/is-the-train-quicker.md";

function harness({ title = "Is the train quicker", background = null } = {}) {
  const files = new Map([[OLD, "# hello\n\nbody"]]);
  const renamed = [];
  const shown = [];

  const app = {
    vault: {
      getAbstractFileByPath: (p) => (files.has(p) ? { path: p } : null),
      process: async (file, fn) => { files.set(file.path, fn(files.get(file.path))); },
    },
    fileManager: {
      renameFile: async (file, to) => { files.set(to, files.get(file.path)); files.delete(file.path); },
    },
  };

  const session = { file: OLD, history: [{ role: "me", text: "trains?" }] };
  const view = {
    app,
    session,
    named: false,
    where: { show: (p) => shown.push(p) },
    plugin: {
      settings: {},
      sweep: { renamed: (from, to) => renamed.push([from, to]) },
      // Unset unless a test sets it, which is a vault that has never opened that setting:
      // the model that answered is the one asked for a name (ADR-0016).
      background: async () => background ?? { chosen: false },
    },
  };

  const candidate = { model: "gemma3:4b", key: "url", provider: { complete: async () => title } };
  return { view, session, candidate, files, renamed, shown };
}

test("the sweep is told where the conversation went", async () => {
  const { view, session, candidate, renamed } = harness();
  await nameConversation(view, candidate);

  assert.equal(session.file, NAMED, "the session follows the file");
  assert.deepEqual(renamed, [[OLD, NAMED]], "and so does the clock counting down on it");
});

test("an unusable title leaves both the file and the clock alone", async () => {
  const { view, session, candidate, renamed } = harness({ title: "  " });
  await nameConversation(view, candidate);

  assert.equal(session.file, OLD, "the working name stands");
  assert.deepEqual(renamed, [], "nothing moved, so there is nothing to move");
});

/**
 * The working name is made from the question and the title from the answer, so the two
 * agreeing is ordinary rather than rare. It used to produce "hello-2.md": the file counted
 * as occupying its own name, so the equal-name guard never fired.
 */
test("a title that matches the working name moves nothing", async () => {
  const { view, session, candidate, renamed, files } = harness({ title: "hello" });
  await nameConversation(view, candidate);

  assert.equal(session.file, OLD, "and certainly not hello-2.md");
  assert.equal(files.has(OLD), true, "the file is where it was");
  assert.deepEqual(renamed, [], "nothing moved, so there is nothing to move");
});

/**
 * Naming is unattended work: a request nobody asked for, per conversation, and on a paid
 * provider a request per filename. Whoever sets a model for that work has said where it
 * should go, and the exchange is restated in the prompt, so it can go anywhere (ADR-0016).
 */
test("a model set for the unattended work names the conversation, not the one that answered", async () => {
  const asked = [];
  const elsewhere = {
    model: "gemma3:1b",
    key: "url",
    chosen: true,
    provider: { complete: async (opts) => { asked.push(opts.model); return "Is the train quicker" } },
  };
  const { view, session, candidate } = harness({ background: elsewhere });

  await nameConversation(view, candidate);

  assert.deepEqual(asked, ["gemma3:1b"], "the one that was picked for it");
  assert.equal(session.file, NAMED, "and the name it came back with is used");
});
