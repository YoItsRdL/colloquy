/**
 * One exchange: ask, stream, record (ADR-0009).
 *
 * One provider, one model, the one you chose. There is no fallback chain any more — see
 * ADR-0009 for what it cost and why it went.
 */

/** Background rides in front of the history rather than inside it, so it is sent once. */
const messagesFor = (session) =>
  (session.context ? [{ role: "user", text: session.context }, ...session.history] : session.history);

/** An adapter without `stream()` yields its whole reply as one chunk. */
async function* chunksFrom({ provider, model, key }, messages, signal) {
  if (typeof provider.stream === "function") {
    yield* provider.stream({ model, messages, key, signal });
    return;
  }
  yield await provider.complete({ model, messages, key, signal });
}

/**
 * "Failed to fetch" is what a browser says for no connection, a blocked origin, or an
 * error too malformed to read — three words naming none of them, written into a note
 * somebody re-reads weeks later.
 *
 * Widened into a sentence, and deliberately not into a diagnosis. Every other message is
 * passed through as the provider wrote it.
 */
function explain(detail, config) {
  if (!/^(Failed to fetch|fetch failed|Load failed|NetworkError.*)$/i.test(detail.trim())) {
    return detail;
  }
  const label = config.provider.label ?? config.provider.name;

  // A provider addressed by a URL runs on a machine the person asking controls, and
  // nothing readable coming back from it almost always means it is not running. Saying so
  // — with the address, so a wrong one is visible — beats listing the possibilities and
  // leaving them to guess between them.
  if (config.provider.keyKind === "url") {
    return `${label} is not answering at ${config.key}. It is usually not running: start ` +
      "it and try again. If it is running, that address is pointing somewhere else.";
  }

  return `The request to ${label} did not complete, and it returned nothing to explain ` +
    "why. That is usually no connection, or a provider refusing so hard that the reply " +
    "cannot be read — retrying often works, and repeating a failure quickly often makes " +
    "it worse.";
}

/**
 * Runs a turn. A partial reply is kept: whatever arrived before a stream broke is still
 * what the model said, and usually the most useful thing on screen when something failed.
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
    // Stopping is not failing — the person asked for it, so there is nothing to report.
    if (signal?.aborted) return { reply, answered: config, stopped: true, detail: null };

    return { reply, answered: null, stopped: false, detail: explain(String(err?.message ?? err), config) };
  }
}
