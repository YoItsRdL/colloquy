/**
 * Where a conversation lives, and what it is called (TKT-0108).
 *
 * Pure: no Obsidian, no filesystem. Path rules are exactly the sort of thing that should
 * be tested exhaustively and cheaply, and until this file existed they were buried in the
 * code that wrote the files.
 *
 * The date is a folder, not a prefix. It was both, which meant every filename in a folder
 * of one day's conversations began with the same ten characters — ten characters of
 * nothing, in the part of the name a person reads. It is still in the frontmatter, where
 * it can be queried.
 */

/** Two digits, because a folder listing sorts as text. */
const pad = (n) => String(n).padStart(2, "0");

/**
 * `<root>/2026/08/19` — the same year/month sharding the vault uses, a day deeper.
 *
 * The root is passed in rather than named here (ADR-0010). The sharding is not: a folder
 * per day is what stops one folder holding four years of conversations, and it is the same
 * rule whatever the folder above it is called.
 */
export function folderFor(date, root) {
  return [
    root,
    String(date.getFullYear()),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("/");
}

/** Every folder that has to exist first, outermost first. */
export function foldersToCreate(date, root) {
  const parts = folderFor(date, root).split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/**
 * A filename from the question, or from a title once there is one.
 *
 * Named after what it is about and nothing else. Punctuation goes, because a filename
 * lives on filesystems with opinions about it, and length is capped because a name that
 * needs scrolling is not a name.
 */
export function nameFor(text) {
  const slug = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "conversation";
}

/**
 * The first name not already taken.
 *
 * Asking the same question twice in a day is ordinary, and the second one silently
 * replacing the first is the kind of loss nobody notices until they go looking.
 */
export function freeName(folder, base, exists) {
  for (let n = 1; n < 100; n++) {
    const path = `${folder}/${base}${n === 1 ? "" : `-${n}`}.md`;
    if (!exists(path)) return path;
  }
  // A hundred collisions in one day is not a name problem any more; the timestamp ends it.
  return `${folder}/${base}-${Date.now()}.md`;
}
