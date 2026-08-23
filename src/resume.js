/**
 * Picking a conversation up where it was left (TKT-0110).
 *
 * A lifecycle step rather than part of running a turn, like naming — so it lives beside the
 * view rather than inside it.
 *
 * Everything is rebuilt from the file, because the file is the record and there is no
 * session store behind it. That is what makes a conversation edited by hand, or written on
 * another machine and synced here, pick up exactly the same as one this panel just wrote.
 */
import { Notice } from "obsidian";
import { ConversationPicker } from "./picker.js";
import { readTranscript } from "./transcript.js";
import { foldersOf } from "./folders.js";
import { clearAttachments } from "./attaching.js";

/** Offers the conversations that exist, and picks up whichever one is chosen. */
export function pickConversation(view) {
  if (view.busy) return new Notice("Still answering — one moment.");
  new ConversationPicker(view.app, foldersOf(view.plugin.settings).conversations,
    (file) => resumeConversation(view, file)).open();
}

/**
 * Loads a conversation back into the panel.
 *
 * Marked as already named: it earned its title on the first answer, and renaming it now
 * would move a file that may already be linked from a note.
 */
export async function resumeConversation(view, file) {
  if (view.busy) return new Notice("Still answering — one moment.");

  const history = readTranscript(await view.app.vault.read(file));
  view.session = { history, file: file.path, model: null, provider: null };
  view.named = true;

  view.thread.empty();
  const rendering = [];
  for (const turn of history) {
    const row = view.thread.add(turn.who, turn.text, { literal: turn.role === "user" });
    if (turn.role === "assistant") rendering.push(view.thread.render(row, turn.text, file.path));
  }

  // After the markdown is actually on the page, not before. Every turn scrolls to the end
  // as it is added, but rendering grows the thread underneath afterwards — so without this
  // a resumed conversation opens somewhere in the middle of the last answer.
  await Promise.all(rendering);
  view.thread.toEnd();

  view.where.show(file.path);
  view.refresh?.();
  view.composer.focus();
  if (!history.length) new Notice("That conversation has nothing in it yet.");
}

/**
 * Starts a fresh conversation.
 *
 * Nothing is lost and nothing is asked: the previous one is a note in the vault, and the
 * only thing being cleared is the view of it. Saying where it went is the point — that is
 * the question this moment raises, and the answer is reassuring.
 *
 * Refused mid-turn, because clearing the thread while a reply is arriving would orphan it:
 * the file would keep the answer and the screen would not.
 */
export function startConversationAfresh(view) {
  if (view.busy) return new Notice("Still answering — one moment.");

  const previous = view.where.path;
  view.session = null;
  view.named = false;
  view.thread.empty();
  view.where.show(null);
  // Whatever was attached belonged to the question that was never asked. Carrying it into
  // a new conversation would send it somewhere it was never meant for.
  clearAttachments(view);
  view.refresh?.();
  view.composer.focus();

  if (previous) new Notice(`Saved as ${previous.split("/").pop()}`);
}
