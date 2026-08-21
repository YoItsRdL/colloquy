/**
 * Reading a conversation back out of the file it was written to (TKT-0110).
 *
 * The file is the record — there is no session store, and there deliberately isn't one, so
 * picking a conversation up again means parsing what `appendTurn` wrote. That makes the
 * markdown the interface between one sitting and the next, which is the property that lets
 * someone edit a conversation by hand and have it still work.
 */
import { DEFAULT_FOLDERS } from "./folders.js";

/** `**me** _(13:01)_` — who spoke, and the line the turn starts after. */
const SPEAKER = /^\*\*(.+?)\*\* _\(\d{1,2}:\d{2}\)_$/;

/**
 * Everything said, in order.
 *
 * Anything before the first speaker is the header this plugin wrote — frontmatter, the
 * heading, the note about automatic reading — and is skipped rather than parsed, because
 * none of it was said by anybody.
 *
 * A turn labelled `error` is dropped. It records that a provider failed, which belongs in
 * the transcript a person reads but not in the history a model is asked to continue from.
 *
 * @returns {{role: 'user'|'assistant', text: string, who: string}[]}
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
      // "me" is the only speaker that is not a model, because the label a reply carries is
      // whichever model actually answered — which changes mid-conversation when a chain
      // moves, and must not be mistaken for the person coming back.
      role: turn.who === "me" ? "user" : "assistant",
      text: turn.lines.join("\n").trim(),
    }))
    .filter((turn) => turn.text);
}

/**
 * The conversations you could pick up again, most recent first.
 *
 * The folder comes from one place. This defaulted to `00-inbox` — the vault this was built
 * in — while the shipped default was `Conversations`, so the two disagreed about where
 * conversations live and only the fact that every caller passes a root kept it hidden.
 */
export function conversationsIn(app, folder = DEFAULT_FOLDERS.conversations) {
  return app.vault.getMarkdownFiles()
    .filter((file) => file.path.startsWith(`${folder}/`))
    .sort((a, b) => (b.stat?.mtime ?? 0) - (a.stat?.mtime ?? 0));
}
