/**
 * Writing conversations into the vault.
 *
 * Through Obsidian's API rather than the filesystem, so the explorer, the graph and any
 * sync see a conversation the moment it lands. Append-only markdown: if Obsidian and every
 * provider vanish, the notes are still notes.
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

/**
 * The rule lives in paths.js; this supplies it with what the vault already holds.
 *
 * A rename passes the file's own path as `mine`. Without that the file counts as occupying
 * the name it already has, every title that agrees with the working name comes back as
 * "-2", and the equal-name guard below never sees the case it was written for.
 */
const freePath = (app, folder, base, mine = null) =>
  freeName(folder, base, (path) => path !== mine && Boolean(app.vault.getAbstractFileByPath(path)));

/**
 * Seven fields and nothing besides. This used to add `source`, `provider`, `model` and
 * `started` too, none of which anything read, `started` was `uid` in another format, and
 * `provider`/`model` froze whichever model answered first while the chips moved on.
 *
 * `noticed` is added later by the sweep, and earns it: see ADR-0006.
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
    "> Captured automatically. A few minutes after this goes quiet it is read, and a short",
    `> account of what we were doing is kept in \`${context}/\`, so later conversations have it.`,
    "",
    // Two blank lines, not one. Markdown's lazy continuation pulls a line that follows a
    // blockquote directly into it, so the first turn would render inside the notice.
    "",
  ].join("\n");
}

/** Filed by day, so the filename can be about the subject alone. */
export async function startConversation(app, { question, root, context, now = new Date() }) {
  for (const folder of foldersToCreate(now, root)) await ensureFolder(app, folder);

  const path = freePath(app, folderFor(now, root), nameFor(question));
  await app.vault.create(path, header({ question, context, date: now }));
  return path;
}

/**
 * Through `fileManager` rather than `vault`, because that is the call that updates
 * anything linking to the file. The heading is rewritten with it.
 *
 * @returns the path now, which is the old one if anything went wrong.
 */
export async function renameConversation(app, path, title) {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file || !title) return path;

  const folder = path.slice(0, path.lastIndexOf("/"));
  const wanted = freePath(app, folder, title.slug, path);
  if (wanted === path) return path;

  try {
    // Naming happens while the answer is still arriving and the next turn may already be
    // appending; `modify` would read, then write back over it. `process` cannot.
    await app.vault.process(file, (text) => text.replace(/^# .*$/m, `# ${title.text}`));
    await app.fileManager.renameFile(file, wanted);
    return wanted;
  } catch {
    return path;   // renaming is a courtesy; it must not cost the turn it was improving
  }
}

/** One finished turn, appended whole, partial words would make the file unreadable. */
export async function appendTurn(app, path, who, text, now = new Date()) {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`the conversation file is gone: ${path}`);
  await app.vault.append(file, `**${who}** _(${clock(now)})_\n\n${text.trim()}\n\n`);

  // `updated` was written once at creation and never again, so a conversation carried on
  // for a week still claimed to be untouched. Skipped when it already says today; wrapped,
  // because the turn is the product and a date is a courtesy.
  const today = stamp(now);
  if (app.metadataCache?.getFileCache(file)?.frontmatter?.updated === today) return;
  try {
    await app.fileManager.processFrontMatter(file, (front) => { front.updated = today });
  } catch { /* the turn is on disk, which is the part that mattered */ }
}

