/**
 * Reading conversations without being asked (ADR-0006).
 *
 * Triggered by idleness rather than a timer over the vault, so a conversation is read once
 * it is finished — and while the GPU is free, which it is not mid-question.
 */
import { observeConversation } from "./observe.js";
import { writeContext } from "./context.js";
import { foldersOf } from "./folders.js";

/** Long enough that a pause to think is not a conversation ending. */
const IDLE_MS = 3 * 60 * 1000;

/**
 * Passive means every conversation, which on a metered provider is a bill that grows
 * without anybody pressing anything. So it does not run there (ADR-0006).
 */
export const isFree = (config) => config?.provider?.keyKind === "url";

/**
 * In the conversation's own frontmatter, so it survives the rename that follows the first
 * answer. A ledger keyed on path would re-read half of them.
 */
export const wasRead = (app, file) =>
  Boolean(app.metadataCache.getFileCache(file)?.frontmatter?.noticed);

/** Conversations nobody has read yet, oldest first. */
export const unread = (app, { conversations, context }) => app.vault.getMarkdownFiles()
  .filter((file) => file.path.startsWith(`${conversations}/`))
  // The two folders default to one inside the other, so without this the sweep would read
  // its own accounts and write accounts of those.
  .filter((file) => !file.path.startsWith(`${context}/`))
  .filter((file) => !wasRead(app, file))
  .sort((a, b) => (a.path < b.path ? -1 : 1));

export function createSweep(plugin, { idleMs = IDLE_MS } = {}) {
  // One clock per conversation. A single timer meant starting a second conversation
  // cancelled the first one's read, permanently.
  const timers = new Map();
  const queued = [];
  // Obsidian's metadata cache lags the frontmatter write, so a conversation read seconds
  // ago can still look unread. This does not lag.
  const done = new Set();
  // Conversations that have been added to since they were last read. Picking one up again
  // is exactly the case the `noticed:` marker gets wrong on its own: the file was read,
  // truthfully, and then grew. Without this the new half is never looked at.
  const changed = new Set();
  let running = false;

  /** Restarted on every turn, so the clock measures silence rather than age. */
  function touch(path) {
    changed.add(path);
    clearTimeout(timers.get(path));
    timers.set(path, setTimeout(() => {
      timers.delete(path);
      read(path);
    }, idleMs));
  }

  function stop() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    queued.length = 0;
  }

  /**
   * Picks up conversations the idle clock never got to — an evening with Ollama off, a
   * crash, a quit before the timer fired. Without it the marker is write-only.
   *
   * Bounded per run: this starts with the app, and an inbox of two hundred should not mean
   * ten minutes of GPU. The number returned is what was left for next time.
   */
  async function catchUp({ limit = 20 } = {}) {
    const waiting = unread(plugin.app, foldersOf(plugin.settings))
      .filter((file) => !done.has(file.path));
    const batch = waiting.slice(0, limit);
    if (!batch.length) return 0;

    for (const file of batch) if (!queued.includes(file.path)) queued.push(file.path);
    await read(batch[0].path);   // already queued, so this just drains the lot

    // Counted from the batch, not by asking the lagging metadata cache again. Failures
    // are reported through the reason instead.
    return waiting.length - batch.length;
  }

  /**
   * One read at a time keeps a 4B model off the GPU somebody is about to use. A queue
   * rather than a busy-flag, which discarded whatever arrived mid-read.
   */
  async function read(path) {
    if (!queued.includes(path)) queued.push(path);
    if (running) return;

    running = true;
    try {
      while (queued.length) await readOne(queued.shift());
    } finally {
      running = false;
    }
  }

  /**
   * Failures are silent by design — this runs unasked, so nothing here is worth
   * interrupting somebody about. The reason is kept, which is what lets the settings screen
   * tell quiet apart from broken.
   */
  async function readOne(path) {
    const file = plugin.app.vault.getAbstractFileByPath(path);
    if (!file) return;
    // A conversation that grew since it was read is worth reading again; the record is
    // rewritten rather than added to.
    if (!changed.has(path) && (done.has(path) || wasRead(plugin.app, file))) return;

    try {
      const config = await plugin.config();
      if (!isFree(config)) return note(`${config.provider?.name ?? "that provider"} charges per request`);

      const { context, why } = await observeConversation(config, await plugin.app.vault.read(file));
      if (context === null) return note(why);

      await writeContext(plugin.app, { context, source: path, root: foldersOf(plugin.settings).context });
      // Only once the record is safely on disk. Marked earlier, a crash between the two
      // would lose what this conversation said about us permanently.
      await plugin.app.fileManager.processFrontMatter(file, (front) => {
        front.noticed = new Date().toISOString().slice(0, 10);
        // This marker used to be called `processed`, a word already spoken for by the act
        // of promoting a conversation into a note and archiving it. Two meanings under one
        // key, on the same files, is a trap for whoever reads that frontmatter next. The
        // old one is cleared as each conversation comes past, rather than in a migration
        // nobody would run.
        delete front.processed;
      });
      done.add(path);
      changed.delete(path);
      note(null);
    } catch (err) {
      note(String(err?.message ?? err));   // left unmarked, so a later read picks it up
    }
  }

  /** The last thing that went wrong, or nothing. Read by the settings screen. */
  function note(reason) {
    plugin.lastRead = { at: Date.now(), reason };
  }

  return { touch, stop, read, catchUp };
}
