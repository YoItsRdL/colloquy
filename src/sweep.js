/**
 * Reading conversations without being asked (ADR-0006).
 *
 * The trigger is idleness rather than a timer over the vault: a few minutes after the last
 * turn, that conversation is finished but the person is probably still around, so the
 * claims are waiting by the time they look — and the GPU is free, which it is not while
 * they are mid-question.
 */
import { observeConversation } from "./observe.js";
import { writeContext } from "./context.js";
import { foldersOf } from "./folders.js";

/** Long enough that a pause to think is not a conversation ending. */
const IDLE_MS = 3 * 60 * 1000;

/**
 * Whether reading everything automatically is free.
 *
 * Passive means every conversation, including the ones nobody would have bothered to
 * process. On a metered provider that is a bill that grows without anyone pressing
 * anything, so the sweep simply does not run there (ADR-0006).
 */
export const isFree = (config) => config?.provider?.keyKind === "url";

/**
 * Whether this conversation has already been read.
 *
 * Recorded in the conversation's own frontmatter, so it survives the rename that follows
 * the first answer. A plugin-side ledger keyed on path would re-read half of them.
 */
export const wasRead = (app, file) =>
  Boolean(app.metadataCache.getFileCache(file)?.frontmatter?.noticed);

/**
 * Conversations nobody has read yet, oldest first.
 *
 * Scoped to wherever conversations are kept rather than the whole vault, because the marker
 * means "this plugin has read it" and it has no business asking that question of a note
 * somebody wrote by hand.
 */
export const unread = (app, { conversations, context }) => app.vault.getMarkdownFiles()
  .filter((file) => file.path.startsWith(`${conversations}/`))
  // Never what this plugin wrote itself. The two folders default to one inside the other,
  // and without this every record would look like an unread conversation — so the sweep
  // would read its own accounts and write accounts of those.
  .filter((file) => !file.path.startsWith(`${context}/`))
  .filter((file) => !wasRead(app, file))
  .sort((a, b) => (a.path < b.path ? -1 : 1));

export function createSweep(plugin, { idleMs = IDLE_MS } = {}) {
  // One clock per conversation, not one for the plugin. A single timer meant starting a
  // second conversation cancelled the first one's read — and since nothing ever rescans
  // for unread conversations, the first one stayed unread for good.
  const timers = new Map();
  const queued = [];
  // Obsidian's metadata cache lags the frontmatter write by a moment, so a conversation
  // read seconds ago can still look unread. This does not lag, and it is what stops a
  // catch-up from reading the same conversation twice on the way past.
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
   * Picks up conversations the idle clock never got to.
   *
   * Without this the marker is write-only: an evening when Ollama was off, a crash, a
   * quit before the timer fired, and those conversations are never read again by anything.
   * The `noticed:` stamp lives in the conversation's own frontmatter precisely so this
   * can be run whenever, as often as you like, without doing anything twice.
   *
   * Bounded per run because it starts with the app: an inbox of two hundred should not
   * mean ten minutes of GPU the moment Obsidian opens. What is left over is read the next
   * time, and the number returned is what says so out loud.
   */
  async function catchUp({ limit = 20 } = {}) {
    const waiting = unread(plugin.app, foldersOf(plugin.settings))
      .filter((file) => !done.has(file.path));
    const batch = waiting.slice(0, limit);
    if (!batch.length) return 0;

    for (const file of batch) if (!queued.includes(file.path)) queued.push(file.path);
    await read(batch[0].path);   // already queued, so this just drains the lot

    // What was deliberately left for next time — counted from the batch rather than by
    // asking the metadata cache again, which has not caught up with the writes just made.
    // Conversations that failed are reported through the reason instead.
    return waiting.length - batch.length;
  }

  /**
   * Waits its turn rather than being dropped.
   *
   * One read at a time keeps a 4B model off the GPU the person is about to use, but a
   * plain busy-flag turned that into silent loss: a conversation that arrived while
   * another was being read was discarded, and nothing rescans for unread ones.
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
   * Reads one conversation and files whatever came out.
   *
   * Every failure is silent by design. This runs unasked, so a provider being down, a
   * model being unloaded, or a conversation having been moved are all things the person
   * did not do and should not be interrupted about. What is not silent is the record: the
   * reason is kept so the settings screen can say why nothing has been read lately, which
   * is the difference between quiet and broken.
   */
  async function readOne(path) {
    const file = plugin.app.vault.getAbstractFileByPath(path);
    if (!file) return;
    // A conversation that has grown since it was read is worth reading again. The record
    // is rewritten rather than added to, so a second pass replaces an account that stopped
    // halfway rather than sitting beside it.
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
