/**
 * Where the keys live (ADR-0004).
 *
 * In Obsidian's own plugin data, which is the native place and the only one reachable on
 * a phone. That directory is tracked in this repository, so the store is gitignored and
 * the gate fails if it ever becomes tracked. The protection is a check, not a habit.
 *
 * Values are never returned to the interface. `status()` says whether a key exists; only
 * a turn ever sees one, and only on its way to a provider.
 */
import { Platform } from "obsidian";

const SAFE_NAME = /^[A-Z][A-Z0-9_]*$/;

export class KeyError extends Error {}

/** @returns {Record<string,string>} every key set, for a turn to pick from. */
export function keysOf(settings, adapters = [], { mobile = Platform.isMobile } = {}) {
  const stored = { ...(settings.keys ?? {}) };
  // An adapter that names its own default is configured without anyone typing it. Ollama
  // needs an address, not a secret, and "http://localhost:11434/v1" is the right answer
  // often enough that asking for it first would be ceremony.
  //
  // Not on a phone, though: nothing is listening on a phone's own localhost, so assuming
  // it there configures a provider that cannot answer, names it on the chip, and fails
  // every question with advice (start the server) that cannot be taken on that device.
  // An address typed in by hand still works, which is the case that matters: Ollama on a
  // desktop, reached over the network (ADR-0012).
  for (const adapter of adapters) {
    if (mobile) continue;
    if (adapter.keyVar && adapter.defaultKey && !stored[adapter.keyVar]) {
      stored[adapter.keyVar] = adapter.defaultKey;
    }
  }
  return stored;
}

/** What may be shown: which providers are configured, never what with. */
export function status(adapters, settings) {
  const keys = keysOf(settings, adapters);
  return adapters
    .filter((adapter) => adapter.keyVar)
    .map((adapter) => ({
      name: adapter.name,
      label: adapter.label ?? adapter.name,
      keyVar: adapter.keyVar,
      configured: Boolean(keys[adapter.keyVar]),
      kind: adapter.keyKind ?? "secret",
      // Returned only when it is not a secret. A URL is configuration; a key is not, and
      // handing one back to the interface is the thing ADR-0004 refuses to do.
      value: adapter.keyKind === "url" ? keys[adapter.keyVar] ?? null : null,
      hint: adapter.keyHint ?? null,
      placeholder: adapter.defaultKey ?? null,
    }));
}

/** Sets or clears one key in the settings object. Saving it is the caller's job. */
export function setKey(settings, keyVar, value) {
  if (!SAFE_NAME.test(String(keyVar ?? ""))) throw new KeyError("unusable variable name");

  const clean = String(value ?? "").trim();
  settings.keys = { ...(settings.keys ?? {}) };

  if (!clean) {
    delete settings.keys[keyVar];
    return settings;
  }
  // Whitespace is the usual damage from a copy-paste, and a key with a stray newline
  // fails with an error that says nothing about why.
  if (/\s/.test(clean)) throw new KeyError("that does not look like a key: it contains whitespace");
  if (clean.length > 500) throw new KeyError("that is too long to be a key");

  settings.keys[keyVar] = clean;
  return settings;
}
