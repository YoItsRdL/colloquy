/**
 * Choosing a conversation to pick up again (TKT-0110).
 *
 * Obsidian's own fuzzy suggester rather than a list of our own: it is the control people
 * already use to find anything in this app, down to the keys that move the selection, and
 * a bespoke one would be a worse copy of it.
 */
import { FuzzySuggestModal } from "obsidian";
import { conversationsIn } from "./transcript.js";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The day it happened, said the way a person would say it. */
function when(time) {
  if (!time) return "";
  const date = new Date(time);
  const days = Math.floor((Date.now() - time) / 86400000);
  if (days < 1) return `today, ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (days < 2) return "yesterday";
  if (days < 7) return DAY[date.getDay()];
  return date.toLocaleDateString();
}

export class ConversationPicker extends FuzzySuggestModal {
  constructor(app, root, onPick) {
    super(app);
    this.root = root;
    this.onPick = onPick;
    this.setPlaceholder("Pick up a conversation");
  }

  getItems() {
    return conversationsIn(this.app, this.root);
  }

  /** The subject, which is the whole of the filename since the folder carries the date. */
  getItemText(file) {
    return file.basename.replace(/-/g, " ");
  }

  renderSuggestion(match, el) {
    super.renderSuggestion(match, el);
    el.createDiv({ cls: "colloquy-pick-when", text: when(match.item.stat?.mtime) });
  }

  onChooseItem(file) {
    this.onPick(file);
  }
}
