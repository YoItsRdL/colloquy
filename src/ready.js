/**
 * What the panel shows before it can answer anything.
 *
 * A panel with no provider configured used to show a full set of controls that could not
 * be used and a Send button that could not send: three controls saying nothing — "No
 * provider", "—", "Not written yet" — under the most prominent thing on screen being the
 * one thing guaranteed to fail. Every one of them was honest and none of them helped.
 *
 * So the controls are hidden until they mean something, and this takes their place: what
 * is missing, and the one action that fixes it. When a provider *is* configured, an empty
 * thread shows nothing at all — a blank page above a composer needs no explaining.
 */
import { setIcon, Notice } from "obsidian";
import { status } from "./keys.js";
import { all as allAdapters } from "./providers/index.js";

/** Whether anything can answer a question right now. */
export const canAnswer = (settings) =>
  status(allAdapters(), settings).some((key) => key.configured);

/**
 * Obsidian's settings screen is opened through an API it does not document, so a failure
 * has to be survivable: the panel says where to go by hand rather than doing nothing.
 */
function openSettings(app, id) {
  try {
    app.setting.open();
    app.setting.openTabById(id);
  } catch {
    new Notice("Open Settings → Community plugins → Colloquy to add a key.", 8000);
  }
}

export function createReady(container, { app, plugin }) {
  const el = container.createDiv({ cls: "colloquy-ready" });

  const icon = el.createDiv({ cls: "colloquy-ready-icon" });
  setIcon(icon, "key-round");
  el.createDiv({ cls: "colloquy-ready-title", text: "Nothing to answer with yet" });
  el.createDiv({
    cls: "colloquy-ready-body",
    text: "Add a key for a provider — or, if you run Ollama on your computer, its address.",
  });

  const button = el.createEl("button", { cls: "colloquy-ready-action mod-cta", text: "Open settings" });
  button.onclick = () => openSettings(app, plugin.manifest?.id ?? "colloquy");

  /**
   * @param {boolean} empty whether the thread has nothing in it. A conversation already on
   *   screen is never covered over: whatever is wrong now, what was said still stands.
   */
  function show(empty) {
    const ready = canAnswer(plugin.settings);
    const instead = !ready && empty;
    el.toggleClass("is-shown", instead);
    // The panel says so too, because this replaces the conversation and the composer
    // rather than sitting above them. A thread with nothing in it still claims half the
    // height, and a composer that cannot send is three more controls that cannot be used —
    // including an Enter key that would send anyway, around the button that says it will
    // not.
    container.toggleClass("is-unconfigured", instead);
    return ready;
  }

  return { el, show };
}
