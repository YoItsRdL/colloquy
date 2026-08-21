/**
 * OpenAI adapter. Everything OpenAI-specific is this file's few constants — the wire
 * format itself is shared with any provider that speaks it (openai-wire.mjs).
 */
import * as wire from "./openai-wire.js";

export const name = "openai";
export const label = "ChatGPT";   // what a person calls it, so no product name lives outside providers/
export const keyVar = "OPENAI_API_KEY";
export const defaultModel = "gpt-5";

const WIRE = { name, base: "https://api.openai.com/v1" };

export const complete = (opts) => wire.complete(WIRE, opts);
export const stream = (opts) => wire.stream(WIRE, opts);
export const models = (opts) => wire.models(WIRE, opts);
