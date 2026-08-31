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

/**
 * What the work nobody asked for runs against (ADR-0016).
 *
 * Reading a conversation and naming one happen on their own, so what they cost and how
 * long they take are not felt by anyone at the time. That is a different question from
 * which model should answer, and until now it was not asked: both ran on whatever the
 * chips said, which meant a conversation held with a paid provider was never read at all.
 *
 * Unset is the default and is not a model: it means the chat one, exactly as before.
 * `chosen` says which of the two answered, because the sweep's free-only rule (ADR-0006)
 * turns on it. A bill nobody chose is what that rule is against, and this is a choice.
 *
 * A background provider whose key has since gone gives way to the chat one rather than
 * failing, on the same reasoning as chooseProvider above: the work runs unattended, and
 * unattended work that stops has no one to tell.
 */
export function backgroundConfig(settings, keys) {
  const wanted = settings?.background;
  let adapter = null;
  if (wanted?.provider) {
    try {
      adapter = resolveProvider(wanted.provider);
    } catch {
      adapter = null;   // a provider that no longer exists at all
    }
  }
  if (!adapter || !keys[adapter.keyVar]) return { ...buildConfig(settings, keys), chosen: false };

  return {
    provider: adapter,
    model: wanted.model ?? adapter.defaultModel,
    key: keys[adapter.keyVar],
    chosen: true,
  };
}
