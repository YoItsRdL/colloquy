/** Naming a conversation from what it turned out to be about. */
import { proposeTitle, slugFrom } from "./title.js";
import { renameConversation } from "./vault.js";

/**
 * Once per conversation, on the first answered turn, naming it again would move a file
 * somebody may already have opened or linked.
 *
 * Never awaited: a reasoning model took sixty-six seconds to title "hello", which would
 * have left the composer disabled long after the answer arrived.
 *
 * @param answered the model that just replied, which names the conversation unless one was
 *   set for the unattended work (ADR-0016). Naming is unattended: it costs a request nobody
 *   asked for, and on a paid provider it is a request per conversation for a filename.
 */
export async function nameConversation(view, answered) {
  if (view.named || !view.session?.file) return;
  if (view.plugin.settings.autoName === false) return;
  view.named = true;   // set before awaiting, so a fast second turn cannot race it

  const session = view.session;
  const path = session.file;

  // A failure here is not worth losing the name over: whatever answered can still be asked.
  const background = await view.plugin.background().catch(() => null);
  const text = await proposeTitle(background?.chosen ? background : answered, session.history);
  const slug = slugFrom(text);
  if (!text || !slug) return;   // the plain name is a working name

  const moved = await renameConversation(view.app, path, { text, slug });
  if (moved === path) return;

  session.file = moved;
  view.plugin.sweep.renamed(path, moved);
  // Only if this is still the conversation on screen; otherwise the panel has moved on.
  if (view.session === session) view.where.show(moved);
}
