/**
 * Where this conversation is being written (TKT-0102).
 *
 * A button, not a label: it opens the note, so it has to be reachable by keyboard and
 * announce itself as something that acts.
 *
 * The filename, not the path — every conversation for a day lives in the same folder, so
 * the folder is the part never in question. The whole path stays in the tooltip.
 */
import { Notice } from "obsidian";

export function createWhere(container, { app }) {
  const el = container.createEl("button", { cls: "colloquy-where" });
  let path = null;

  /**
   * Opens the note in the main area, not in this leaf: the panel is where you are asking,
   * and replacing it with the transcript would close the thing you were using.
   */
  async function reveal() {
    if (!path) return;
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) return new Notice("That conversation is no longer where it was written.");
    await app.workspace.getLeaf(false).openFile(file);
  }

  el.onclick = () => reveal();

  /**
   * Before the first turn there is no file, and an empty control reads as something that
   * failed to load — so it says so, and stops looking clickable, because it is not.
   */
  function show(next) {
    path = next;
    el.toggleClass("is-pending", !path);
    el.disabled = !path;
    // Without the extension. Every conversation is a `.md`, so printing it on each one
    // spends three characters of a cramped row saying nothing, next to the row's one action.
    el.setText(path ? path.split("/").pop().replace(/\.md$/, "") : "Not written yet");
    el.title = path ? `Open ${path}` : "This conversation reaches the vault on the first reply";
  }

  show(null);
  return { el, show, reveal, get path() { return path; } };
}
