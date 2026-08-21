/**
 * Ollama, running on this machine (TKT-0105).
 *
 * Speaks the OpenAI wire format, so the streaming, the error handling and the model
 * listing are all the ones already shipped. What is different is what it needs to be
 * configured with.
 *
 * **It has no API key.** Every other provider is configured by a secret; this one is
 * configured by an address, because the thing being named is a server rather than an
 * account. So `keyVar` holds a URL and `keyKind` says so, which is how the settings
 * screen knows to show a plain field with a sensible default instead of a password box
 * asking for a key that does not exist.
 *
 * The wire format still wants a bearer token and Ollama still ignores it, so a constant
 * is sent rather than inventing a way to omit it — one shape for every provider is worth
 * more than saving a header nobody reads.
 */
import * as wire from "./openai-wire.js";

export const name = "ollama";
export const label = "Ollama";
export const keyVar = "OLLAMA_URL";
export const keyKind = "url";
export const defaultKey = "http://localhost:11434/v1";
export const defaultModel = "qwen3:4b";

/** What a person needs to know to fill the field in, in their words rather than ours. */
export const keyHint = "Where Ollama is listening. The default is right if it runs on this machine.";

/**
 * Nothing extra, and that is a decision rather than an omission.
 *
 * A reasoning model like qwen3 thinks before it answers, which costs about four seconds
 * before the first token on a GTX 1070. `reasoning_effort: "none"` cuts that to 231ms and
 * was tried for exactly that reason — and it does not remove the thinking, it moves it
 * into the answer. The reply began "Okay, the user asked… Hmm, they want a super concise
 * definition", which is the model talking to itself, written into someone's vault.
 *
 * Left at the provider's default, where Ollama keeps reasoning out of `content`. The four
 * seconds buy a clean note, and the note is the product.
 */
const wireFor = (key) => ({ name, base: String(key || defaultKey).replace(/\/+$/, "") });

// Ollama ignores authorization entirely. A constant keeps every adapter the same shape.
const IGNORED = "ollama";

export const complete = (opts) => wire.complete(wireFor(opts.key), { ...opts, key: IGNORED });
export const stream = (opts) => wire.stream(wireFor(opts.key), { ...opts, key: IGNORED });
export const models = (opts) => wire.models(wireFor(opts.key), { ...opts, key: IGNORED });

/**
 * Managing what is installed, over HTTP (TKT-0106).
 *
 * Ollama serves this on its own endpoints rather than the OpenAI-compatible ones, so the
 * `/v1` suffix comes off. Doing it over HTTP rather than by running `ollama pull` is what
 * keeps standard 7 intact — no process is spawned, so nothing here is desktop-only.
 *
 * Optional by design: `library` is what the settings screen looks for, so a provider that
 * cannot manage its own models simply does not offer to. Nothing outside providers/ needs
 * to know which one this is.
 */
const root = (key) => String(key || defaultKey).replace(/\/+$/, "").replace(/\/v1$/, "");

const asJson = async (res, what) => {
  if (!res.ok) throw new Error(`${name} ${res.status}: could not ${what}`);
  return res.json();
};

export const library = {
  /** What is installed, with enough detail to decide what to remove. */
  async list({ key, signal }) {
    const data = await asJson(await fetch(`${root(key)}/api/tags`, { signal }), "list models");
    return (data?.models ?? []).map((m) => ({
      id: String(m.name),
      bytes: Number(m.size) || 0,
      // Shown because "4.0B Q4_K_M" is what decides whether a model fits in 8GB, and it
      // is otherwise buried in a name that does not always say.
      detail: [m.details?.parameter_size, m.details?.quantization_level].filter(Boolean).join(" · "),
    }));
  },

  /**
   * Downloads a model, reporting progress as it goes.
   *
   * Progress matters more here than anywhere else in this plugin: these are gigabytes,
   * and a button that sits still for twenty minutes is indistinguishable from one that
   * has failed.
   */
  async pull({ key, model, signal }, onProgress) {
    const res = await fetch(`${root(key)}/api/pull`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
      signal,
    });
    if (!res.ok) throw new Error(`${name} ${res.status}: ${(await res.text()).slice(0, 160)}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });

      // Newline-delimited JSON, not SSE. A partial last line stays buffered.
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        // An error arrives in the body once the stream has opened, not as a status.
        if (event.error) throw new Error(`${name}: ${event.error}`);
        onProgress?.({
          status: event.status ?? "",
          completed: Number(event.completed) || 0,
          total: Number(event.total) || 0,
        });
      }
    }
  },

  async remove({ key, model, signal }) {
    const res = await fetch(`${root(key)}/api/delete`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model }),
      signal,
    });
    if (!res.ok) throw new Error(`${name} ${res.status}: could not remove ${model}`);
  },
};
