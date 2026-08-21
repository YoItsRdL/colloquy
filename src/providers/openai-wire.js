/**
 * The OpenAI chat-completions wire format, which several providers speak.
 *
 * Not a provider. It exists because OpenAI and DeepSeek differ only in a hostname and a
 * key variable, and two copies of a streaming parser would drift — the failure this
 * project has already had once. Adapters stay one-per-provider (AGENTS.md standard 2);
 * this is the format they share, and it lives inside providers/ where wire knowledge
 * belongs.
 */
import { safeModelId, SAFE_ID } from "./model-id.js";

const SEP_RECORD = /\r?\n\r?\n/;
const SEP_LINE = /\r?\n/;

const headers = (key) => ({
  "content-type": "application/json",
  authorization: `Bearer ${key}`,
});

/**
 * `extra` is whatever the adapter needs on top of the shared shape. It exists because
 * one provider's necessary field is another's error: Ollama honours
 * `reasoning_effort: "none"`, and sending that to OpenAI would be rejected.
 */
/**
 * A turn's content: a bare string when there is nothing but words, an array when an image
 * travels with them.
 *
 * The bare string is not a nicety. It is what all of these APIs accepted before images
 * existed, and sending a one-element array instead would change the request for every turn
 * to serve the few that carry a picture.
 */
const contentOf = (m) => (
  m.images?.length
    ? [
      { type: "text", text: m.text },
      ...m.images.map((image) => ({
        type: "image_url",
        image_url: { url: `data:${image.mime};base64,${image.data}` },
      })),
    ]
    : m.text
);

const body = (model, messages, stream, extra) => JSON.stringify({
  model: safeModelId(model),
  stream,
  messages: messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: contentOf(m),
  })),
  ...extra,
});

/**
 * Provider errors arrive as JSON. Keep the part a person can act on — and the machine
 * readable part, which is sometimes the only thing that distinguishes two situations.
 *
 * "You exceeded your current quota, please check your plan and billing details" is what
 * this API says when an account is out of credit, and it is word for word what a rate
 * limit sounds like. Only `type: insufficient_quota` tells them apart, so discarding it
 * meant an empty account was read as a busy minute and retried forever.
 */
function summarise(raw) {
  try {
    const error = JSON.parse(raw)?.error;
    if (!error) return raw.slice(0, 200);
    const kind = error.type ?? error.code;
    return kind ? `${kind}: ${error.message}` : error.message;
  } catch {
    return raw.slice(0, 200); // not JSON; the raw prefix is the best available detail
  }
}

async function post({ name, base, extra }, { model, messages, key, signal }, streaming) {
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: headers(key),
    body: body(model, messages, streaming, extra),
    signal,
  });
  if (!res.ok) {
    throw new Error(`${name} ${res.status}: ${summarise(await res.text().catch(() => ""))}`);
  }
  return res;
}

export async function complete(wire, opts) {
  const data = await (await post(wire, opts, false)).json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) {
    throw new Error(`${wire.name}: ${data?.choices?.[0]?.finish_reason ?? "no content in response"}`);
  }
  return text;
}

/**
 * Streaming (ADR-0004).
 *
 * Records are `data:` lines, ending at a literal [DONE] rather than at end-of-body. A
 * record that is not JSON is a framing hiccup and is skipped; failing on one would kill
 * a stream that is otherwise fine.
 */
export async function* stream(wire, opts) {
  const res = await post(wire, opts, true);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });

    const records = buffered.split(SEP_RECORD);
    buffered = records.pop() ?? "";

    for (const record of records) {
      for (const line of record.split(SEP_LINE)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let event;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }
        // An error after the stream opens arrives in the body, not the status line.
        if (event?.error) throw new Error(`${wire.name}: ${event.error.message ?? "stream error"}`);
        const text = event?.choices?.[0]?.delta?.content ?? "";
        if (text) yield text;
      }
    }
  }
}

/** What this provider offers (ADR-0005). */
export async function models({ name, base }, { key, signal }) {
  const res = await fetch(`${base}/models`, { headers: headers(key), signal });
  if (!res.ok) throw new Error(`${name} ${res.status}: could not list models`);
  const data = await res.json();
  return (data?.data ?? [])
    .map((m) => ({ id: String(m.id) }))
    .filter((m) => SAFE_ID.test(m.id));
}
