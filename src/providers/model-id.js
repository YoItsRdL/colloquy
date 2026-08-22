/** Model ids reach a request path, so they are validated where the URL is built. */

/**
 * The colon is for Ollama, which names models `family:tag`. Leaving it out refused every
 * local model before a request was made.
 *
 * No `/` so nothing can traverse, no `?` or `&` so nothing can append a query.
 */
export const SAFE_ID = /^[A-Za-z0-9._:-]+$/;

export function safeModelId(model) {
  const id = String(model ?? "").trim();
  if (!id) throw new Error("no model specified");
  if (id.length > 100) throw new Error("model id is implausibly long");
  if (!SAFE_ID.test(id)) throw new Error(`unusable model id: ${JSON.stringify(id.slice(0, 40))}`);
  return id;
}
