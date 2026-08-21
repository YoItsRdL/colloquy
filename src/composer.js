/**
 * The box you type in, and the row of controls under it (TKT-0102, ADR-0011).
 *
 * A component like the thread and the file indicator, so the view composes four things
 * rather than building all of them itself.
 *
 * The row reads left to right as: what you are asking about, what will answer, where it
 * lands, and the one action. Send is the only filled control on it, which is the whole of
 * the hierarchy.
 */
import { setIcon } from "obsidian";

export function createComposer(container, { onSend, onStop, onAttach }) {
  const el = container.createDiv({ cls: "colloquy-composer" });

  // Above the box, because an attachment is part of the question rather than a setting on
  // it — and because a row that grew underneath would shift the controls as you added to
  // it, moving Send out from under the cursor.
  const attached = el.createDiv({ cls: "colloquy-attached" });

  const input = el.createEl("textarea", {
    attr: { rows: 2, placeholder: "Ask anything — it lands in your inbox" },
  });
  const controls = el.createDiv({ cls: "colloquy-controls" });

  input.addEventListener("keydown", (event) => {
    // Enter sends, Shift+Enter is a newline — the convention everywhere else that has a
    // box like this, and the one people's hands already know.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  });

  /**
   * What is attached, and how to change your mind about it.
   *
   * Rebuilt from the list rather than patched. The only two things that happen here are
   * "one more" and "not that one", and rebuilding three chips is cheaper to be right about
   * than tracking which element belonged to which file.
   */
  function showAttached(attachments, onRemove) {
    attached.empty();
    attached.toggleClass("has-any", attachments.length > 0);

    for (const [index, item] of attachments.entries()) {
      const chip = attached.createDiv({ cls: "colloquy-attachment" });
      setIcon(chip.createSpan({ cls: "colloquy-attachment-icon" }), item.kind === "image" ? "image" : "file-text");
      chip.createSpan({ text: item.name });

      const remove = chip.createEl("button", { text: "×", cls: "colloquy-attachment-x" });
      remove.setAttr("aria-label", `Remove ${item.name}`);
      remove.onclick = () => onRemove(index);
    }
  }

  /** A paperclip, first in the row: what you are asking about comes before who answers. */
  function addAttach() {
    const button = controls.createEl("button", { cls: "colloquy-attach" });
    setIcon(button, "paperclip");
    button.setAttr("aria-label", "Attach a note or an image");
    button.onclick = (event) => onAttach?.(event);
    return button;
  }

  /**
   * The one action, which is two actions.
   *
   * Send becomes Stop while an answer is arriving rather than going grey, because a
   * disabled button in the one place you are looking says only "wait" — and a local model
   * can take half a minute to decide it has nothing useful to say. The same control, in
   * the same place, is what makes the wait feel like something you are in rather than
   * something happening to you.
   */
  function addSend() {
    const button = controls.createEl("button", { text: "Send", cls: "mod-cta" });
    button.onclick = () => (button.hasClass("is-stopping") ? onStop?.() : onSend());
    return button;
  }

  /** Flips the one action between its two jobs. */
  function sending(on, button) {
    button.toggleClass("is-stopping", on);
    button.setText(on ? "Stop" : "Send");
  }

  return {
    el,
    input,
    controls,
    addAttach,
    showAttached,
    addSend,
    sending,
    take: () => input.value.trim(),
    clear: () => { input.value = ""; },
    focus: () => input.focus(),
  };
}
