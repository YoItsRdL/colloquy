/** Naming a conversation from what it turned out to be about. */
import { proposeTitle, slugFrom } from "./title.js";
import { renameConversation } from "./vault.js";

/**
 * Once per conversation, on the first answered turn — naming it again would move a file
 * somebody may already have opened or linked.
 *
 * Never awaited: a reasoning model took sixty-six seconds to title "hello", which would
 * have left the composer disabled long after the answer arrived.
 */
export async function nameConversation(view, candidate) {
  if (view.named || !view.session?.file) return;
  if (view.plugin.settings.autoName === false) return;
  view.named = true;   // set before awaiting, so a fast second turn cannot race it

  const session = view.session;
  const path = session.file;

  const text = await proposeTitle(candidate, session.history);
  const slug = slugFrom(text);
  if (!text || !slug) return;   // the plain name is a working name

  const moved = await renameConversation(view.app, path, { text, slug });
  if (moved === path) return;

  session.file = moved;
  // Only if this is still the conversation on screen; otherwise the panel has moved on.
  if (view.session === session) view.where.show(moved);
}
