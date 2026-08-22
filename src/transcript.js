/**
 * Reading a conversation back out of the file it was written to.
 *
 * There is no session store, deliberately: the markdown is the interface between one
 * sitting and the next, which is what lets a conversation edited by hand still resume.
 */
import { DEFAULT_FOLDERS } from "./folders.js";

/** `**me** _(13:01)_` — who spoke, and the line the turn starts after. */
const SPEAKER = /^\*\*(.+?)\*\* _\(\d{1,2}:\d{2}\)_$/;

/**
 * Everything said, in order. Anything before the first speaker is this plugin's own header.
 *
 * A turn labelled `error` is dropped — it belongs in the transcript a person reads, not in
 * the history a model is asked to continue from.
 */
export function readTranscript(text) {
  const turns = [];
  let current = null;

  for (const line of String(text ?? "").split(/\r?\n/)) {
    const speaker = line.match(SPEAKER);
    if (speaker) {
      if (current) turns.push(current);
      current = { who: speaker[1], lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) turns.push(current);

  return turns
    .filter((turn) => turn.who !== "error")
    .map((turn) => ({
      who: turn.who,
      // "me" is the only speaker that is not a model: a reply is labelled with whichever
      // model answered, and that can change mid-conversation.
      role: turn.who === "me" ? "user" : "assistant",
      text: turn.lines.join("\n").trim(),
    }))
    .filter((turn) => turn.text);
}

/** The conversations you could pick up again, most recent first. */
export function conversationsIn(app, folder = DEFAULT_FOLDERS.conversations) {
  return app.vault.getMarkdownFiles()
    .filter((file) => file.path.startsWith(`${folder}/`))
    .sort((a, b) => (b.stat?.mtime ?? 0) - (a.stat?.mtime ?? 0));
}
