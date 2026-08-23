/**
 * Naming a conversation once there is something to name it after (TKT-0107).
 *
 * The first filename is made from the question, because that is all that exists when the
 * file is created and a file must exist before an answer can be recorded. It is often a
 * poor name: "hello", "quick question", the first eight words of a paragraph.
 *
 * Once a turn has been answered there is a subject, so the model that answered is asked
 * for a title. Pure except for that one call, so every rule about what counts as a usable
 * title is testable without Obsidian and without a network.
 */

/** Short enough to read in a file list, long enough to distinguish two conversations. */
const MAX_WORDS = 8;
const MAX_CHARS = 60;

const ASK =
  "Give this exchange a short title: 3 to 6 plain words naming its subject. " +
  "No quotation marks, no trailing punctuation, no prefix like 'Title:'. Reply with the title alone.";

/**
 * What a model returned, reduced to a title or to nothing.
 *
 * Models add quotes, prefixes, trailing full stops, and sometimes a paragraph explaining
 * their choice. A reasoning model may return its own deliberation. Anything that does not
 * look like a title is rejected rather than cleaned into one, because a wrong name is
 * worse than the plain one already on the file.
 */
export function cleanTitle(raw) {
  let text = String(raw ?? "").trim();
  if (!text) return null;

  // Reasoning models emit their working. The answer, if any, is what follows it.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // A title is one line. Anything after the first is commentary about the title.
  text = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  text = text.trim()
    .replace(/^(title|suggested title)\s*[:—-]\s*/i, "")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .replace(/[.。!?]+$/, "")
    .trim();

  if (!text) return null;
  if (text.length > MAX_CHARS) return null;              // a sentence, not a title
  if (text.split(/\s+/).length > MAX_WORDS) return null;
  // A model refusing, apologising, or narrating is not a title. Contractions included,
  // because "I'm sorry" is the commonest refusal and does not start with a bare "I".
  //
  // This will occasionally reject a real title, "Here documents in bash" is a genuine
  // subject. That costs nothing: the conversation keeps the plain name it already has,
  // which is the safe direction to be wrong in.
  if (/^(i\b|i'm|sure\b|here\b|okay\b|certainly\b|as an ai)/i.test(text)) return null;

  return text;
}

/** A filename fragment: lowercase, hyphenated, and safe on every filesystem. */
export function slugFrom(title) {
  const slug = String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_CHARS)
    .replace(/-+$/, "");
  return slug || null;
}

/**
 * Asks the model that answered for a title.
 *
 * Deliberately the same provider and model: it has the context, it is already configured,
 * and asking a second provider would spend somewhere the person did not choose.
 *
 * Any failure returns null. A conversation keeps the name it has; nothing is worth
 * failing a turn over, and this happens after the answer is already safe on disk.
 */
export async function proposeTitle(candidate, history) {
  if (!candidate?.provider?.complete) return null;

  // Enough to name it, and no more. The whole exchange would cost tokens to restate
  // something a title cannot capture anyway.
  const said = history.slice(0, 2).map((turn) => `${turn.role}: ${turn.text.slice(0, 600)}`).join("\n\n");

  try {
    const reply = await candidate.provider.complete({
      model: candidate.model,
      key: candidate.key,
      messages: [{ role: "user", text: `${said}\n\n${ASK}` }],
    });
    return cleanTitle(reply);
  } catch {
    return null;
  }
}
