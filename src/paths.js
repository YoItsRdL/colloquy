/**
 * Where a conversation lives, and what it is called.
 *
 * Pure: no Obsidian, no filesystem. The date is a folder rather than a filename prefix,
 * as a prefix it spent the first ten characters of every name in a folder saying what the
 * folder already said.
 */

/** Two digits, because a folder listing sorts as text. */
const pad = (n) => String(n).padStart(2, "0");

/** `<root>/2026/08/19`. The root is configurable (ADR-0010); the sharding is not. */
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

/** A filename from the question, or from a title once there is one. */
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
 * The first name not already taken. Asking the same question twice in a day is ordinary,
 * and the second silently replacing the first is a loss nobody notices until they look.
 */
export function freeName(folder, base, exists) {
  for (let n = 1; n < 100; n++) {
    const path = `${folder}/${base}${n === 1 ? "" : `-${n}`}.md`;
    if (!exists(path)) return path;
  }
  // A hundred collisions in one day is not a name problem any more.
  return `${folder}/${base}-${Date.now()}.md`;
}
