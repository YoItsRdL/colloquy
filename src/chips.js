/**
 * Provider and model, as two chips beside the composer.
 *
 * Two controls rather than one list, because they are two questions: which provider is
 * about money, which model is about capability. One list made the cheap question look
 * identical to the expensive one, and ran to 114 rows with four keys configured.
 */
import { Menu, setIcon } from "obsidian";
import { listModels } from "./models.js";
import { all as allAdapters, resolve as resolveProvider } from "./providers/index.js";
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
   * The provider in use, and never one that cannot answer.
   *
   * A stored choice can outlive its key. The adapter still resolves, so the chip would
   * name a provider confidently while every turn failed with "no key". Falling back to one
   * that has a key means the chip and the turn agree.
   */
  function current() {
    let chosen = null;
    try {
      chosen = resolveProvider(settings().provider);
    } catch {
      chosen = null;   // a provider that no longer exists at all
    }
    if (chosen && keys()[chosen.keyVar]) return chosen;
    return available()[0] ?? null;
  }

  function paint() {
    const provider = current();

    providerControl.label.setText(provider?.label ?? provider?.name ?? "No provider");
    providerChip.disabled = available().length < 2;   // nothing to choose between

    const id = settings().model ?? provider?.defaultModel ?? "no model";
    modelControl.label.setText(shorten(id, provider));
    modelChip.disabled = !provider;

    // The whole id, since the label deliberately drops part of it.
    modelChip.title = id;
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

