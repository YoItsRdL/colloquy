/**
 * Provider and model, as two chips beside the composer.
 *
 * Two controls rather than one list, because they are two questions: which provider is
 * about money, which model is about capability. One list made the cheap question look
 * identical to the expensive one, and ran to 114 rows with four keys configured.
 */
import { Menu, setIcon } from "obsidian";
import { listModels, defaultModelFor } from "./models.js";
import { all as allAdapters } from "./providers/index.js";
import { chooseProvider } from "./config.js";
import { keysOf } from "./keys.js";
import { shorten } from "./label.js";

/**
 * A chip: a label and a chevron, because a control that opens something has to say so.
 * The chevron is Obsidian's own icon set, so it matches every other menu in the app.
 */
function chip(container) {
  const button = container.createEl("button", { cls: "colloquy-chip" });
  const label = button.createSpan({ cls: "colloquy-chip-label" });
  setIcon(button.createSpan({ cls: "colloquy-chip-caret" }), "chevron-down");
  return { button, label };
}

export function createChips({ container, plugin, onChange }) {
  const providerControl = chip(container);
  const modelControl = chip(container);
  const providerChip = providerControl.button;
  const modelChip = modelControl.button;

  const settings = () => plugin.settings;
  const keys = () => keysOf(settings(), allAdapters());

  /** Only providers with a key. Offering one without is offering a failure. */
  const available = () =>
    allAdapters().filter((adapter) => adapter.keyVar && keys()[adapter.keyVar]);

  /**
   * The provider in use, asked of the same rule a turn asks (config.js).
   *
   * A stored choice can outlive its key, and the chip used to work that out for itself.
   * It got the same answer as a turn right up until it did not, and then the chip named
   * one provider while the question went to another. Asking once means they cannot drift.
   */
  const current = () => (available().length ? chooseProvider(settings(), keys()) : null);

  /**
   * What a turn will run when nobody has chosen a model, once it is known.
   *
   * An adapter's `defaultModel` is a guess, and for a local provider a wrong one: the chip
   * would name `qwen3:4b` while the turn ran the first model actually installed. Same
   * failure as the provider chip naming Gemini, one level down. Resolving it needs the
   * listing and painting does not wait, so the guess is shown and then corrected.
   */
  let settled = null;

  function draw() {
    const provider = current();

    providerControl.label.setText(provider?.label ?? provider?.name ?? "No provider");
    providerChip.disabled = available().length < 2;   // nothing to choose between

    const id = settings().model ?? settled ?? provider?.defaultModel ?? "no model";
    modelControl.label.setText(shorten(id, provider));
    modelChip.disabled = !provider;

    // The whole id, since the label deliberately drops part of it.
    modelChip.title = id;
  }

  /**
   * Asks what the turn would ask, and redraws only if the answer differs from the guess.
   * Redrawing through `draw` rather than `paint` is what stops this calling itself.
   */
  async function settle() {
    const provider = current();
    if (!provider || settings().model) return;

    try {
      const model = await defaultModelFor({ provider, key: keys()[provider.keyVar] });
      if (model !== settled) { settled = model; draw(); }
    } catch { /* the guess stands, and a turn will report the real failure */ }
  }

  /** Drawn now from what is known, corrected when the listing answers. */
  function paint() {
    draw();
    settle();
  }

  providerChip.onclick = (event) => {
    const menu = new Menu();
    const chosen = current();
    for (const adapter of available()) {
      menu.addItem((item) => {
        item.setTitle(adapter.label ?? adapter.name);
        item.setChecked(adapter.name === chosen?.name);
        item.onClick(async () => {
          if (adapter.name === chosen?.name) return;
          // A model belongs to the provider that listed it, so it cannot travel, sending
          // one provider's model to another fails on the first turn.
          settings().provider = adapter.name;
          settings().model = null;
          settled = null;   // it belonged to the provider we are leaving
          await plugin.save();
          paint();
          onChange?.();
        });
      });
    }
    menu.showAtMouseEvent(event);
  };

  modelChip.onclick = async (event) => {
    const provider = current();
    if (!provider) return;

    const previous = modelControl.label.textContent;
    modelControl.label.setText("loading…");
    let models;
    try {
      models = await listModels({
        provider,
        key: keys()[provider.keyVar],
        model: settings().model ?? provider.defaultModel,
      });
    } catch {
      // One provider failing to list is not a reason to offer nothing: its default is
      // still a usable option, and more use than a menu that will not open.
      models = [{ id: provider.defaultModel }];
    }
    modelControl.label.setText(previous);

    const menu = new Menu();
    for (const model of models) {
      menu.addItem((item) => {
        item.setTitle(model.label ?? model.id);
        item.setChecked(model.id === (settings().model ?? provider.defaultModel));
        item.onClick(async () => {
          settings().model = model.id;
          await plugin.save();
          paint();
          onChange?.();
        });
      });
    }
    menu.showAtMouseEvent(event);
  };

  /**
   * Hidden rather than disabled when no provider is configured. A disabled control still
   * takes its space and still reads as something that ought to work. "No provider" beside
   * an empty model name was two of them saying nothing, on the row where the one action
   * lives.
   */
  function toggle(show) {
    providerChip.toggleClass("is-hidden", !show);
    modelChip.toggleClass("is-hidden", !show);
  }

  paint();
  return { paint, toggle };
}

