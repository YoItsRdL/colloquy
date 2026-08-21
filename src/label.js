/**
 * How a model is named in the interface (TKT-0102).
 *
 * Its own file, with no Obsidian import, because it is a judgement rather than glue —
 * and AGENTS.md asks that anything with a decision in it be testable without Obsidian.
 * It first lived in chips.js, where the test could not load it.
 */

/**
 * The model id without the provider's name on the front.
 *
 * "Gemini" beside "gemini-flash-latest" says gemini twice, and that repetition is the
 * loudest thing in a row whose only real action is Send. What distinguishes one model
 * from another is the rest of the id.
 *
 * The full id stays in the chip's tooltip: this hides information to read better, and
 * hiding it outright would be a different thing.
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
