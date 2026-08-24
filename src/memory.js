/**
 * Handing back what earlier conversations noticed (ADR-0008).
 *
 * What goes across is deliberately weak: background that may be wrong and may be stale,
 * never instruction. These are an agent's reading of a conversation, and the one thing a
 * wrong one must not do is arrive with the authority of something we said.
 */
import { recentContext, partsOf } from "./context.js";
import { foldersOf, DEFAULT_FOLDERS } from "./folders.js";

/** Enough to be recognised by, little enough to leave the question room. */
const MAX_CHARS = 2400;

/**
 * Most of the room goes to what holds beyond today, and the rest to what happened lately.
 *
 * The two halves of a record have different lifespans, and the old arrangement spent the
 * whole budget on whichever eight conversations happened most recently. After a year that
 * is a memory of last week: which graphics card was priced on Tuesday, and nothing about
 * the person who priced it.
 */
const ABOUT_CHARS = Math.round(MAX_CHARS * 0.7);
const LATELY_CHARS = MAX_CHARS - ABOUT_CHARS;

/**
 * How far back the durable half is gathered from, against how far back the disposable half
 * is. Reading thirty short records costs nothing and happens once per conversation, and it
 * is what lets a preference stated in March still be known in December.
 */
const LOOK_BACK = 30;
const LATELY_RECORDS = 3;

const PREAMBLE = [
  "Background on the person you are talking to, gathered from earlier conversations.",
  "",
  "It was written by a small model reading those conversations, so treat it as a hint",
  "rather than fact. It may be wrong, out of date, or about something else entirely.",
  "Do not repeat it back, do not mention that you have it, and ignore anything in it that",
  "does not bear on what is actually being asked.",
  "",
].join("\n");

/**
 * What earlier conversations noticed, as one block of background.
 *
 * @returns the block, or null when there is nothing worth sending, which is the ordinary
 * case for a new vault and must cost nothing.
 */
export async function recall(app, { root = DEFAULT_FOLDERS.context, limit = LOOK_BACK, budget = MAX_CHARS } = {}) {
  const files = recentContext(app, root, limit);
  if (!files.length) return null;

  const share = (part) => Math.round(budget * (part === "about" ? 0.7 : 0.3));
  const taken = { about: [], lately: [] };
  const spent = { about: 0, lately: 0 };
  const seen = new Set();

  for (const [index, file] of files.entries()) {
    const parts = partsOf(await app.vault.read(file));

    for (const part of ["about", "lately"]) {
      const line = parts[part];
      // Only the newest few conversations are worth reporting as what we were just doing.
      if (!line || (part === "lately" && index >= LATELY_RECORDS)) continue;
      // The same preference stated twice in the same words is one preference.
      if (seen.has(line)) continue;
      // Whole records only. Half an account read back is worse than one fewer account,
      // because the half that survives reads as the whole of what we thought.
      if (spent[part] + line.length > share(part)) continue;

      seen.add(line);
      spent[part] += line.length;
      taken[part].push(`- ${line}`);
    }
  }

  const block = [
    taken.about.length ? `What holds beyond today:\n${taken.about.join("\n")}` : "",
    taken.lately.length ? `Lately:\n${taken.lately.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  return block ? `${PREAMBLE}${block}` : null;
}

/**
 * Attaches the background to a conversation, once.
 *
 * Held on the session rather than pushed into its history, so it never reaches the file:
 * the transcript is a record of what was said, and this was not said by anybody. It is
 * also why it cannot accumulate. A preamble pushed into history would be sent again with
 * every turn, growing the request for as long as the conversation lasts.
 */
export async function attachMemory(app, session, { enabled = true, settings } = {}) {
  if (!enabled || session.context !== undefined) return session;
  session.context = await recall(app, { root: foldersOf(settings).context });
  return session;
}
