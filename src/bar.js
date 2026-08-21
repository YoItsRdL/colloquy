/**
 * The panel's own action bar (TKT-0102).
 *
 * In the panel, not in the view header. `addAction` puts controls where Obsidian shows
 * view actions, which in a sidebar leaf can be hidden entirely by the tab-title setting —
 * and an action nobody can find is one that does not exist. The command palette entry in
 * main.js covers the keyboard.
 */
import { setIcon } from "obsidian";

function action(bar, { icon, text, title, onClick }) {
  // A control with no label needs a target of its own — at text size it is otherwise as
  // wide as its glyph, which is findable only by somebody who already knew it was there.
  const button = bar.createEl("button", { cls: text ? "colloquy-new" : "colloquy-new is-icon-only" });
  setIcon(button.createSpan({ cls: "colloquy-new-icon" }), icon);
  if (text) button.createSpan({ text });
  // A control with no label needs one somewhere, and a tooltip is where Obsidian puts it.
  button.setAttr("aria-label", title ?? text);
  button.onclick = onClick;
  return button;
}

/**
 * Starting a conversation, and going back to one.
 *
 * There was a third control here — a queue of proposed notes waiting to be approved. It
 * went with the claims it was approving (ADR-0007): what the sweep writes now is an account
 * of what we were doing, which nobody needs to authorise.
 */
export function createBar(container, { onNew, onPick }) {
  const bar = container.createDiv({ cls: "colloquy-bar" });
  action(bar, { icon: "plus", text: "New conversation", onClick: onNew });
  action(bar, { icon: "history", title: "Pick up a conversation", onClick: onPick });
}
