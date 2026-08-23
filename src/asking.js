/**
 * Asking, and what happens while the answer arrives.
 *
 * A lifecycle step beside the view rather than inside it, like naming, resuming and
 * attaching. The view is what Obsidian mounts; this is the one thing it does.
 *
 * The invariant worth stating once: the file never falls behind the screen. It exists
 * before the answer does, so a reply that fails halfway still has somewhere to be
 * recorded, and every turn is written whole rather than as it streams.
 */
import { runTurn } from "./turn.js";
import { startConversation, appendTurn } from "./vault.js";
import { nameConversation } from "./naming.js";
import { foldersOf } from "./folders.js";
import { asTurn, asLinks } from "./attach.js";
import { clearAttachments } from "./attaching.js";
import { attachMemory } from "./memory.js";

/**
 * A turn: shown as it arrives, written once it is whole.
 *
 * @param {{retry?: string}} options `retry` carries the question being asked again of a
 *   different provider — already in the history and already in the file, so it is neither
 *   pushed nor written twice.
 */
export async function ask(view, { retry = null } = {}) {
  const text = retry ?? view.composer.take();
  if (!text || view.busy) return;

  // Taken now and cleared now. They belong to this question, and leaving them on screen
  // would send them again with the next one.
  const carried = retry ? [] : view.attachments;
  if (!retry) clearAttachments(view);

  view.busy = true;
  // Stoppable from the moment it starts, not once a first token has arrived — the wait
  // before the first token is the longest part and the one most worth escaping.
  view.turn = new AbortController();
  view.composer.sending(true, view.sendButton);
  if (!retry) {
    view.composer.clear();
    const asked = view.thread.add("me", text, { literal: true });
    if (carried.length) {
      asked.body.createDiv({ cls: "colloquy-turn-attached", text: carried.map((a) => a.name).join(", ") });
    }
  }
  const reply = view.thread.add("…", "", { pending: true });
  view.refresh();

  try {
    const config = await view.plugin.config();
    if (!config.key) {
      // Names the place it can be fixed. "No key" without that is a dead end.
      throw new Error(`No key for ${config.provider.label ?? config.provider.name}. Add one in Settings → Colloquy.`);
    }

    view.session = view.session ?? { history: [], file: null, model: null, provider: null };
    // The question and whatever it is about, as one turn: notes folded into the text so
    // any model can read them, images alongside so the ones that can see, can.
    const turn = asTurn(text, carried);
    if (!retry) view.session.history.push({ role: "user", text: turn.text, images: turn.images });

    // What earlier conversations noticed, fetched once for this conversation. Doing it
    // per turn would re-read the same files to build the same block, and doing it when
    // the panel opens would spend the reads on a conversation that never happens.
    await attachMemory(view.app, view.session, {
      enabled: view.plugin.settings.useMemory !== false,
      settings: view.plugin.settings,
    });

    // The file exists before the answer does, so a reply that fails halfway still has
    // somewhere to be recorded (standard 5).
    if (!view.session.file) {
      const folders = foldersOf(view.plugin.settings);
      view.session.file = await startConversation(view.app, {
        question: text,
        provider: config.provider.name,
        model: config.model,
        root: folders.conversations,
        context: folders.context,
      });
      view.where.show(view.session.file);
    }
    // Links rather than copies: the file is already in the vault, and Obsidian renders
    // an embedded image from a wikilink without this having to store one.
    const written = carried.length ? `${text}\n\n${asLinks(carried)}` : text;
    if (!retry) await appendTurn(view.app, view.session.file, "me", written);

    // Named while it is still thinking, so the wait says what is being waited on.
    reply.label.setText(config.model);

    const outcome = await runTurn(
      config,
      view.session,
      { onChunk: (_chunk, whole) => view.thread.render(reply, whole) },
      view.turn.signal,
    );

    if (outcome.reply) {
      view.session.history.push({ role: "assistant", text: outcome.reply });
      await appendTurn(view.app, view.session.file, outcome.answered?.model ?? config.model, outcome.reply);
      reply.label.setText(outcome.answered?.model ?? config.model);
      view.thread.render(reply, outcome.reply);

      // Deliberately not awaited. Naming asks the model a second question, and a
      // reasoning model took sixty-six seconds over it here — awaiting that would leave
      // Send disabled for a minute after the answer had already arrived. The answer is
      // on disk; the name can catch up whenever it is ready.
      nameConversation(view, outcome.answered ?? config);

      // Restarts the idle clock. It measures silence rather than age, so a conversation
      // is read once it is actually finished rather than once it is old.
      if (view.plugin.settings.autoRead !== false) view.plugin.sweep.touch(view.session.file);
    }

    // Said plainly, with the one thing a person wants next. Choosing a different provider
    // is a thing they do with the chips, when they want to (ADR-0009).
    if (outcome.detail) {
      await appendTurn(view.app, view.session.file, "error", outcome.detail);
      const failure = view.thread.add("could not finish", outcome.detail, { failed: true });
      const again = failure.body.createEl("button", { text: "Try again", cls: "colloquy-again" });
      // The question is already in the history and already in the file, so this asks it
      // again rather than writing it twice.
      again.onclick = () => { failure.turn.remove(); view.send({ retry: text }) };
    }
  } catch (err) {
    view.thread.add("could not finish", String(err.message ?? err), { failed: true });
  } finally {
    if (!reply.body.textContent) reply.turn.remove();
    view.busy = false;
    view.turn = null;
    view.composer.sending(false, view.sendButton);
    view.composer.focus();
  }
}
