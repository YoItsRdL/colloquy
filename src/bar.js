/**
 * The panel's own action bar.
 *
 * In the panel rather than the view header: `addAction` puts controls where a sidebar leaf
 * can hide them entirely via the tab-title setting.
 */
import { setIcon } from "obsidian";

function action(bar, { icon, text, title, onClick }) {
  // An icon-only control needs a target of its own; otherwise it is as wide as its glyph.
  const button = bar.createEl("button", { cls: text ? "colloquy-new" : "colloquy-new is-icon-only" });
  setIcon(button.createSpan({ cls: "colloquy-new-icon" }), icon);
  if (text) button.createSpan({ text });
  button.setAttr("aria-label", title ?? text);
  button.onclick = onClick;
  return button;
}

export function createBar(container, { onNew, onPick }) {
  const bar = container.createDiv({ cls: "colloquy-bar" });
  action(bar, { icon: "plus", text: "New conversation", onClick: onNew });
  action(bar, { icon: "history", title: "Pick up a conversation", onClick: onPick });
}
