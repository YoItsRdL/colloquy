/**
 * Model ids are interpolated into request paths, so they are validated here — once,
 * where the URL is built, rather than trusted from whoever passed them (ADR-0005).
 *
 * The client supplies this string. It is the only caller-controlled value that reaches
 * a provider URL, which makes it the one place a traversal or an injected query
 * parameter would land.
 */

/**
 * Exported so adapters filter listed ids by the same rule they are validated against.
 *
 * The colon is here for Ollama, which names models `family:tag` — `qwen3:4b`. Without it
 * no local model could be used at all, which is how it was found: the id was refused
 * before a request was ever made.
 *
 * What still cannot appear is what would change where a request goes: no `/` so nothing
 * can traverse, and no `?` or `&` so nothing can append a query. A colon can reach a
 * different method on the same endpoint with the same key, which is a smaller surface
 * than it sounds — these ids come from a provider's own listing or from the person's own
 * settings, and neither is a stranger.
 */
export const SAFE_ID = /^[A-Za-z0-9._:-]+$/;

/** @returns {string} the id, unchanged, when it is safe to put in a path */
export function safeModelId(model) {
  const id = String(model ?? "").trim();
  if (!id) throw new Error("no model specified");
  if (id.length > 100) throw new Error("model id is implausibly long");
  if (!SAFE_ID.test(id)) throw new Error(`unusable model id: ${JSON.stringify(id.slice(0, 40))}`);
  return id;
}
