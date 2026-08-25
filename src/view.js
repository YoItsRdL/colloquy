/**
 * The conversation, as an Obsidian view (ADR-0001).
 *
 * Built from Obsidian's own DOM helpers and theme variables rather than a private
 * stylesheet. That is not a compromise: a panel that ignores the reader's theme is the
 * one thing that would make this feel bolted on rather than part of the app.
 *
 * The gateway's interface decisions carry over, the human turn shown exactly as typed,
 * the model's rendered, the reply labelled with whichever model actually answered, but
 * none of its CSS does.
 */
import { ItemView } from "obsidian";
import { createChips } from "./chips.js";
import { createThread } from "./thread.js";
import { createWhere } from "./where.js";
import { createComposer } from "./composer.js";
import { createBar } from "./bar.js";
import { pickAttachment, pasteAttachments, noticeLinks } from "./attaching.js";
import { pickConversation, resumeConversation, startConversationAfresh } from "./resume.js";
import { createReady } from "./ready.js";
import { ask } from "./asking.js";

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
    this.ready = createReady(root, { app: this.app, plugin: this.plugin });
    this.attachments = [];
    this.composer = createComposer(root, {
      onSend: () => this.send(),
      onStop: () => this.stop(),
      onAttach: (event) => this.attach(event),
      onPaste: (event) => pasteAttachments(this, event),
      onTyping: (text) => noticeLinks(this, text),
    });
    this.composer.addAttach();
    const controls = this.composer.controls;

    // Which provider and model answer are facts nobody can infer from the panel, and ones
    // worth changing per question, a capable model for a hard one, a cheap one for a
    // lookup. That is the whole reason these are controls rather than labels.
    this.chips = createChips({ container: controls, plugin: this.plugin });

    this.where = createWhere(controls, { app: this.app });
    this.sendButton = this.composer.addSend();
    this.refresh();
  }

  /**
   * Shows only what currently means something. Called when the panel opens, when a
   * conversation starts or is picked up, and by the settings screen when a key changes.
   * The four moments at which the answer here can differ from the last time it was asked.
   */
  refresh() {
    const empty = !this.thread.el.children.length;
    const ready = this.ready.show(empty);
    // A Send that cannot send is the most prominent thing on the screen promising the one
    // thing that will not happen.
    this.sendButton.disabled = !ready;
    this.chips.toggle(ready);
    return ready;
  }

  /** @see ask, which is the whole of what this view does. */
  send(options) {
    return ask(this, options);
  }

  attach(event) {
    pickAttachment(this, event);
  }

  /**
   * Stops the answer that is arriving.
   *
   * Whatever has already been said is kept and written, because it is what the model said
   *, and the usual reason for stopping is that enough of it has arrived to know the rest
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

