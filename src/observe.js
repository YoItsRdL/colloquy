/**
 * Noticing what a conversation was about (ADR-0007).
 *
 * Context, not claims. A small local model gets facts about the world confidently wrong;
 * what it cannot be wrong about is what we were doing, because it was there.
 *
 * Which is true of our half of a conversation and not of the model's, so only our half is
 * read (ADR-0013). Reading both closed a loop with nothing outside it: a wrong answer was
 * summarised into something we had settled, handed to the next conversation as background,
 * agreed with, and summarised again. Four records here came to say we own a GTX 1070 Ti,
 * and one that a model with no such size was the version that worked.
 */
import { readTranscript } from "./transcript.js";

/**
 * What we said, and nothing the model said back.
 *
 * The questions carry the subject and the constraints, which is all this is for. An answer
 * is where the errors live, and none of them belong in something later conversations are
 * told as fact.
 */
function oursIn(raw) {
  return readTranscript(raw)
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.text)
    .join("\n\n");
}

/**
 * A backstop against a runaway answer, not a style rule. At 120 it threw away good accounts
 * for running slightly over, which left nothing recorded at all.
 */
const MAX_WORDS = 220;

/**
 * Below this our half is a greeting, and a greeting is not a conversation.
 *
 * The rule the prompt could not enforce. Asked to write two to four sentences about
 * "hello", a 4B model writes two to four sentences: one such exchange became "we were
 * attempting to refine the initial parameters for the project, settling on a more
 * iterative approach through rapid prototyping", and that account was then handed to
 * later conversations as background on somebody who had said nothing at all. The escape
 * hatch was in the prompt the whole time and never taken, because "reply empty" competes
 * with "write two to four sentences" and loses.
 *
 * So the question is not asked. Eight is measured rather than chosen, and the measurement
 * is why it is this tight: across a vault of twenty conversations every greeting ran to
 * seven words or fewer and every real exchange to eight or more, with nothing in between.
 * A looser floor would start throwing away the short real ones, which is the mistake this
 * file has made before and the reason MAX_WORDS above is 220 rather than 120.
 */
const MIN_WORDS = 8;

/** Whether our half of a conversation has enough in it to be worth an account. */
export const worthReading = (ours) => String(ours ?? "").split(/\s+/).filter(Boolean).length >= MIN_WORDS;

/** A record that never says "we", "you" or "our" is writing about strangers. */
const OURS = /\b(we|we're|we've|our|us|you|you're|your)\b/i;

/**
 * Writing from outside is a way of starting a sentence, not a word to ban. Unanchored, this
 * threw away "we ultimately guided the conversation towards…". Somebody who was there.
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
  // Said first, and as the ordinary outcome rather than a permission. Buried at the end as
  // one line against "write two to four sentences", it was never once taken: a small model
  // asked for sentences produces sentences, and invents the conversation to put in them.
  "Most conversations say nothing about the people in them. That is the usual answer and a",
  "good one. Write only what this conversation actually shows. If it shows nothing, if it is",
  "a greeting, a test, or too short to tell, reply {\"lately\":\"\",\"about\":\"\"} and stop.",
  "",
  "Otherwise write two to four sentences in the first person plural (we, us, our, you) as",
  "somebody who was there. Never write 'the conversation', 'the user' or 'this discussion'.",
  "",
  "Two parts, and they are different in kind:",
  "",
  "  lately: one or two sentences on what we were trying to do this time, why, and what we",
  "  chose to do next.",
  "",
  "  about: one or two sentences on what holds beyond today. What we work under, what we",
  "  prefer, how we like to work. Leave it empty unless this conversation shows something",
  "  that would still be true of us in a year.",
  "",
  // The failure this replaced was a false claim about the world. Wrapping the same claim in
  // "we realised that…" launders it rather than fixing it, and a later conversation handed
  // this back as context would carry the error forward as something we had settled.
  "Record no facts about the world, not even ones worked out here, and not as something we",
  "found or established. How a tool, a place or a product actually behaves belongs to the",
  "transcript, and may be wrong.",
  "",
  "Reply as JSON and nothing else, in the form {\"lately\":\"...\",\"about\":\"...\"}.",
  "Never invent a subject, a project or a decision that is not in what follows.",
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
 * @returns {{context: {lately: string, about: string}|null, why: string|null}} Two empty
 * strings mean it looked and found nothing, `null` means it did not answer. Reporting the
 * second as the first is how a broken sweep looks like a quiet one.
 */
export function inspect(raw) {
  const text = String(raw ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "");

  // The last object carrying either key. The prompt shows the model one to copy, and a
  // small model restating the format before answering is common; restating it after is not.
  let found = null;
  for (let i = text.indexOf("{"); i !== -1; i = text.indexOf("{", i + 1)) {
    for (let j = text.lastIndexOf("}"); j > i; j = text.lastIndexOf("}", j - 1)) {
      try {
        const parsed = JSON.parse(text.slice(i, j + 1));
        if (typeof parsed?.lately === "string" || typeof parsed?.about === "string") {
          found = {
            lately: String(parsed.lately ?? "").trim(),
            about: String(parsed.about ?? "").trim(),
          };
        }
        break;
      } catch { /* not a whole object, keep looking */ }
    }
  }

  if (found === null) return { context: null, why: "it did not reply in the format asked for" };

  // Judged together. The rules are about the voice an account is written in, and one
  // sentence of it can be in the wrong voice while the other is fine.
  const both = `${found.lately} ${found.about}`.trim();
  if (!both) return { context: found, why: null };   // it looked and found nothing. A real answer.

  // Everything below is the model answering badly, which is not the same as it answering
  // "nothing", returning empty for these would mark the conversation read and record
  // silence, losing it for good. null sends it back round instead.
  if (DISTANT.test(both)) return { context: null, why: "the account was written from outside the conversation" };
  if (!OURS.test(both)) return { context: null, why: "the account never mentions us" };
  if (both.split(/\s+/).length > MAX_WORDS) return { context: null, why: "the account ran to a summary of the transcript" };

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
 * to protect, and swallowing the failure would put "nothing to record" in a log when the
 * truth was that nothing was asked.
 */
export async function observeConversation(candidate, conversation) {
  if (!candidate?.provider?.complete) throw new Error("no model is configured to read this");

  // Two empty strings rather than null: it was looked at, and there was nothing in it. A
  // null would send the same greeting back round on every sweep, for ever.
  const ours = oursIn(conversation);
  if (!worthReading(ours)) return { context: { lately: "", about: "" }, why: null };

  const reply = await candidate.provider.complete({
    model: candidate.model,
    key: candidate.key,
    messages: [{ role: "user", text: `${BEFORE}\n${ours.slice(0, 6000)}${AFTER}` }],
  });
  return inspect(reply);
}
