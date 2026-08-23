/**
 * Where conversations are filed (TKT-0108).
 *
 * These are the first tests vault-side path logic has ever had. It was previously inline
 * in the code that wrote files, which is why "2026-08-19-calpe-malaga-train-bus" shipped
 *, a name whose first ten characters repeated the folder it was already in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { folderFor, foldersToCreate, nameFor, freeName } from "./src/paths.js";

/** One vault's folder, passed in like any other now that it is configurable (ADR-0010). */
const INBOX = "00-inbox";

const AUGUST_19 = new Date(2026, 7, 19, 14, 30);
const JANUARY_2 = new Date(2026, 0, 2, 9, 5);

test("the date is the folder, not the filename", () => {
  assert.equal(folderFor(AUGUST_19, INBOX), "00-inbox/2026/08/19");
});

test("months and days are padded, so a listing sorts as text", () => {
  // Without padding, 2026/1/2 sorts after 2026/10/1 in every file explorer there is.
  assert.equal(folderFor(JANUARY_2, INBOX), "00-inbox/2026/01/02");
});

test("every folder in the path is created, outermost first", () => {
  // Obsidian will not create an intermediate folder for you, and creating them in the
  // wrong order fails on the first one.
  assert.deepEqual(foldersToCreate(AUGUST_19, INBOX), [
    "00-inbox",
    "00-inbox/2026",
    "00-inbox/2026/08",
    "00-inbox/2026/08/19",
  ]);
});

test("a name is the subject and nothing else", () => {
  assert.equal(nameFor("is it better to go to Malaga from Calpe by train or by bus"),
    "is-it-better-to-go-to-malaga-from-calpe-by-train-or-by-bus");
  assert.equal(nameFor("C++ vs Rust: which?"), "c-vs-rust-which");
});

test("a name that would be empty falls back rather than breaking", () => {
  for (const nothing of ["", "   ", "!!!", "¿?", null, undefined]) {
    assert.equal(nameFor(nothing), "conversation", JSON.stringify(nothing));
  }
});

test("a long question is cut to something readable", () => {
  const long = nameFor("a".repeat(200));
  assert.ok(long.length <= 60);
  assert.ok(!long.endsWith("-"), "and never left ending in a hyphen");
});

test("the same question twice in a day does not overwrite the first", () => {
  const taken = new Set(["00-inbox/2026/08/19/hello.md"]);
  assert.equal(
    freeName("00-inbox/2026/08/19", "hello", (p) => taken.has(p)),
    "00-inbox/2026/08/19/hello-2.md",
  );
});

test("the first free name is used, not the next number after the last", () => {
  // A gap left by a deleted conversation is reused, which keeps names short.
  const taken = new Set(["00-inbox/2026/08/19/hello.md", "00-inbox/2026/08/19/hello-3.md"]);
  assert.equal(
    freeName("00-inbox/2026/08/19", "hello", (p) => taken.has(p)),
    "00-inbox/2026/08/19/hello-2.md",
  );
});

test("a hundred collisions still yields a usable name", () => {
  const path = freeName("00-inbox/2026/08/19", "hello", () => true);
  assert.match(path, /^00-inbox\/2026\/08\/19\/hello-\d+\.md$/);
});
