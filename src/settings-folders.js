/**
 * Which folders this plugin writes to (ADR-0010).
 *
 * The defaults are one vault's scheme and nobody else's. What is shown back is the cleaned
 * path rather than what was typed, because the gap between the two is where the surprises
 * live: a leading slash, a trailing one, a stray `..`, a character Windows will not accept
 * in a name. Saying "this will be `notes/chats`" before anything is written costs a line
 * and settles it.
 */
import { Setting } from "obsidian";
import { DEFAULT_FOLDERS, cleanFolder, willBe } from "./folders.js";

const FIELDS = [
  {
    key: "conversations",
    name: "Conversations",
    desc: "Where a conversation is written as you have it. Filed by day underneath — " +
      "2026/08/19 — so one folder never holds four years of them.",
  },
  {
    key: "context",
    name: "What was noticed",
    desc: "Where the short account of each conversation is kept, and read back from to " +
      "give later conversations their context. Filed by month underneath.",
  },
];

export function renderFolders(tab, containerEl) {
  containerEl.createEl("h3", { text: "Where things go" });
  containerEl.createEl("p", { cls: "setting-item-description" })
    .setText("Folders inside your vault. They are created when first needed, and moving one " +
      "here does not move what is already filed under the old one.");

  const folders = tab.plugin.settings.folders ?? {};

  for (const field of FIELDS) {
    const preview = createFragment();
    const line = preview.createDiv({ cls: "setting-item-description" });
    line.setText(field.desc);
    const willBeEl = preview.createDiv({ cls: "colloquy-folder-preview" });

    const show = (value) => {
      const cleaned = willBe(value, DEFAULT_FOLDERS[field.key]);
      // Only when it differs from what was typed. Repeating somebody's own input back at
      // them is noise; showing them what it became is the point.
      willBeEl.setText(cleanFolder(value) === String(value ?? "").trim() ? "" : `Will be: ${cleaned}/`);
    };

    new Setting(containerEl)
      .setName(field.name)
      .setDesc(preview)
      .addText((text) => {
        text.setPlaceholder(DEFAULT_FOLDERS[field.key]);
        text.setValue(folders[field.key] ?? "");
        show(folders[field.key] ?? "");

        text.onChange(async (value) => {
          show(value);
          // Stored as typed and cleaned on the way out, so a half-typed folder on the way
          // to a real one is never treated as the folder.
          tab.plugin.settings.folders = { ...tab.plugin.settings.folders, [field.key]: value };
          await tab.plugin.save();
        });
      });
  }
}
