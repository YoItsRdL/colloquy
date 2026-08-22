/**
 * Which folders this plugin writes to (ADR-0010).
 *
 * The defaults are one vault's scheme and nobody else's. What is shown back is the cleaned
 * path rather than what was typed, because the gap between the two is where the surprises
 * live: a leading slash, a trailing one, a stray `..`, a character Windows will not accept
 * in a name. Saying "this will be `notes/chats`" before anything is written costs a line
 * and settles it.
 */
import { Setting, normalizePath } from "obsidian";
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
  // `setHeading()` rather than an `<h3>`: the guidelines ask for it so that a section here
  // is styled by whatever theme the reader chose, exactly like every other plugin's.
  new Setting(containerEl)
    .setName("Where things go")
    .setDesc("Folders inside your vault. They are created when first needed, and moving one " +
      "here does not move what is already filed under the old one.")
    .setHeading();

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
          // Obsidian's own normalisation on the way in, so what is stored is already the
          // shape the vault API expects. `cleanFolder` still runs at every use — this
          // settles slashes and unicode, that one refuses `..` and the characters Windows
          // will not take, and neither is a substitute for the other.
          const stored = value.trim() ? normalizePath(value) : "";
          tab.plugin.settings.folders = { ...tab.plugin.settings.folders, [field.key]: stored };
          await tab.plugin.save();
        });
      });
  }
}
