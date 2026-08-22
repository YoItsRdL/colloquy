/** How a model is named in the interface. Its own file so it is testable without Obsidian. */

/**
 * The model id without the provider's name on the front.
 *
 * "Gemini" beside "gemini-flash-latest" says gemini twice. The full id stays in the chip's
 * tooltip.
 */
export function shorten(model, provider) {
  const id = String(model ?? "");
  for (const prefix of [provider?.name, provider?.label]) {
    if (!prefix) continue;
    const head = `${String(prefix).toLowerCase()}-`;
    if (!id.toLowerCase().startsWith(head)) continue;
    const rest = id.slice(head.length);
    // A chip reading nothing tells you less than one repeating the provider.
    if (rest) return rest;
  }
  return id;
}
