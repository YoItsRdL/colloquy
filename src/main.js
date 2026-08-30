/**
 * The plugin itself: what Obsidian loads, and the only file that knows it is a plugin.
 *
 * Deliberately thin. Everything with a decision in it lives beside this file and is
 * testable without Obsidian, which is the property that let the provider seam and the
 * model registry survive the move from a server unchanged, and that made retiring the
 * fallback chain (ADR-0009) a matter of deleting it rather than untangling it.
 */
import { Plugin, Notice } from "obsidian";
import { buildConfig } from "./config.js";
import { defaultModelFor } from "./models.js";
import { keysOf } from "./keys.js";
import { all as allAdapters } from "./providers/index.js";
import { ConversationView, VIEW_TYPE } from "./view.js";
import { SettingsTab, DEFAULTS } from "./settings.js";
import { createSweep } from "./sweep.js";

/** Long enough that opening the vault never waits on a model loading into VRAM. */
const CATCH_UP_DELAY_MS = 30 * 1000;

export default class ColloquyPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());

    this.registerView(VIEW_TYPE, (leaf) => new ConversationView(leaf, this));
    this.addRibbonIcon("message-square", "Colloquy", () => this.open());
    this.addCommand({ id: "open", name: "Open Colloquy", callback: () => this.open() });
    this.addCommand({
      id: "new-conversation",
      name: "New conversation",
      callback: () => {
        const view = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view;
        if (view) view.startNew();
        else this.open();
      },
    });
    this.addCommand({
      id: "pick-conversation",
      name: "Pick up a conversation",
      callback: async () => {
        await this.open();
        this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view?.pick();
      },
    });

    // Reads conversations a few minutes after they go quiet (ADR-0006). Registered so
    // Obsidian cancels the pending read when the plugin unloads.
    this.sweep = createSweep(this);
    this.register(() => this.sweep.stop());

    // Anything the idle clock never got to: a crash, a quit, an evening when Ollama was
    // off. Deferred until the workspace has settled and then some, because starting a
    // local model is the last thing that should compete with opening the vault.
    this.app.workspace.onLayoutReady(() => {
      const catchUp = setTimeout(() => {
        if (this.settings.autoRead !== false) this.sweep.catchUp();
      }, CATCH_UP_DELAY_MS);
      this.register(() => clearTimeout(catchUp));
    });

    this.addSettingTab(new SettingsTab(this.app, this));
  }

  async open() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (existing) return workspace.revealLeaf(existing);

    // The right sidebar, not the editor area: this sits beside what you are reading
    // rather than replacing it, which is the difference between capture and a destination.
    const leaf = workspace.getRightLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  /**
   * The panel works out what to show from the keys, so it is told when they change. Adding
   * the first one is the moment somebody most needs the panel to stop saying it has nothing
   * to answer with, and settings is a modal, so coming back from it fires nothing.
   */
  refreshPanel() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) leaf.view?.refresh?.();
  }

  /** Preferences only, never a key (ADR-0003). */
  async save() {
    await this.saveData(this.settings);
  }

  /**
   * The shape the ported logic expects, rebuilt each turn because a key can be added in
   * settings between one turn and the next and nothing should need a restart to notice.
   *
   * The model is asked for only when nobody has chosen one, which is the case the stored
   * constant gets wrong (see defaultModelFor). The answer is cached for the process, so
   * this is one request on a fresh vault rather than one per turn.
   */
  async config() {
    const config = buildConfig(this.settings, keysOf(this.settings, allAdapters()));
    if (this.settings.model) return config;
    return { ...config, model: await defaultModelFor(config) };
  }

  /** Shown where the person is looking, rather than written only to a console. */
  say(message) {
    new Notice(message, 8000);
  }
}

