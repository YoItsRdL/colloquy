/**
 * Test adapter. Exists so the seam is provable without a network call or a real key.
 *
 * Until something other than the first real provider goes through this interface,
 * "provider-agnostic" is an assertion. This makes it testable now; a second real
 * adapter (phase 4) makes it true.
 */

export const name = "stub";
// Machinery: resolvable by name so the seam can be tested, and absent from every
// list a person sees. A test double in a settings screen is a leak, not a feature.
export const internal = true;
export const label = "Stub";   // what a person calls it, so no product name lives outside providers/
export const defaultModel = "echo";
export const keyVar = "STUB_API_KEY";

export async function complete({ messages }) {
  const last = messages.at(-1)?.text ?? "";
  if (last.startsWith("!fail")) throw new Error(`${name} 500: deliberate failure`);
  return `stub reply to: ${last}`;
}

/** Streams the same reply in pieces, so both paths can be compared in tests. */
export async function* stream({ messages }) {
  const last = messages.at(-1)?.text ?? "";
  if (last.startsWith("!fail")) throw new Error(`${name} 500: deliberate failure`);
  if (last.startsWith("!midfail")) {
    yield "partial ";
    throw new Error(`${name} 500: failed midway`);
  }
  for (const piece of `stub reply to: ${last}`.match(/.{1,7}/g) ?? []) {
    yield piece;
  }
}

/** Fixed list, so the selection path is testable without a network. */
export async function models() {
  return [
    { id: "echo", label: "Echo" },
    { id: "echo-slow", label: "Echo (slow)" },
  ];
}
