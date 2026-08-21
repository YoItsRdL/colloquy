/**
 * The conversation, as an Obsidian view (ADR-0001).
 *
 * Built from Obsidian's own DOM helpers and theme variables rather than a private
 * stylesheet. That is not a compromise: a panel that ignores the reader's theme is the
 * one thing that would make this feel bolted on rather than part of the app.
 *
 * The gateway's interface decisions carry over — the human turn shown exactly as typed,
 * the model's rendered, the reply labelled with whichever model actually answered — but
 * none of its CSS does.
 */
import { ItemView, Notice } from "obsidian";
import { runTurn } from "./turn.js";
import { startConversation, appendTurn } from "./vault.js";
import { nameConversation } from "./naming.js";
import { createChips } from "./chips.js";
import { createThread } from "./thread.js";
import { createWhere } from "./where.js";
import { createComposer } from "./composer.js";
import { createBar } from "./bar.js";
import { foldersOf } from "./folders.js";
import { asTurn, asLinks } from "./attach.js";
import { pickAttachment, clearAttachments } from "./attaching.js";
import { attachMemory } from "./memory.js";
import { pickConversation, resumeConversation, startConversationAfresh } from "./resume.js";

export const VIEW_TYPE = "colloquy-conversation";

export class ConversationView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.session = null;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Colloquy"; }
  getIcon() { return "message-square"; }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass("colloquy-view");

    createBar(root, { onNew: () => this.startNew(), onPick: () => this.pick() });

    this.thread = createThread(root, { app: this.app, component: this });
    this.attachments = [];
    this.composer = createComposer(root, {
      onSend: () => this.send(),
      onStop: () => this.stop(),
      onAttach: (event) => this.attach(event),
    });
    this.composer.addAttach();
    const controls = this.composer.controls;

    // Which provider and model answer are facts nobody can infer from the panel, and ones
    // worth changing per question — a capable model for a hard one, a cheap one for a
    // lookup. That is the whole reason these are controls rather than labels.
    this.chips = createChips({ container: controls, plugin: this.plugin });

    this.where = createWhere(controls, { app: this.app });
    this.sendButton = this.composer.addSend();
  }

  /**
   * A turn: shown as it arrives, written once it is whole.
   *
   * @param {{retry?: string}} options `retry` carries the question being asked again of
   *   a different provider — already in the history and already in the file, so it is
   *   neither pushed nor written twice.
   */
  async send({ retry = null } = {}) {
    const text = retry ?? this.composer.take();
    if (!text || this.busy) return;

    // Taken now and cleared now. They belong to this question, and leaving them on screen
    // would send them again with the next one.
    const carried = retry ? [] : this.attachments;
    if (!retry) clearAttachments(this);

    this.busy = true;
    // Stoppable from the moment it starts, not once a first token has arrived — the wait
    // before the first token is the longest part and the one most worth escaping.
    this.turn = new AbortController();
    this.composer.sending(true, this.sendButton);
    if (!retry) {
      this.composer.clear();
      const asked = this.thread.add("me", text, { literal: true });
      if (carried.length) {
        asked.body.createDiv({ cls: "colloquy-turn-attached", text: carried.map((a) => a.name).join(", ") });
      }
    }
    const reply = this.thread.add("…", "", { pending: true });

    try {
      const config = await this.plugin.config();
      if (!config.key) {
        // Names the place it can be fixed. "No key" without that is a dead end.
        throw new Error(`No key for ${config.provider.label ?? config.provider.name}. Add one in Settings → Colloquy.`);
      }

      this.session = this.session ?? { history: [], file: null, model: null, provider: null };
      // The question and whatever it is about, as one turn: notes folded into the text so
      // any model can read them, images alongside so the ones that can see, can.
      const turn = asTurn(text, carried);
      if (!retry) this.session.history.push({ role: "user", text: turn.text, images: turn.images });

      // What earlier conversations noticed, fetched once for this conversation. Doing it
      // per turn would re-read the same files to build the same block, and doing it when
      // the panel opens would spend the reads on a conversation that never happens.
      await attachMemory(this.app, this.session, {
        enabled: this.plugin.settings.useMemory !== false,
        settings: this.plugin.settings,
      });

      // The file exists before the answer does, so a reply that fails halfway still has
      // somewhere to be recorded (standard 5).
      if (!this.session.file) {
        const folders = foldersOf(this.plugin.settings);
        this.session.file = await startConversation(this.app, {
          question: text,
          provider: config.provider.name,
          model: config.model,
          root: folders.conversations,
          context: folders.context,
        });
        this.where.show(this.session.file);
      }
      // Links rather than copies: the file is already in the vault, and Obsidian renders
      // an embedded image from a wikilink without this having to store one.
      const written = carried.length ? `${text}\n\n${asLinks(carried)}` : text;
      if (!retry) await appendTurn(this.app, this.session.file, "me", written);

      // Named while it is still thinking, so the wait says what is being waited on.
      reply.label.setText(config.model);

      const outcome = await runTurn(
        config,
        this.session,
        { onChunk: (_chunk, whole) => this.thread.render(reply, whole) },
        this.turn.signal,
      );

      if (outcome.reply) {
        this.session.history.push({ role: "assistant", text: outcome.reply });
        await appendTurn(this.app, this.session.file, outcome.answered?.model ?? config.model, outcome.reply);
        reply.label.setText(outcome.answered?.model ?? config.model);
        this.thread.render(reply, outcome.reply);

        // Deliberately not awaited. Naming asks the model a second question, and a
        // reasoning model took sixty-six seconds over it here — awaiting that would leave
        // Send disabled for a minute after the answer had already arrived. The answer is
        // on disk; the name can catch up whenever it is ready.
        nameConversation(this, outcome.answered ?? config);

        // Restarts the idle clock. It measures silence rather than age, so a conversation
        // is read once it is actually finished rather than once it is old.
        if (this.plugin.settings.autoRead !== false) this.plugin.sweep.touch(this.session.file);
      }

      // Said plainly, with the one thing a person wants next. Choosing a different provider
      // is a thing they do with the chips, when they want to (ADR-0009).
      if (outcome.detail) {
        await appendTurn(this.app, this.session.file, "error", outcome.detail);
        const failure = this.thread.add("could not finish", outcome.detail, { failed: true });
        const again = failure.body.createEl("button", { text: "Try again", cls: "colloquy-again" });
        // The question is already in the history and already in the file, so this asks it
        // again rather than writing it twice.
        again.onclick = () => { failure.turn.remove(); this.send({ retry: text }) };
      }
    } catch (err) {
      this.thread.add("could not finish", String(err.message ?? err), { failed: true });
    } finally {
      if (!reply.body.textContent) reply.turn.remove();
      this.busy = false;
      this.turn = null;
      this.composer.sending(false, this.sendButton);
      this.composer.focus();
    }
  }

  attach(event) {
    pickAttachment(this, event);
  }

  /**
   * Stops the answer that is arriving.
   *
   * Whatever has already been said is kept and written, because it is what the model said
   * — and the usual reason for stopping is that enough of it has arrived to know the rest
   * is not wanted.
   */
  stop() {
    this.turn?.abort();
  }

  startNew() {
    startConversationAfresh(this);
  }

  pick() {
    pickConversation(this);
  }

  resume(file) {
    return resumeConversation(this, file);
  }

  async onClose() {
    this.contentEl.empty();
  }
}

