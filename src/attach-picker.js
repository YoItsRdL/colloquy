/**
 * Choosing something from the vault to ask about (ADR-0011).
 *
 * The vault half of the paperclip; `attach-disk.js` is the other. This one is first because
 * it is usually the answer. The app is already full of your notes and screenshots.
 */
import { FuzzySuggestModal, Notice } from "obsidian";
import { kindOf, mimeOf, refuse } from "./attach.js";

/** Base64 without a FileReader, which is not available to a plugin outside a document. */
function base64Of(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // In chunks: String.fromCharCode with a few million arguments overflows the call stack,
  // which a 4MB image comfortably would.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Reads a vault file into something a turn can carry.
 *
 * @returns the attachment, or null with the reason already shown. The caller has nothing
 * useful to add to "that file is 12MB".
 */
export async function readAttachment(app, file) {
  const why = refuse(file);
  if (why) {
    new Notice(why, 6000);
    return null;
  }

  const kind = kindOf(file.name);
  if (kind === "text") {
    return { kind, name: file.name, path: file.path, text: await app.vault.cachedRead(file) };
  }
  return {
    kind,
    name: file.name,
    path: file.path,
    mime: mimeOf(file.name),
    data: base64Of(await app.vault.readBinary(file)),
  };
}

export class AttachPicker extends FuzzySuggestModal {
  constructor(app, onPick) {
    super(app);
    this.onPick = onPick;
    this.setPlaceholder("Attach a note or an image from your vault");
  }

  /** Everything the models can actually read, so nothing offered here can be refused. */
  getItems() {
    return this.app.vault.getFiles()
      .filter((file) => kindOf(file.name))
      .sort((a, b) => (b.stat?.mtime ?? 0) - (a.stat?.mtime ?? 0));
  }

  getItemText(file) {
    return file.path;
  }

  onChooseItem(file) {
    this.onPick(file);
  }
}
