/**
 * Noticing what a conversation was about (ADR-0007).
 *
 * Context, not claims. A small local model gets facts about the world confidently wrong;
 * what it cannot be wrong about is what we were doing, because it was there.
 */

/**
 * A backstop against a runaway answer, not a style rule. At 120 it threw away good accounts
 * for running slightly over, which left nothing recorded at all.
 */
const MAX_WORDS = 220;

/** A record that never says "we", "you" or "our" is writing about strangers. */
const OURS = /\b(we|we're|we've|our|us|you|you're|your)\b/i;

/**
 * Writing from outside is a way of starting a sentence, not a word to ban. Unanchored, this
 * threw away "we ultimately guided the conversation towards…" — somebody who was there.
 */
const DISTANT = /(^|[.!?]\s+)(the|this)\s+(conversation|discussion|exchange|user|chat|thread|dialogue)\b/i;

/**
 * No example sentences, and the conversation goes last. Both learned from gemma3:4b: it
 * copied worked examples out verbatim, and once wrote about the example's subject instead
 * of the conversation it had been given.
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
 * What the model returned, and which rule refused it when nothing usable came back. This
 * runs unattended, so the reason is the only evidence anybody gets.
 *
 * @returns {{context: string|null, why: string|null}} `""` means it looked and found
 * nothing, `null` means it did not answer. Reporting the second as the first is how a
 * broken sweep looks like a quiet one.
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
