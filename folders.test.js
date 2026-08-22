/**
 * Which folders this plugin writes to (ADR-0010).
 *
 * These rules matter more than they look: whatever comes out of `cleanFolder` is used to
 * build a path that gets written to. Everything here is about the gap between what somebody
 * means by a folder and what a filesystem will do with it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFolder, foldersOf, willBe, DEFAULT_FOLDERS } from "./src/folders.js";

test("an ordinary folder is left alone", () => {
  assert.equal(cleanFolder("00-inbox"), "00-inbox");
  assert.equal(cleanFolder("60-log/conversations"), "60-log/conversations");
  assert.equal(cleanFolder("Notes/AI chats"), "Notes/AI chats");
});

/** A leading slash means the vault root to a reader and an absolute path to a filesystem. */
test("slashes people add out of habit are removed", () => {
  assert.equal(cleanFolder("/00-inbox"), "00-inbox");
  assert.equal(cleanFolder("00-inbox/"), "00-inbox");
  assert.equal(cleanFolder("/notes/chats/"), "notes/chats");
  assert.equal(cleanFolder("notes//chats"), "notes/chats", "and a doubled separator is one");
});

test("a Windows path typed by hand still means the same folder", () => {
  assert.equal(cleanFolder("notes\\chats"), "notes/chats");
});

/** `.` is where you already are, and `..` is somewhere this has no business going. */
test("nothing can climb out of the vault", () => {
  assert.equal(cleanFolder("../../etc"), "etc");
  assert.equal(cleanFolder("notes/../../.."), "notes");
  assert.equal(cleanFolder("./notes"), "notes");
  assert.equal(cleanFolder("../.."), "");
});

/**
 * A vault synced between machines is only as portable as its least tolerant filesystem, and
 * Windows refuses these outright — a folder that works here and fails there is worse than
 * one that never worked.
 */
test("characters a filesystem will refuse are dropped", () => {
  assert.equal(cleanFolder('note:s/ch*ats?'), "notes/chats");
  assert.equal(cleanFolder('a"b<c>d|e'), "abcde");
  assert.equal(cleanFolder("notes."), "notes", "a trailing dot is invisible and refused");
});

/**
 * The same folder name can be two different strings that look identical: macOS decomposes
 * an accent into letter-plus-mark where Windows composes it into one character. Left alone,
 * the folder gets created twice on a synced vault, or looked for and not found.
 */
test("a folder named the same way twice is the same folder", () => {
  const composed = "Conversación";          // ó as one character
  const decomposed = "Conversación";       // o followed by a combining accent

  assert.notEqual(composed, decomposed, "the two spellings really are different strings");
  assert.equal(cleanFolder(composed), cleanFolder(decomposed));
  assert.equal(cleanFolder(decomposed), composed, "and both settle on the composed form");
});

test("surrounding whitespace is somebody's typing, not part of the name", () => {
  assert.equal(cleanFolder("  notes / chats  "), "notes/chats");
});

/**
 * Nothing usable must read as "keep the default", never as "write to the vault root" — a
 * cleared field should not scatter conversations across the top of somebody's vault.
 */
test("nothing usable falls back to the default rather than to the vault root", () => {
  for (const nothing of ["", "   ", "/", "///", "..", null, undefined]) {
    assert.equal(cleanFolder(nothing), "", String(nothing));
  }

  const folders = foldersOf({ folders: { conversations: "  /  ", context: "" } });
  assert.deepEqual(folders, DEFAULT_FOLDERS);
});

test("a vault that has never set them gets the defaults", () => {
  assert.deepEqual(foldersOf(undefined), DEFAULT_FOLDERS);
  assert.deepEqual(foldersOf({}), DEFAULT_FOLDERS);
});

test("what is set is what is used, cleaned", () => {
  const folders = foldersOf({ folders: { conversations: "/Chats/", context: "Chats/context" } });
  assert.equal(folders.conversations, "Chats");
  assert.equal(folders.context, "Chats/context");
});

test("one folder set does not disturb the other", () => {
  const folders = foldersOf({ folders: { conversations: "Chats" } });
  assert.equal(folders.conversations, "Chats");
  assert.equal(folders.context, DEFAULT_FOLDERS.context);
});

/** What the settings screen shows back, so the surprise happens before anything is written. */
test("what a folder will become can be said before it is used", () => {
  assert.equal(willBe("/Notes/Chats/", DEFAULT_FOLDERS.conversations), "Notes/Chats");
  assert.equal(willBe("", DEFAULT_FOLDERS.conversations), DEFAULT_FOLDERS.conversations);
});
