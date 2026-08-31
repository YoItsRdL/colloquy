/**
 * Which model does the work nobody asked for (ADR-0016).
 *
 * The one setting on this screen that names a provider and a model, which the screen
 * otherwise deliberately refuses to do: those are per-question choices and they belong in
 * the chips beside the composer. This is not a per-question choice. Reading a conversation
 * and naming one happen minutes later, with nobody watching, and the model that suits a
 * question you are waiting on is rarely the one that should be spending money quietly.
 *
 * Two controls rather than one list, for the reason the chips are two: which provider is
 * a question about money, which model is a question about capability. Both are read on
 * click rather than on display, because this screen is rebuilt every time a toggle moves
 * and a listing per rebuild is a request per keystroke somewhere else.
 */
import { Setting, Menu } from "obsidian";
import { all as allAdapters } from "./providers/index.js";
import { keysOf } from "./keys.js";
import { listModels, defaultModelFor } from "./models.js";
import { shorten } from "./label.js";

/** What the button says when nothing is set, and the first thing on the menu. */
export const SAME = "Same as the chat model";

const DESC =
  "Reading a conversation and naming one happen on their own, a few minutes after you " +
  "stop. By default they use whatever the chips beside the composer are set to, which " +
  "means they stop happening while you are talking to a provider that charges. Name a " +
  "small local model here and they carry on, whatever you are chatting with.";

export function renderBackground(tab, containerEl) {
  const keys = keysOf(tab.plugin.settings, allAdapters());
  const available = allAdapters().filter((adapter) => adapter.keyVar && keys[adapter.keyVar]);
  // With nothing configured this would offer a choice between one thing and nothing. The
  // keys section above already says what is missing.
  if (!available.length) return;

  const settings = tab.plugin.settings;
  const stored = settings.background ?? null;
  // Read from what is configured now, not from what was configured when it was chosen: a
  // key can be removed after the fact, and the work falls back when it is (config.js).
  const provider = stored?.provider ? available.find((a) => a.name === stored.provider) ?? null : null;

  const row = new Setting(containerEl).setName("Model for reading and naming").setDesc(DESC);

  row.addButton((button) =>
    button
      .setButtonText(provider ? (provider.label ?? provider.name) : SAME)
      .onClick((event) => chooseProvider(tab, event, available, provider)));

  if (provider) {
    row.addButton((button) => {
      const id = stored.model ?? provider.defaultModel;
      button.setButtonText(shorten(id, provider));
      // The whole id, since the label deliberately drops the provider's name from it.
      button.buttonEl.title = id;
      button.onClick((event) =>
        chooseModel(tab, event, button, provider, keys[provider.keyVar], stored.model));
      // A default is a constant in source and, for a local provider, a guess at what is on
      // the disk. Shown now and corrected when the listing answers, as the chips do.
      if (!stored.model) settle(button, provider, keys[provider.keyVar]);
    });
  }

  // Both of the ways this can be set and still not be what happens, said where it is set
  // rather than discovered later in an empty folder.
  if (stored?.provider && !provider) {
    // Named the way the keys section names it, not by the string in the settings file.
    const gone = allAdapters().find((a) => a.name === stored.provider);
    warn(containerEl, `${gone?.label ?? stored.provider} has no key any more, so reading ` +
      "and naming have gone back to the chat model.");
  } else if (provider && provider.keyKind !== "url") {
    warn(containerEl, `${provider.label ?? provider.name} charges for every request, and ` +
      "this runs once per conversation without being asked.");
  }
}

/** Obsidian's own warning colour: this is a line that should stop the eye. */
function warn(containerEl, text) {
  containerEl.createEl("p", { cls: "setting-item-description colloquy-warning" }).setText(text);
}

async function settle(button, provider, key) {
  try {
    const model = await defaultModelFor({ provider, key });
    if (!model) return;
    button.setButtonText(shorten(model, provider));
    button.buttonEl.title = model;
  } catch { /* the guess stands, and the settings row is not where that failure matters */ }
}

function chooseProvider(tab, event, available, current) {
  const menu = new Menu();

  // First and always present. Unset is the default, and a setting you cannot put back the
  // way you found it is a trap.
  menu.addItem((item) => {
    item.setTitle(SAME);
    item.setChecked(!current);
    item.onClick(() => save(tab, null));
  });
  menu.addSeparator();

  for (const adapter of available) {
    menu.addItem((item) => {
      item.setTitle(adapter.label ?? adapter.name);
      item.setChecked(adapter.name === current?.name);
      // A model belongs to the provider that listed it, so changing provider clears it
      // rather than carrying one name to somewhere it means nothing.
      item.onClick(() => save(tab, { provider: adapter.name, model: null }));
    });
  }

  menu.showAtMouseEvent(event);
}

async function chooseModel(tab, event, button, provider, key, current) {
  const menu = new Menu();

  // The listing crosses the network, and a button that does nothing for a second reads as
  // one that is broken. Said on the button itself, where the click was.
  const said = button.buttonEl.textContent;
  button.setButtonText("loading…");

  let models;
  try {
    models = await listModels({ provider, key, model: current ?? provider.defaultModel });
  } catch {
    // A provider failing to list is not a reason to offer nothing: its default is still a
    // usable option, and more use than a menu that will not open.
    models = [{ id: provider.defaultModel }];
  }
  button.setButtonText(said);

  for (const model of models) {
    menu.addItem((item) => {
      item.setTitle(model.label ?? model.id);
      item.setChecked(model.id === (current ?? provider.defaultModel));
      item.onClick(() => save(tab, { provider: provider.name, model: model.id }));
    });
  }

  menu.showAtMouseEvent(event);
}

/**
 * Saved and then redrawn whole, rather than each label patched by hand. The row shows two
 * controls or one, and a warning or none, all of which follow from what was just chosen.
 */
async function save(tab, background) {
  tab.plugin.settings.background = background;
  await tab.plugin.save();
  tab.display();
}
