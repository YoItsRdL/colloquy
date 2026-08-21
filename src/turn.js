/**
 * One exchange: ask, stream, record (ADR-0001, ADR-0009).
 *
 * One provider, one model, the one you chose. There used to be a chain here that walked to
 * a second provider when the first refused, classified the refusal into a taxonomy, kept a
 * register of which models were cooling off, and offered to continue somewhere that cost
 * money. It was written when every hosted provider was out of credit and a local model was
 * not an option; it answered a question nobody has any more, at the price of a person never
 * being sure which model had actually replied.
 *
 * What is left is what a person needs: the answer, or a plain account of why there is none.
 */

/**
 * What the model is sent: the conversation, with any background in front of it.
 *
 * Prepended here rather than pushed into the history, so it never reaches the transcript
 * and cannot be sent twice — the file records what was said, and background was not said
 * by anybody.
 */
const messagesFor = (session) =>
  (session.context ? [{ role: "user", text: session.context }, ...session.history] : session.history);

/**
 * Chunks from an adapter, whichever way it can produce them.
 *
 * An adapter without `stream()` yields its whole reply as one chunk, so nothing above
 * branches on provider capability.
 */
async function* chunksFrom({ provider, model, key }, messages, signal) {
  if (typeof provider.stream === "function") {
    yield* provider.stream({ model, messages, key, signal });
    return;
  }
  yield await provider.complete({ model, messages, key, signal });
}

/**
 * A refusal that reached the vault reading "Failed to fetch" and nothing else.
 *
 * That is what a browser says when a request never produced a usable response — no
 * connection, a blocked origin, or an error the provider returned without the headers a
 * browser needs to read it. Three words that name none of those, written into a note
 * someone will re-read weeks later.
 *
 * So it is widened into a sentence, and deliberately not into a diagnosis: which of those
 * happened is not knowable from here, and guessing would be worse than saying so. Every
 * other message is passed through exactly as the provider wrote it — it knows what went
 * wrong and this does not.
 */
function explain(detail, config) {
  if (!/^(Failed to fetch|fetch failed|Load failed|NetworkError.*)$/i.test(detail.trim())) {
    return detail;
  }
  return `The request to ${config.provider.label ?? config.provider.name} did not ` +
    "complete, and it returned nothing to explain why. That is usually no connection, or " +
    "a provider refusing so hard that the reply cannot be read — retrying often works, " +
    "and repeating a failure quickly often makes it worse.";
}

/**
 * Runs a turn and reports progress as it goes.
 *
 * A partial reply is kept. Whatever arrived before a stream broke is still what the model
 * said, and it is usually the most useful thing on the screen when something has gone
 * wrong — discarding it to keep the failure tidy would be tidying away the answer.
 *
 * @param {{onChunk: Function}} watch
 * @returns {{reply: string, answered: object|null, detail: string|null}}
 */
export async function runTurn(config, session, watch = {}, signal) {
  let reply = "";
  try {
    for await (const chunk of chunksFrom(config, messagesFor(session), signal)) {
      reply += chunk;
      watch.onChunk?.(chunk, reply);
    }
    return { reply, answered: config, stopped: false, detail: null };
  } catch (err) {
    // Stopping is not failing. The person asked for it, so there is nothing to report and
    // nothing to apologise for — what arrived before they stopped is kept and treated as
    // the answer, because it is.
    if (signal?.aborted) return { reply, answered: config, stopped: true, detail: null };

    return { reply, answered: null, stopped: false, detail: explain(String(err?.message ?? err), config) };
  }
}
