/**
 * Noticing what a conversation was about, for a system that is learning about us (ADR-0007).
 *
 * Not claims. Claims about the world are what a small local model gets confidently wrong —
 * it told us Claude Opus 5 does not exist while we were talking to it. What it cannot be
 * wrong about is what *we* were doing: the subject we were circling, the constraint we kept
 * coming back to, what we ruled out. That is true whether or not the model's facts were.
 *
 * So the record is written in the first person, from inside the conversation, and it
 * carries context rather than knowledge.
 */

/**
 * A backstop against a runaway answer, not a style rule.
 *
 * It was 120, which is about four sentences — and it threw away a perfectly good account
 * for running slightly over, leaving nothing recorded at all. A record a little longer than
 * intended beats no record, so this now only catches output that has clearly stopped
 * answering the question and started retelling the transcript.
 */
const MAX_WORDS = 220;

/** A record that never says "we", "you" or "our" is writing about strangers. */
const OURS = /\b(we|we're|we've|our|us|you|you're|your)\b/i;

/**
 * An account written from outside, which is a way of starting a sentence rather than a
 * word to ban.
 *
 * This matched anywhere at first, and threw away a good record for the phrase "we
 * ultimately guided the conversation towards…" — which is someone who was there, describing
 * what they did. Anchored to the start of a sentence it still catches "The conversation
 * outlines…" and "The user was asking…", which are the failures it was written for.
 */
const DISTANT = /(^|[.!?]\s+)(the|this)\s+(conversation|discussion|exchange|user|chat|thread|dialogue)\b/i;

/**
 * The instructions, which come *before* the conversation rather than after it.
 *
 * Both halves of this were learned the hard way from gemma3:4b. Worked examples are copied
 * out verbatim: an example drawn from the same subject supplied the opening sentence of the
 * record it was meant to be shaping, and when it was changed to a neutral subject the model
 * wrote about that subject instead — inventing a conversation about coaches to Malaga in
 * place of the one it had been given. So there are no example sentences here at all, only
 * rules, and nothing in this prompt is a sentence worth stealing.
 *
 * And the conversation goes last. Whatever sits closest to the answer carries the most
 * weight, and that should be the thing being described rather than the instructions for
 * describing it.
 */
const BEFORE = [
  "You are recording what a conversation says about the people in it, for a system that is",
  "learning about them over time.",
  "",
  "Write two to four sentences in the first person plural — we, us, our, you — as somebody",
  "who was there. Never write 'the conversation', 'the user' or 'this discussion'.",
  "",
  "Record only:",
  "  - what we were trying to do, and why",
  "  - constraints we work under, and what we prefer",
  "  - what we decided, and what we ruled out",
  "",
  // The failure this replaced was a false claim about the world. Wrapping the same claim in
  // "we realised that…" launders it rather than fixing it, and a later conversation handed
  // this back as context would carry the error forward as something we had settled.
  "Record no facts about the world, not even ones worked out here. How a tool, a place or a",
  "product actually behaves belongs to the transcript, and may be wrong.",
  "",
  "Reply as JSON and nothing else, in the form {\"context\":\"...\"}.",
  "If the conversation says nothing about us, reply {\"context\":\"\"}.",
  "",
  "The conversation follows.",
  "",
].join("\n");

const AFTER = [
  "",
  "",
  "Now write that account of the conversation above, as JSON.",
].join("\n");

/**
 * What the model returned, and — when that is nothing usable — which rule said so.
 *
 * The reason is carried out rather than thrown away because this runs unattended: the only
 * evidence anybody ever gets that the sweep is unhappy is one line on the settings screen,
 * and "could not read it" on repeat tells you nothing you can act on. "The account was
 * written from outside the conversation" does.
 *
 * @returns {{context: string|null, why: string|null}} `context` is the account, `""` when
 * the conversation genuinely said nothing about us, or `null` when nothing usable came
 * back. Those three are kept apart because "nothing to record" is an ordinary outcome and
 * "the model did not answer" is not — reporting the second as the first is how a broken
 * sweep looks like a quiet one.
 */
export function inspect(raw) {
  const text = String(raw ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "");

  // The last object carrying a `context` key. The prompt shows the model one to copy, and
  // a small model restating the format before answering is common; restating it after is
  // not.
  let found = null;
  for (let i = text.indexOf("{"); i !== -1; i = text.indexOf("{", i + 1)) {
    for (let j = text.lastIndexOf("}"); j > i; j = text.lastIndexOf("}", j - 1)) {
      try {
        const parsed = JSON.parse(text.slice(i, j + 1));
        if (typeof parsed?.context === "string") found = parsed.context.trim();
        break;
      } catch { /* not a whole object — keep looking */ }
    }
  }

  if (found === null) return { context: null, why: "it did not reply in the format asked for" };
  if (!found) return { context: "", why: null };   // it looked and found nothing. A real answer.

  // Everything below is the model answering badly, which is not the same as it answering
  // "nothing" — returning "" for these would mark the conversation read and record silence,
  // losing it for good. null sends it back round instead.
  if (DISTANT.test(found)) return { context: null, why: "the account was written from outside the conversation" };
  if (!OURS.test(found)) return { context: null, why: "the account never mentions us" };
  if (found.split(/\s+/).length > MAX_WORDS) return { context: null, why: "the account ran to a summary of the transcript" };

  return { context: found, why: null };
}

/** The account alone, for callers with nothing useful to do with the reason. */
export const readContext = (raw) => inspect(raw).context;

/**
 * Asks the model in the chips what this conversation says about us.
 *
 * @returns the same shape as {@link inspect}.
 *
 * Errors propagate. Nothing has been written at this point, so there is no half-done state
 * to protect — and swallowing the failure would put "nothing to record" in a log when the
 * truth was that nothing was asked.
 */
export async function observeConversation(candidate, conversation) {
  if (!candidate?.provider?.complete) throw new Error("no model is configured to read this");
  const reply = await candidate.provider.complete({
    model: candidate.model,
    key: candidate.key,
    messages: [{ role: "user", text: `${BEFORE}\n${conversation.slice(0, 6000)}${AFTER}` }],
  });
  return inspect(reply);
}
