/**
 * The settings screen (ADR-0004).
 *
 * Three sections, in the order a first run needs them: keys, local models, and what
 * happens by itself.
 *
 * Provider and model are deliberately absent — they are per-question choices with controls
 * beside the composer, and a setting duplicating a control is two truths waiting to
 * disagree.
 */
import { PluginSettingTab, Setting } from "obsidian";
import { all as allAdapters, defaultProvider } from "./providers/index.js";
import { status } from "./keys.js";
import { renderKeys } from "./settings-keys.js";
import { renderLibrary } from "./settings-models.js";
import { renderFolders } from "./settings-folders.js";
import { foldersOf } from "./folders.js";

const SUPPORT = "https://buymeacoffee.com/ibonescalap";

export const DEFAULTS = { provider: defaultProvider, model: null, keys: {}, folders: {}, autoName: true, autoRead: true, useMemory: true };

export class SettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    // Read once and shared, so four sections cannot disagree about what is configured.
    this.keys = status(allAdapters(), this.plugin.settings);

    renderKeys(this, containerEl);
    renderLibrary(this, containerEl);
    renderFolders(this, containerEl);
    this.renderNaming(containerEl);
    this.renderSupport(containerEl);
  }

  renderNaming(containerEl) {
    new Setting(containerEl)
      .setName("Read conversations automatically")
      .setDesc(
        `A few minutes after you stop, the conversation is read and a short account of ` +
        `what you were doing is written to ${foldersOf(this.plugin.settings).context}/ — so later ` +
        "conversations have the context. It records what you were working on, never facts the model " +
        "asserted. Only runs on a local model, because reading every conversation on a " +
        "paid one is a bill that grows without you pressing anything.",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.autoRead !== false);
        toggle.onChange(async (value) => {
          this.plugin.settings.autoRead = value;
          if (!value) this.plugin.sweep.stop();
          await this.plugin.save();
          this.display();
        });
      });

    // Reading never interrupts anyone, which leaves "nothing worth keeping lately"
    // indistinguishable from "Ollama has been off for a week". This is the only place
    // that difference is visible, so it is stated plainly rather than logged.
    const last = this.plugin.lastRead;
    if (last?.reason && this.plugin.settings.autoRead !== false) {
      containerEl.createEl("p", { cls: "setting-item-description colloquy-warning" })
        .setText(`Last attempt did not file anything: ${last.reason}.`);
    }

    new Setting(containerEl)
      .setName("Use what earlier conversations noticed")
      .setDesc(
        "Sends a short summary of your recent conversations along with each question, so " +
        "the model knows what you have been working on. It goes to whichever provider " +
        "answers — including a paid one, if that is what the chips are set to. Turn this " +
        "off and every conversation starts from nothing.",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.useMemory !== false);
        toggle.onChange(async (value) => {
          this.plugin.settings.useMemory = value;
          await this.plugin.save();
        });
      });

    new Setting(containerEl)
      .setName("Name conversations automatically")
      .setDesc(
        "A new conversation is named after the question, which is often \"hello\". Once " +
        "answered, the model that answered is asked for a better one. It costs one extra " +
        "request per conversation — free locally, a fraction of a cent otherwise.",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.autoName !== false);
        toggle.onChange(async (value) => {
          this.plugin.settings.autoName = value;
          await this.plugin.save();
        });
      });
  }

  // Last on the screen, and once. A plugin that asks for money above the settings you
  // came for is asking at the wrong moment.
  renderSupport(containerEl) {
    new Setting(containerEl)
      .setName("Support")
      .setDesc("Colloquy is free and stays free. If it has been useful, a coffee is a kind way to say so.")
      .addButton((button) => button.setButtonText("Buy me a coffee").onClick(() => window.open(SUPPORT)));
  }
}
