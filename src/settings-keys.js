/**
 * The keys section of the settings screen (ADR-0004).
 *
 * Its own file because credentials have rules nothing else on that screen has: a stored
 * value is never rendered back, a field configured by an address is not a password box,
 * and removing one is asked about first.
 *
 * Takes the tab rather than being a method on it, so the screen composes three sections
 * instead of being one class that knows everything about all of them.
 */
import { Setting, Notice } from "obsidian";
import { all as allAdapters, defaultProvider } from "./providers/index.js";
import { status, setKey, KeyError } from "./keys.js";

export function renderKeys(tab, containerEl) {
  new Setting(containerEl).setName("Keys").setHeading();
  containerEl.createEl("p", { cls: "setting-item-description" }).setText(
    "Stored by Obsidian on this device, never shown again once saved, and never " +
    "committed — the store is gitignored and the build fails if that stops being true.",
  );

  for (const key of tab.keys) keyRow(tab, containerEl, key);
}

function keyRow(tab, containerEl, key) {
  if (tab.removing === key.keyVar) return confirmRemoval(tab, containerEl, key);

  // A provider configured by an address is not configured by a secret. Asking for a
  // "key" in a password box when it wants a URL is a field that lies about itself.
  const isUrl = key.kind === "url";

  const row = new Setting(containerEl)
    .setName(key.label)
    .setDesc(key.hint ?? (key.configured ? "Configured" : "Not set"));

  let field;
  let save;

  row.addText((text) => {
    field = text;
    text.inputEl.type = isUrl ? "text" : "password";
    text.inputEl.autocomplete = "off";
    // A URL is shown, because it is not a secret and seeing it is how you notice it is
    // pointing at the wrong machine.
    if (isUrl) text.setValue(key.value ?? "");
    text.setPlaceholder(key.placeholder ?? (key.configured ? "Replace key" : "Paste key"));
    // Enabled only once there is something to save, so the button never invites a click
    // that would do nothing.
    text.onChange((value) => { save.setDisabled(!value.trim()); });
    text.inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && text.getValue().trim()) commit(tab, key, text);
    });
  });

  row.addButton((button) => {
    save = button;
    button.setButtonText("Save").setDisabled(true).onClick(() => commit(tab, key, field));
  });

  if (key.configured) {
    row.addExtraButton((button) =>
      button.setIcon("trash").setTooltip("Remove").onClick(() => {
        // Asked first. Removing a key is one click and undoing it means finding the key
        // again, which is not the same thing as reversible.
        tab.removing = key.keyVar;
        tab.display();
      }));
  }
}

function confirmRemoval(tab, containerEl, key) {
  new Setting(containerEl)
    .setName(`Remove the ${key.label} key?`)
    .setDesc("It is not recoverable from here — you would need the key again.")
    .addButton((button) =>
      button.setButtonText("Remove").setWarning().onClick(async () => {
        setKey(tab.plugin.settings, key.keyVar, "");
        tab.removing = null;

        // Removing the key for the provider currently in use would leave the selection
        // pointing at something that cannot answer — and with the dropdown gone from
        // this screen, nothing here could correct it. So it is corrected now.
        if (tab.plugin.settings.provider === key.name) {
          const left = status(allAdapters(), tab.plugin.settings).find((k) => k.configured);
          tab.plugin.settings.provider = left?.name ?? defaultProvider;
          tab.plugin.settings.model = null;
        }

        // A chain step behind a key that is gone can never run.
        await tab.setEntries(tab.entries().filter((entry) => !entry.startsWith(`${key.name}/`)));
      }))
    .addButton((button) =>
      button.setButtonText("Cancel").onClick(() => {
        tab.removing = null;
        tab.display();
      }));
}

async function commit(tab, key, field) {
  const value = field.getValue().trim();
  if (!value) return;
  try {
    setKey(tab.plugin.settings, key.keyVar, value);
    await tab.plugin.save();
    // Redrawn rather than patched, so every row shows the stored truth rather than an
    // optimistic guess about it.
    tab.display();
    new Notice(`${key.label} saved`);
  } catch (err) {
    new Notice(err instanceof KeyError ? err.message : "could not save that key", 8000);
  }
}
