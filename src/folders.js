/**
 * Which folders this plugin writes to (ADR-0010).
 *
 * The defaults are this vault's own scheme, and they are only defaults. Somebody else's
 * Obsidian has its own shape — a flat vault, PARA, Johnny Decimal with different numbers,
 * or a language that is not English — and a plugin that insists on `00-inbox/` in all of
 * them is a plugin that files your conversations somewhere you do not keep things.
 *
 * Pure, so the cleaning rules can be tested exhaustively without a vault. They matter more
 * than they look: whatever comes out of here is used to build a write path.
 */

/**
 * Plain, and named for what they hold rather than for a numbering scheme.
 *
 * The vault this was built in files conversations under `00-inbox/` and their accounts
 * under `60-log/conversations/`. That is a good scheme, and it is one person's. Shipping it
 * as the default would tell everyone else that a numbered vault is expected — so it lives
 * in that vault's settings, where any other preference lives, and what ships is plain.
 *
 * The account folder sits inside the conversation folder so that everything this plugin
 * writes is one folder somebody can move, rename, or delete in a single gesture.
 */
export const DEFAULT_FOLDERS = {
  conversations: "Conversations",
  context: "Conversations/context",
};

/**
 * A folder someone typed, made safe to write under.
 *
 * Everything here is about the gap between what a person means and what a path is. A
 * leading slash means the vault root to a reader and an absolute path to a filesystem; a
 * trailing one is invisible and doubles a separator; `..` climbs out of the vault
 * altogether. Windows additionally refuses `:*?"<>|` in a name, and a vault synced between
 * machines is only as portable as its least tolerant one.
 *
 * @returns the cleaned folder, or "" if nothing usable is left — which the caller reads as
 * "keep the default" rather than as "write to the vault root".
 */
export function cleanFolder(input) {
  const parts = String(input ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim().replace(/[:*?"<>|]/g, "").replace(/\.+$/, ""))
    // `.` is where you already are and `..` is somewhere this has no business going.
    .filter((part) => part && part !== "." && part !== "..");

  return parts.join("/");
}

/** What a person typed, said back to them as what it will actually be. */
export const willBe = (input, fallback) => cleanFolder(input) || fallback;

/**
 * The folders in use, with anything missing or unusable falling back to the default.
 *
 * Read fresh rather than held, so a folder changed in settings applies to the next
 * conversation rather than the next restart.
 */
export function foldersOf(settings) {
  const stored = settings?.folders ?? {};
  return {
    conversations: cleanFolder(stored.conversations) || DEFAULT_FOLDERS.conversations,
    context: cleanFolder(stored.context) || DEFAULT_FOLDERS.context,
  };
}
