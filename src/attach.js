/**
 * Asking about something in your vault (ADR-0011).
 *
 * Two kinds, because they are different problems. A note is text, so it folds into the
 * question and every provider reads it. An image has to reach the wire, where each API
 * wants a different shape.
 *
 * Pure, reading the bytes is the caller's job.
 */

/**
 * Base64 inflates by about a third, and a provider that rejects an oversized request does
 * it after the upload rather than before. Four megabytes of image is a very large
 * screenshot and about five and a half on the wire.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** A note is only useful here if the model can read all of it, and it pays per character. */
export const MAX_TEXT_CHARS = 40_000;

const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

/** Anything Obsidian already treats as prose or code, which is most of what a vault holds. */
const TEXT_EXTENSIONS = new Set([
  "md", "txt", "csv", "json", "yaml", "yml", "xml", "html", "css",
  "js", "ts", "jsx", "tsx", "py", "rb", "go", "rs", "sh", "sql", "toml", "ini",
]);

const extensionOf = (name) => String(name ?? "").split(".").pop()?.toLowerCase() ?? "";

/** `image`, `text`, or null for something this cannot usefully send. */
export function kindOf(name) {
  const ext = extensionOf(name);
  if (IMAGE_TYPES[ext]) return "image";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  return null;
}

export const mimeOf = (name) => IMAGE_TYPES[extensionOf(name)] ?? null;

/**
 * Why a file cannot be sent, or null if it can.
 *
 * Said in the words of the thing being refused rather than as a code. Somebody who has
 * just attached a 12MB photo wants to know that, not that validation failed.
 */
export function refuse(file) {
  const kind = kindOf(file.name);
  if (!kind) return `${file.name} is not a kind of file a model can read here.`;
  if (kind === "image" && file.size > MAX_IMAGE_BYTES) {
    return `${file.name} is ${Math.round(file.size / 1024 / 1024)}MB, images have to be under 4MB.`;
  }
  return null;
}

/**
 * The question and its attachments, as one turn.
 *
 * Notes are folded into the text under their own heading, so the model is told which file
 * it is reading and where one ends. Images travel beside the text because that is the only
 * way they can travel.
 *
 * @returns {{text: string, images: {mime: string, data: string}[]}}
 */
export function asTurn(question, attachments = []) {
  const notes = attachments.filter((a) => a.kind === "text");
  const images = attachments.filter((a) => a.kind === "image");

  const parts = [];
  for (const note of notes) {
    const body = String(note.text ?? "");
    const cut = body.length > MAX_TEXT_CHARS;
    parts.push(
      `--- ${note.name} ---`,
      cut ? body.slice(0, MAX_TEXT_CHARS) : body,
      // Said in the text rather than left for the model to notice, because a note that
      // stops mid-sentence reads as a note that ends there.
      cut ? `--- (${note.name} continues beyond what was sent) ---` : "--- end ---",
      "",
    );
  }

  return {
    text: parts.length ? `${parts.join("\n")}\n${question}` : question,
    images: images.map((image) => ({ mime: image.mime, data: image.data })),
  };
}

/** How an attachment is written into the transcript, so the file records what was asked about. */
export const asLinks = (attachments = []) =>
  attachments.map((a) => (a.kind === "image" ? `![[${a.name}]]` : `[[${a.name}]]`)).join("\n");
