/**
 * Giving a conversation a name from what it turned out to be about (TKT-0107).
 *
 * Its own file because it is a lifecycle step rather than part of running a turn: it
 * happens after the answer is safe on disk, it can fail without costing anything, and it
 * takes as long as it takes.
 */
import { proposeTitle, slugFrom } from "./title.js";
import { renameConversation } from "./vault.js";

/**
 * Once per conversation, on the first answered turn.
 *
 * Naming it again on every turn would move a file someone may already have opened,
 * linked, or filed.
 *
 * Never awaited by the caller: a reasoning model took sixty-six seconds to title "hello",
 * and waiting for that would leave the composer disabled long after the answer arrived.
 * The conversation it belongs to is captured up front, so a late rename cannot land on
 * whatever happens to be open by then.
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
  // Only if this is still the conversation on screen. Otherwise the file was renamed
  // correctly and the panel has moved on, which is not something to announce.
  if (view.session === session) view.where.show(moved);
}
