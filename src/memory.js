/**
 * Handing back what earlier conversations noticed (ADR-0008).
 *
 * What goes across is deliberately weak: background that may be wrong and may be stale,
 * never instruction. These are an agent's reading of a conversation, and the one thing a
 * wrong one must not do is arrive with the authority of something we said.
 */
import { recentContext } from "./context.js";
import { foldersOf, DEFAULT_FOLDERS } from "./folders.js";

/** Enough to be recognised by, little enough to leave the question room. */
const MAX_RECORDS = 8;
const MAX_CHARS = 2400;

const PREAMBLE = [
  "Background on the person you are talking to, gathered from earlier conversations.",
  "",
  "It was written by a small model reading those conversations, so treat it as a hint",
  "rather than fact — it may be wrong, out of date, or about something else entirely.",
  "Do not repeat it back, do not mention that you have it, and ignore anything in it that",
  "does not bear on what is actually being asked.",
  "",
].join("\n");

/** The body of a record, without the frontmatter this plugin put on it. */
const bodyOf = (text) => String(text ?? "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();

/**
 * What earlier conversations noticed, as one block of background.
 *
 * @returns the block, or null when there is nothing worth sending — which is the ordinary
 * case for a new vault and must cost nothing.
 */
export async function recall(app, { root = DEFAULT_FOLDERS.context, limit = MAX_RECORDS, budget = MAX_CHARS } = {}) {
  const files = recentContext(app, root, limit);
  if (!files.length) return null;

  const lines = [];
  let spent = 0;
  for (const file of files) {
    const body = bodyOf(await app.vault.read(file));
    if (!body) continue;
    // Whole records only. Half an account read back is worse than one fewer account,
    // because the half that survives reads as the whole of what we thought.
    if (spent + body.length > budget) break;
    spent += body.length;
    lines.push(`- ${body}`);
  }

  return lines.length ? `${PREAMBLE}${lines.join("\n")}` : null;
}

/**
 * Attaches the background to a conversation, once.
 *
 * Held on the session rather than pushed into its history, so it never reaches the file:
 * the transcript is a record of what was said, and this was not said by anybody. It is
 * also why it cannot accumulate — a preamble pushed into history would be sent again with
 * every turn, growing the request for as long as the conversation lasts.
 */
export async function attachMemory(app, session, { enabled = true, settings } = {}) {
  if (!enabled || session.context !== undefined) return session;
  session.context = await recall(app, { root: foldersOf(settings).context });
  return session;
}
