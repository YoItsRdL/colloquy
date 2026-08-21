/**
 * Assembling what a turn runs against (ADR-0009).
 *
 * Pure on purpose: it takes the keys as a plain object rather than reading them, so every
 * rule here is testable without Obsidian. The rules are the part worth testing — reading a
 * file is not.
 *
 * There used to be a chain here — a list of other providers a turn could fall back to, and
 * a list of paid ones it could offer to escalate to. Both are gone (ADR-0009). What a turn
 * runs against is now what the chips say it runs against.
 */
import { resolve as resolveProvider, defaultProvider } from "./providers/index.js";

/**
 * The provider, model and key a turn will use.
 *
 * A stored provider that no longer exists falls back to the default rather than throwing:
 * a plugin that will not start because a preference names something removed in an update
 * is a plugin that has lost its own conversation history to a rename.
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
