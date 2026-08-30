/**
 * What the configured provider offers (ADR-0005).
 *
 * Asked of the provider rather than listed here, because a list in source is wrong
 * within a quarter and wrong silently. It keeps offering a model that no longer
 * answers, and omits ones that do.
 *
 * Cached for the process lifetime. Model lists change on the scale of weeks; fetching
 * one per menu open would spend a request to learn nothing.
 */
const cache = new Map();    // provider name -> [{ id, label }]
const broken = new Map();   // "provider/model" -> reason it failed, permanently
const cooling = new Map();  // "provider/model" -> when it may be tried again (epoch ms)
const unfunded = new Map(); // provider name -> why it has no balance

/**
 * Models the listing offers but which cannot hold a conversation.
 *
 * This is a HEURISTIC and the weakest thing in this file. The API gives no way to tell
 * them apart: a text-to-speech model advertises `generateContent` exactly as a chat
 * model does, and `gemini-2.5-pro` is described as a stable release right up until it
 * returns "no longer available to new users".
 *
 * Kept to suffixes that describe a modality rather than a version, because "a model
 * named -tts returns audio" ages far better than "these are the current models". When
 * it is wrong it is wrong in the recoverable direction: a hidden model can be requested
 * by setting GATEWAY_MODEL, whereas a broken one shown in a menu wastes a turn.
 */
const NOT_CONVERSATIONAL =
  /(^|-)(tts|embedding|aqa|imagen|veo|image|vision-only|whisper|dall|sora|moderation|audio|transcribe|realtime)(-|$)/i;

/** Records a model that failed, so the menu stops offering it (see listModels). */
export function markBroken(providerName, model, reason) {
  if (!model) return;
  broken.set(`${providerName}/${model}`, String(reason ?? "failed"));
}

export const isBroken = (providerName, model) => broken.get(`${providerName}/${model}`);

/**
 * A provider with no money behind it (TKT-0103).
 *
 * Recorded per provider, not per model, because that is what the failure is about. A
 * depleted balance stops every key on the account at once, so walking the models behind
 * it means the same refusal once per model.
 *
 * Held for the process only. Topping up is done elsewhere and reloading is how the
 * gateway is told, which is the same shape as every other verdict here.
 */
export function markUnfunded(providerName, reason) {
  if (providerName) unfunded.set(providerName, String(reason ?? "no balance"));
}

export const isUnfunded = (providerName) => unfunded.get(providerName);

/**
 * Records a model that is out of quota for now (ADR-0006).
 *
 * Deliberately separate from broken: this one comes back, and the menu keeps offering
 * it. Forgetting the difference is how a busy minute turns into a permanent migration.
 */
export function markExhausted(providerName, model, ms) {
  if (!model) return;
  cooling.set(`${providerName}/${model}`, Date.now() + ms);
}

/** True while a model is still cooling. Expiry is checked on read, so nothing sweeps. */
export function isCooling(providerName, model) {
  const key = `${providerName}/${model}`;
  const until = cooling.get(key);
  if (until === undefined) return false;
  if (Date.now() < until) return true;
  cooling.delete(key);
  return false;
}

/**
 * Every provider with a key, and what each offers (TKT-0704).
 *
 * One provider failing to list must not empty the menu, so a failure falls back to that
 * provider's default model. The same answer given for an adapter that cannot list at
 * all. A provider offering one usable option is more use than a menu that will not open.
 */
export async function listAll(config, { signal } = {}) {
  const sources = [
    { provider: config.provider, key: config.key, prefer: config.model },
    ...(config.alternatives ?? []),
  ];

  // Asked all at once. Awaiting each in turn costs the sum of four round-trips for a
  // menu someone is waiting on, and the calls have nothing to do with each other.
  // Order is preserved by mapping rather than by arrival.
  const asked = sources
    .filter((source) => source.key)
    .map(async (source) => {
      let models;
      try {
        models = await listModels({ ...config, ...source }, { signal });
      } catch {
        models = [{ id: source.prefer ?? source.provider.defaultModel }];
      }
      return {
        provider: source.provider.name,
        label: source.provider.label ?? source.provider.name,
        models,
      };
    });

  return (await Promise.all(asked)).filter((group) => group.models.length);
}

/**
 * What to run when nobody has chosen a model.
 *
 * An adapter's `defaultModel` is a constant in source, which is a guess everywhere and a
 * wrong one for a provider that keeps its models on the disk. Ollama's said `qwen3:4b` on
 * a machine holding gemma3, so a vault whose stored model went missing asked for something
 * that was never installed and failed every turn.
 *
 * Only for an adapter whose listing is the whole truth: for a hosted one the constant is
 * the better answer, since its listing runs to hundreds of models in no useful order. A
 * provider that cannot be reached falls back to the constant too, because a default that
 * needs the network to exist is not a default.
 */
export async function defaultModelFor(config, { signal } = {}) {
  const fallback = config.provider?.defaultModel;
  if (!config.provider?.listsEverything) return fallback;
  try {
    const [first] = await listModels(config, { signal });
    return first?.id ?? fallback;
  } catch {
    return fallback;
  }
}

export async function listModels(config, { signal } = {}) {
  const provider = config.provider;
  const key = provider.name;

  if (!cache.has(key)) {
    // An adapter without models() reports its default and nothing else, so the menu
    // shows one option rather than an empty list or an error.
    if (typeof provider.models !== "function") {
      cache.set(key, [{ id: provider.defaultModel }]);
    } else {
      const listed = await provider.models({ key: config.key, signal });
      const seen = new Set();
      const models = [];

      // The configured model first and always present, because a hosted provider ships
      // models faster than it lists them and a menu that omits what is currently running
      // is broken. Not for an adapter that says its listing is the whole truth: a local
      // one reads the disk, so a model missing from the list is a model that is not
      // installed, and seeding it there offered `qwen3:4b` on a machine holding gemma3.
      const seed = provider.listsEverything ? [] : [{ id: config.model }];

      for (const entry of [...seed, ...listed]) {
        if (!entry?.id || seen.has(entry.id)) continue;
        if (entry.id !== config.model && NOT_CONVERSATIONAL.test(entry.id)) continue;
        seen.add(entry.id);
        models.push({ id: entry.id, label: entry.label ?? entry.id });
      }
      cache.set(key, models);
    }
  }

  // Drop what has actually failed. Observing beats predicting: the provider's own
  // listing cannot say which models a key may use, but a 404 already did.
  return cache.get(key).filter((m) => !broken.has(`${key}/${m.id}`));
}

/** For tests, and for a future reload that does not exist yet. */
export function forgetModels() {
  cache.clear();
  broken.clear();
  cooling.clear();
  unfunded.clear();
}
