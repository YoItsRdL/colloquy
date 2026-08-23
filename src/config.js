/**
 * What a turn runs against (ADR-0009).
 *
 * Takes keys as a plain object rather than reading them, so the rules are testable
 * without Obsidian.
 */
import { resolve as resolveProvider, defaultProvider } from "./providers/index.js";

/**
 * A stored provider that no longer exists falls back to the default rather than throwing.
 * A plugin that will not start because of a stale preference has taken its own history
 * with it.
 */
export function buildConfig(settings, keys) {
  let provider;
  try {
    provider = resolveProvider(settings.provider ?? defaultProvider);
  } catch {
    provider = resolveProvider(defaultProvider);
  }

  return {
    provider,
    model: settings.model ?? provider.defaultModel,
    key: keys[provider.keyVar],
  };
}
