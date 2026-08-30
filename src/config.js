/**
 * What a turn runs against (ADR-0009).
 *
 * Takes keys as a plain object rather than reading them, so the rules are testable
 * without Obsidian.
 */
import { resolve as resolveProvider, defaultProvider, all as allAdapters } from "./providers/index.js";

/** Every adapter that could actually answer right now, in registration order. */
const configured = (keys) => allAdapters().filter((a) => a.keyVar && keys[a.keyVar]);

/**
 * Which provider answers, and never one that cannot.
 *
 * Lives here rather than beside the chips because both need the same answer and, for a
 * while, did not have it. The chip fell back to a provider with a key; a turn took the
 * stored preference at face value. With only Ollama configured that read "Ollama" on
 * screen while every question went to Gemini and failed with "no key" for a provider
 * nobody had chosen. Two rules for one question is one rule too many: this is the rule,
 * and the chip asks it too.
 *
 * A stored provider that no longer exists, or one whose key has since been removed, falls
 * back to whatever can answer. When nothing can, the stored choice is returned unchanged
 * so the error names the provider someone actually picked rather than an arbitrary one.
 */
export function chooseProvider(settings, keys) {
  let chosen = null;
  try {
    chosen = resolveProvider(settings.provider ?? defaultProvider);
  } catch {
    chosen = null;   // a provider that no longer exists at all
  }
  if (chosen && keys[chosen.keyVar]) return chosen;
  return configured(keys)[0] ?? chosen ?? resolveProvider(defaultProvider);
}

/**
 * A stored provider that no longer exists falls back rather than throwing. A plugin that
 * will not start because of a stale preference has taken its own history with it.
 */
export function buildConfig(settings, keys) {
  const provider = chooseProvider(settings, keys);

  return {
    provider,
    model: settings.model ?? provider.defaultModel,
    key: keys[provider.keyVar],
  };
}
