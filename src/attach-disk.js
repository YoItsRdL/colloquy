/**
 * Attaching something that is not in the vault yet (ADR-0011).
 *
 * Copied into the vault on the way in, at Obsidian's own attachment path, so it behaves
 * like anything else afterwards. Sent but not saved would leave the conversation
 * referring to a file nothing in the vault can reach.
 */
import { Notice } from "obsidian";
import { kindOf, mimeOf, refuse } from "./attach.js";

/** Base64 without a FileReader, in chunks so a 4MB image does not overflow the call stack. */
function base64Of(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Opens the system file dialog and returns what was chosen, already in the vault.
 *
 * A hidden `<input type="file">` rather than Electron's dialog module: it is the same
 * dialog, it needs no access to Node from the renderer, and it keeps this working if the
 * plugin is ever run somewhere that has no Electron at all.
 */
export function chooseFromDisk(app, onPicked) {
  const input = createEl("input", { attr: { type: "file", multiple: true, accept: ".png,.jpg,.jpeg,.gif,.webp,.md,.txt,.csv,.json,.yaml,.yml,.js,.ts,.py,.html,.css" } });
  input.style.display = "none";
  activeDocument.body.appendChild(input);

  input.onchange = async () => {
    for (const file of Array.from(input.files ?? [])) {
      const attachment = await bringIntoVault(app, file);
      if (attachment) onPicked(attachment);
    }
    input.remove();
  };

  // Removed if the dialog is dismissed, so a cancelled attach leaves nothing behind. The
  // event is not universally reliable, which is why the change handler removes it too.
  input.addEventListener("cancel", () => input.remove());
  input.click();
}

/**
 * A clipboard image usually arrives called "image.png", and sometimes with no name at all.
 * Everything downstream decides what a file is from its extension, so a nameless one is
 * given a plausible one from its type rather than being refused for having none.
 */
const nameFor = (file) => file.name || `pasted.${(file.type ?? "").split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png"}`;

/**
 * Copies a chosen file into the vault and reads it as an attachment.
 *
 * The name Obsidian would have given it, `getAvailablePathForAttachment` honours whatever
 * attachment folder the person configured, and avoids collisions, so a file attached here
 * lands where the same file dropped into a note would have.
 */
export async function bringIntoVault(app, file) {
  const name = nameFor(file);
  const why = refuse({ name, size: file.size });
  if (why) {
    new Notice(why, 6000);
    return null;
  }

  try {
    const buffer = await file.arrayBuffer();
    const path = await app.fileManager.getAvailablePathForAttachment(name);
    const created = await app.vault.createBinary(path, buffer);

    const kind = kindOf(name);
    return kind === "text"
      ? { kind, name: created.name, path: created.path, text: new TextDecoder().decode(buffer) }
      : { kind, name: created.name, path: created.path, mime: mimeOf(name), data: base64Of(buffer) };
  } catch (err) {
    // Named, because "could not attach" leaves somebody guessing which of three files failed.
    new Notice(`${name} could not be brought into the vault: ${err?.message ?? err}`, 8000);
    return null;
  }
}
