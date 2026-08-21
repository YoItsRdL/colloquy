/**
 * DeepSeek adapter. Speaks the OpenAI wire format, so this file is the hostname, the
 * key variable, and nothing else (openai-wire.mjs).
 */
import * as wire from "./openai-wire.js";

export const name = "deepseek";
export const label = "DeepSeek";   // what a person calls it, so no product name lives outside providers/
export const keyVar = "DEEPSEEK_API_KEY";
export const defaultModel = "deepseek-v4-flash";

const WIRE = { name, base: "https://api.deepseek.com/v1" };

export const complete = (opts) => wire.complete(WIRE, opts);
export const stream = (opts) => wire.stream(WIRE, opts);
export const models = (opts) => wire.models(WIRE, opts);
