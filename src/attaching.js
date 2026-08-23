/**
 * Holding what a question is about, until it is asked (ADR-0011).
 *
 * A lifecycle step beside the view rather than inside it, like naming and resuming. The
 * list belongs to the panel and not to any one conversation: attaching a note and then
 * changing your mind about which conversation to ask should not lose it.
 */
import { Menu } from "obsidian";
import { AttachPicker, readAttachment } from "./attach-picker.js";
import { chooseFromDisk } from "./attach-disk.js";

/** Redraws the row, with removal wired to the list it is drawn from. */
export function showAttachments(view) {
  view.composer.showAttached(view.attachments, (index) => {
    view.attachments.splice(index, 1);
    showAttachments(view);
  });
}

/** The same file twice is a slip, not an instruction. It would be sent and paid for twice. */
function hold(view, attachment) {
  if (!attachment) return;
  if (!view.attachments.some((a) => a.path === attachment.path)) view.attachments.push(attachment);
  showAttachments(view);
  view.composer.focus();
}

/**
 * Where the thing you want to ask about is.
 *
 * Two routes rather than one. The vault is first because it is usually the answer. This is
 * a plugin for an app already full of your notes and screenshots, but insisting on it
 * would refuse the photo on your desktop for no better reason than where it happens to be.
 */
export function pickAttachment(view, event) {
  const menu = new Menu();

  menu.addItem((item) => item
    .setTitle("From your vault")
    .setIcon("vault")
    .onClick(() => new AttachPicker(view.app, async (file) => {
      hold(view, await readAttachment(view.app, file));
    }).open()));

  menu.addItem((item) => item
    .setTitle("From your computer")
    .setIcon("folder-open")
    // Copied into the vault on the way in, so from then on it behaves like anything else
    // here: the transcript can link to it and a sync carries it.
    .onClick(() => chooseFromDisk(view.app, (attachment) => hold(view, attachment))));

  if (event) menu.showAtMouseEvent(event);
  else menu.showAtPosition({ x: 0, y: 0 });
}

/** Empties the row, after a question is sent with them, or when one is abandoned. */
export function clearAttachments(view) {
  view.attachments = [];
  showAttachments(view);
}
