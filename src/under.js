/**
 * The files inside one folder, without looking at the rest of the vault.
 *
 * Every caller here wanted the contents of a folder it already knew the name of, and got
 * there by listing every markdown file in the vault and discarding the ones that did not
 * start with the right prefix. The result was identical and the reach was not: a plugin
 * that calls `getMarkdownFiles()` has read the path of every note you own, including the
 * folders it has no business knowing exist.
 *
 * Obsidian's automated review names this as vault enumeration, and it is right to. Asking
 * a folder for its children is the same answer with none of the reach, and on a large
 * vault it is also the difference between walking three files and walking nine thousand.
 *
 * The one place still enumerating is the attachment picker, which offers you anything in
 * the vault and cannot do that without seeing the vault. That one is asked for by name,
 * by you, at the moment you open it.
 */

/**
 * Markdown files under `folder`, recursively, in no particular order.
 *
 * A folder that does not exist yet is not an error: both folders here are created on
 * first write, so every caller runs at least once before there is anything to list.
 */
export function markdownUnder(app, folder) {
  const root = app.vault.getAbstractFileByPath(folder);
  if (!root || !("children" in root)) return [];

  const found = [];
  const walk = (dir) => {
    for (const child of dir.children ?? []) {
      if ("children" in child) walk(child);
      else if (child.extension === "md") found.push(child);
    }
  };
  walk(root);
  return found;
}
