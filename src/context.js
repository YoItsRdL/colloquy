/**
 * Where what we learned about ourselves is kept (ADR-0007).
 *
 * A record of what happened, not durable knowledge — which is why it is filed apart from
 * wherever a vault keeps its notes. A statement about the people in a conversation, sitting
 * in the folder reserved for claims about the world, is a category error that whatever
 * reads the vault next will quietly propagate.
 *
 * One record per conversation, rewritten when the conversation grows. A conversation picked
 * up a week later is still one thing that happened, and two half-accounts of it would be
 * worse than one whole one.
 */
const pad = (n) => String(n).padStart(2, "0");

export const stampOf = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const logFolder = (date, root) => `${root}/${date.getFullYear()}/${pad(date.getMonth() + 1)}`;

/**
 * Makes a folder and everything above it.
 *
 * A folder that already exists is the normal case, not a problem — two writes racing on the
 * same day would otherwise fail the second one for arriving second.
 */
export async function ensureFolder(app, folder) {
  const parts = folder.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const path = parts.slice(0, i).join("/");
    if (app.vault.getAbstractFileByPath(path)) continue;
    try { await app.vault.createFolder(path); } catch { /* raced, which is harmless */ }
  }
}

/** Named for the day and the conversation, so the record and its source are obviously a pair. */
export function recordPath(source, date, root) {
  const name = source.replace(/\.md$/, "").split("/").pop();
  return `${logFolder(date, root)}/${pad(date.getDate())}-${name}.md`;
}

/**
 * Writes what this conversation said about us.
 *
 * Overwrites rather than appends. The account describes the whole conversation, so when a
 * conversation is picked up again and read a second time, the new account replaces the old
 * one instead of sitting beside a version of itself that stops halfway.
 */
export async function writeContext(app, { context, source, root }, now = new Date()) {
  if (!context) return null;

  const folder = logFolder(now, root);
  await ensureFolder(app, folder);

  const path = recordPath(source, now, root);
  const name = source.replace(/\.md$/, "").split("/").pop();
  const text = [
    "---",
    "type: context",
    `created: ${stampOf(now)}`,
    // The vault's rule: nothing this plugin writes is ever claimed as the person's own.
    "author: agent",
    `source: "[[${name}]]"`,
    "---",
    "",
    context,
    "",
  ].join("\n");

  const existing = app.vault.getAbstractFileByPath(path);
  if (existing) await app.vault.modify(existing, text);
  else await app.vault.create(path, text);

  return path;
}

/**
 * What has been noticed about us, most recent first.
 *
 * This is the half that makes it memory rather than a diary — a record nothing ever reads
 * back is just a log with ambitions.
 */
export function recentContext(app, root, limit = 12) {
  return app.vault.getMarkdownFiles()
    .filter((file) => file.path.startsWith(`${root}/`))
    .sort((a, b) => (b.stat?.mtime ?? 0) - (a.stat?.mtime ?? 0))
    .slice(0, limit);
}
