/**
 * Which folders this plugin writes to (ADR-0010).
 *
 * Pure, so the cleaning rules can be tested without a vault. They matter more than they
 * look: whatever comes out of here is used to build a write path.
 */

export const DEFAULT_FOLDERS = {
  conversations: "Conversations",
  context: "Conversations/context",
};

/**
 * A folder someone typed, made safe to write under.
 *
 * @returns the cleaned folder, or "" if nothing usable is left, which the caller reads as
 * "keep the default", never as "write to the vault root".
 */
export function cleanFolder(input) {
  const parts = String(input ?? "")
    // macOS decomposes an accented character where Windows composes it, so the same folder
    // name arrives as two different strings and gets created twice on a synced vault.
    .normalize("NFC")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim().replace(/[:*?"<>|]/g, "").replace(/\.+$/, ""))
    .filter((part) => part && part !== "." && part !== "..");

  return parts.join("/");
}

/** What a person typed, said back as what it will actually be. */
export const willBe = (input, fallback) => cleanFolder(input) || fallback;

/** Read fresh, so a folder changed in settings applies to the next conversation. */
export function foldersOf(settings) {
  const stored = settings?.folders ?? {};
  return {
    conversations: cleanFolder(stored.conversations) || DEFAULT_FOLDERS.conversations,
    context: cleanFolder(stored.context) || DEFAULT_FOLDERS.context,
  };
}
