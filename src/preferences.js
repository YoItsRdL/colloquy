/**
 * The settings that are not secret, kept where a clone can find them (ADR-0015).
 *
 * ADR-0004 put keys in Obsidian's plugin data and gitignored that file, which is right and
 * is not what this changes. What it did not account for is that the ignore rule does not
 * only protect the keys: it discards everything else in the same file. A vault cloned to a
 * second machine came back with the plugin's code and none of its configuration, so it
 * wrote conversations to a folder nobody had chosen and could not see the sixteen records
 * already sitting in the one they had.
 *
 * So the non-secret half is mirrored to a file beside the store, which is tracked because
 * nothing in it is a secret. The store still wins wherever it exists: it is the live local
 * copy, and this is only ever the answer to "what did this vault used to be set to".
 */

/**
 * What may be mirrored, named one by one.
 *
 * An allowlist rather than "everything except keys", so the default for a setting nobody
 * has thought about yet is to stay out of a tracked file. Getting that backwards is how a
 * secret ends up committed, and the whole point of ADR-0004 is that the safe thing is what
 * happens when nobody is paying attention.
 */
export const SHARED = ["provider", "model", "folders", "autoName", "autoRead", "useMemory"];

/** The mirrorable half of a settings object, with nothing invented that was not set. */
export function sharedOf(settings) {
  const shared = {};
  for (const field of SHARED) {
    if (settings?.[field] !== undefined) shared[field] = settings[field];
  }
  return shared;
}

/**
 * What a previous machine was set to, or nothing.
 *
 * Every failure is the same failure: absent, unreadable, half-written by a sync that was
 * interrupted. None of them is worth a message, because the answer in every case is to
 * carry on with the defaults, which is what a vault with no file at all does.
 */
export async function readShared(adapter, path) {
  try {
    const parsed = JSON.parse(await adapter.read(path));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? sharedOf(parsed) : {};
  } catch {
    return {};
  }
}

/**
 * Mirrors the non-secret half, and never throws.
 *
 * Written beside the store rather than instead of it, so a write that fails costs the copy
 * and not the setting. Failing loudly here would interrupt somebody who had just changed a
 * folder, about a file they have never heard of.
 */
export async function writeShared(adapter, path, settings) {
  try {
    await adapter.write(path, `${JSON.stringify(sharedOf(settings), null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}
