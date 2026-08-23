/**
 * Models installed on this machine (TKT-0106).
 *
 * Shown only for adapters that export a `library`, so a hosted provider offers nothing
 * here and this file still names no provider.
 *
 * Its own section because it is about disk and downloads rather than credentials or
 * configuration, gigabytes, progress, and a deletion worth confirming.
 */
import { Setting, Modal, Notice } from "obsidian";
import { all as allAdapters } from "./providers/index.js";
import { keysOf } from "./keys.js";

export function renderLibrary(tab, containerEl) {
  const keys = keysOf(tab.plugin.settings, allAdapters());

  for (const adapter of allAdapters()) {
    if (!adapter.library || !keys[adapter.keyVar]) continue;

    new Setting(containerEl).setName(`${adapter.label} models`).setHeading();
    const note = containerEl.createEl("p", { cls: "setting-item-description" });
    note.setText("Downloaded to this machine. Nothing here is sent anywhere, and nothing here costs money.");

    const list = containerEl.createDiv();
    renderPuller(tab, containerEl, adapter, keys[adapter.keyVar]);
    // Filled asynchronously: the list comes over HTTP, and a settings screen that blocks
    // while a server is unreachable is worse than one that fills in a moment later.
    fillLibrary(tab, list, note, adapter, keys[adapter.keyVar]);
  }
}

async function fillLibrary(tab, list, note, adapter, key) {
  let installed;
  try {
    installed = await adapter.library.list({ key });
  } catch {
    // A server that is not running is the ordinary case, not an error worth alarm.
    note.setText(`Not reachable at ${key}. Start it, or correct the address above.`);
    return;
  }

  list.empty();
  if (!installed.length) {
    list.createEl("p", { cls: "setting-item-description" })
      .setText("Nothing installed yet. Name a model below to download one.");
    return;
  }

  for (const model of installed) {
    const gb = (model.bytes / 1e9).toFixed(1);
    new Setting(list)
      .setName(model.id)
      // "4.0B · Q4_K_M" is what decides whether a model fits in 8 GB, and the name does
      // not always say.
      .setDesc([model.detail, `${gb} GB`].filter(Boolean).join(" · "))
      .addExtraButton((button) =>
        button.setIcon("trash").setTooltip("Remove from this machine").onClick(async () => {
          if (!(await confirmRemoval(tab, model))) return;
          await adapter.library.remove({ key, model: model.id });
          new Notice(`Removed ${model.id}`);
          tab.display();
        }));
  }
}

/** Asked first: this is gigabytes, and getting it back means downloading it again. */
function confirmRemoval(tab, model) {
  return new Promise((settle) => {
    const modal = new Modal(tab.app);
    modal.titleEl.setText(`Remove ${model.id}?`);
    modal.contentEl.createEl("p").setText(
      `This frees ${(model.bytes / 1e9).toFixed(1)} GB. Getting it back means downloading it again.`,
    );
    let removing = false;
    new Setting(modal.contentEl)
      .addButton((b) => b.setButtonText("Remove").setWarning().onClick(() => { removing = true; modal.close(); }))
      .addButton((b) => b.setButtonText("Cancel").onClick(() => modal.close()));
    modal.onClose = () => settle(removing);
    modal.open();
  });
}

/** Downloading one by name, with progress, because these take minutes and gigabytes. */
function renderPuller(tab, containerEl, adapter, key) {
  let wanted = "";
  const row = new Setting(containerEl)
    .setName("Download a model")
    .setDesc("Named as the provider names it: qwen3:8b, gemma3:4b.");

  let button;
  row.addText((text) => {
    text.setPlaceholder("model:tag");
    text.onChange((value) => { wanted = value.trim(); button.setDisabled(!wanted); });
  });

  row.addButton((b) => {
    button = b;
    b.setButtonText("Download").setDisabled(true).onClick(async () => {
      button.setDisabled(true);
      try {
        await adapter.library.pull({ key, model: wanted }, ({ status, completed, total }) => {
          const pct = total ? Math.round((completed / total) * 100) : null;
          // In the description, where the eye already is, rather than in a notice that
          // would have to be replaced hundreds of times.
          row.setDesc(pct === null ? status : `${status}, ${pct}%`);
        });
        new Notice(`${wanted} is ready`);
        tab.display();
      } catch (err) {
        row.setDesc(String(err.message ?? err));
        button.setDisabled(false);
      }
    });
  });
}
