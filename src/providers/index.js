/**
 * The only file that knows provider names exist (ADR-0001).
 *
 * Adding a provider is adding an adapter file and one line here. Removing one is
 * deleting a file. Neither touches the server.
 */
import * as anthropic from "./anthropic.js";
import * as deepseek from "./deepseek.js";
import * as gemini from "./gemini.js";
import * as ollama from "./ollama.js";
import * as openai from "./openai.js";
import * as stub from "./stub.js";

const adapters = new Map(
  [anthropic, deepseek, gemini, ollama, openai, stub].map((a) => [a.name, a])
);

/** @returns {{name: string, defaultModel: string, keyVar: string, complete: Function}} */
export function resolve(providerName) {
  const adapter = adapters.get(providerName);
  if (!adapter) {
    // Fail at startup with the list, not at the first request with a stack trace.
    throw new Error(
      `unknown provider "${providerName}". available: ${[...adapters.keys()].join(", ")}`
    );
  }
  return adapter;
}

export const available = () => [...adapters.keys()];

/** Every adapter, for callers that need to ask which ones have a key configured. */
export const all = () => [...adapters.values()].filter((a) => !a.internal);

/** The default when GATEWAY_PROVIDER is unset. Lives here so no provider name
 *  appears outside this directory (ADR-0001). */
export const defaultProvider = gemini.name;
