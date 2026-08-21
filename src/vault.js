/**
 * Writing conversations into the vault (ADR-0001, standard 3).
 *
 * Through Obsidian's API rather than the filesystem, so the file explorer, the graph,
 * backlinks and any sync see a conversation the moment it lands. The gateway wrote
 * behind Obsidian's back and the vault only noticed on a rescan.
 *
 * Append-only markdown, and nothing here needs this plugin to read it back. If Obsidian
 * and every provider vanish, the notes are still notes.
 */
import { folderFor, foldersToCreate, nameFor, freeName } from "./paths.js";

/** Two digits, for the timestamp on a turn. Folder padding lives in paths.js. */
const pad = (n) => String(n).padStart(2, "0");

const stamp = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const clock = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** Folders are created on demand: a vault that has never captured anything has none. */
async function ensureFolder(app, path) {
  if (app.vault.getAbstractFileByPath(path)) return;
  try {
    await app.vault.createFolder(path);
  } catch {
    // Created by something else between the check and the call. Harmless.
  }
}

/** The rule lives in paths.js; this supplies it with what the vault already holds. */
const freePath = (app, folder, base) =>
  freeName(folder, base, (path) => Boolean(app.vault.getAbstractFileByPath(path)));

/**
 * Frontmatter matching the vault's own schema, and nothing besides.
 *
 * The schema is seven fields and the rule beside it is "do not invent other fields —
 * unmaintained metadata lies". This wrote five of its own: `source: plugin`, `provider`,
 * `model` and `started`, none of which anything ever read, plus `noticed`, which the sweep
 * does read and which earns its place because the alternative is a plugin-side ledger keyed
 * on paths that get renamed (ADR-0006).
 *
 * The four that went were not merely spare. `started` was `uid` again in another format.
 * `provider` and `model` recorded whichever model answered first and then stayed put while
 * the chips moved on — and every turn in the body already carries the model that produced
 * it, which is the accurate version of the same fact.
 */
function header({ question, context, date }) {
  return [
    "---",
    `uid: ${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
    "type: source",
    `created: ${stamp(date)}`,
    `updated: ${stamp(date)}`,
    "author: mixed",
    "tags: [conversation]",
    "aliases: []",
    "---",
    "",
    `# ${question}`,
    "",
    // Only what is true of any vault. This used to close by telling the reader to run
    // `/process` and pointing them at `10-notes/` — a command and a folder belonging to the
    // vault this was built in, written into every conversation anybody else would ever have.
    "> Captured automatically. A few minutes after this goes quiet it is read, and a short",
    `> account of what we were doing is kept in \`${context}/\`, so later conversations have it.`,
    "",
    // Two blank lines, not one. Markdown's lazy continuation pulls a line that follows a
    // blockquote directly into it, so the first turn would render inside the notice.
    "",
  ].join("\n");
}

/**
 * Starts a conversation file and returns its path.
 *
 * Filed by day — `Conversations/2026/08/19/` — so the name can be about the subject alone.
 * The date used to be both the folder and the first ten characters of every filename in it,
 * which spent the most readable part of a name repeating what the folder already said.
 */
export async function startConversation(app, { question, root, context, now = new Date() }) {
  for (const folder of foldersToCreate(now, root)) await ensureFolder(app, folder);

  const path = freePath(app, folderFor(now, root), nameFor(question));
  await app.vault.create(path, header({ question, context, date: now }));
  return path;
}

/**
 * Renames a conversation once the model has given it a better name (TKT-0107).
 *
 * Through `fileManager`, not `vault`, because that is the call that updates anything
 * linking to the file. Nothing links to a conversation seconds after it is created, but
 * using the weaker call would make that luck rather than design.
 *
 * The heading is rewritten with it. A file named one thing and titled another is a note
 * that disagrees with itself, and the heading was only ever the question anyway.
 *
 * @returns {Promise<string>} the path now, which is the old one if anything went wrong
 */
export async function renameConversation(app, path, title) {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file || !title) return path;

  // The folder already carries the date, so the new name is the subject and nothing else.
  const folder = path.slice(0, path.lastIndexOf("/"));
  const wanted = freePath(app, folder, title.slug);
  if (wanted === path) return path;

  try {
    const text = await app.vault.read(file);
    // Only the first heading, and only if it is the one this plugin wrote.
    await app.vault.modify(file, text.replace(/^# .*$/m, `# ${title.text}`));
    await app.fileManager.renameFile(file, wanted);
    return wanted;
  } catch {
    // A conversation with a plain name is a working conversation. Renaming is a courtesy
    // and must never cost the turn it was trying to improve.
    return path;
  }
}

/**
 * One finished turn. Appended whole, never per chunk: partial words interleaved into the
 * file would make it unreadable, and the file is the product rather than the screen.
 */
export async function appendTurn(app, path, who, text, now = new Date()) {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`the conversation file is gone: ${path}`);
  await app.vault.append(file, `**${who}** _(${clock(now)})_\n\n${text.trim()}\n\n`);

  // The turn first, then the date it changed. `updated` was written once at creation and
  // never again, so a conversation carried on for a week still claimed to be untouched
  // since the day it started — exactly the unmaintained metadata the vault's own schema
  // note warns about. Maintaining it is cheaper than explaining it.
  //
  // Skipped when it already says today, so a long conversation is not one frontmatter
  // rewrite per turn — and wrapped, because the turn is the product and a date is a
  // courtesy that must never cost one.
  const today = stamp(now);
  if (app.metadataCache?.getFileCache(file)?.frontmatter?.updated === today) return;
  try {
    await app.fileManager.processFrontMatter(file, (front) => { front.updated = today });
  } catch { /* the turn is on disk, which is the part that mattered */ }
}

