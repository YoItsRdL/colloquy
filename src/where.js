/**
 * Where this conversation is being written.
 *
 * A button rather than a label, because it opens the note. The filename only; the whole
 * path stays in the tooltip.
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
   * Before the first turn there is no file, so there is nothing to report and the control
   * is not shown at all.
   *
   * It used to say "Not written yet", on the reasoning that an empty control reads as one
   * that failed to load. True of a control that is always present — but it is a whole row
   * on a phone, spent answering a question nobody had yet asked. Absent says the same
   * thing and costs nothing.
   */
  function show(next) {
    path = next;
    el.toggleClass("is-hidden", !path);
    el.toggleClass("is-pending", !path);
    el.disabled = !path;
    // Without the extension: every conversation is a .md, so it says nothing.
    el.setText(path ? path.split("/").pop().replace(/\.md$/, "") : "Not written yet");
    el.title = path ? `Open ${path}` : "This conversation reaches the vault on the first reply";
  }

  show(null);
  return { el, show, reveal, get path() { return path; } };
}
