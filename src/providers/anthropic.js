/**
 * Anthropic adapter. All Anthropic-specific knowledge lives here and nowhere else.
 *
 * Its wire format disagrees with Gemini's at almost every point, a different auth
 * header, a required max_tokens, content blocks instead of parts, and typed streaming
 * events rather than whole candidates. Translating all of that inside this file is the
 * test of ADR-0001: if the seam is real, nothing outside providers/ notices.
 */

import { safeModelId, SAFE_ID } from "./model-id.js";

export const name = "anthropic";
export const label = "Claude";   // what a person calls it, so no product name lives outside providers/
export const defaultModel = "claude-sonnet-5";
export const keyVar = "ANTHROPIC_API_KEY";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

// Server-Sent Events framing, same shape as any other SSE producer.
const SEP_RECORD = /\r?\n\r?\n/;
const SEP_LINE = /\r?\n/;

/**
 * Required by this API and absent from the neutral shape, so it is decided here rather
 * than pushed into the interface. Generous enough not to truncate a normal reply.
 */
const MAX_TOKENS = 4096;

const headers = (key) => ({
  "content-type": "application/json",
  "x-api-key": key,
  "anthropic-version": VERSION,
});

/**
 * Images before the text, which is this API's own advice: a question about a picture reads
 * better to the model when the picture is already there.
 */
const contentOf = (m) => (
  m.images?.length
    ? [
      ...m.images.map((image) => ({
        type: "image",
        source: { type: "base64", media_type: image.mime, data: image.data },
      })),
      { type: "text", text: m.text },
    ]
    : m.text
);

const body = (model, messages, stream) => JSON.stringify({
  model: safeModelId(model),
  max_tokens: MAX_TOKENS,
  stream,
  messages: messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: contentOf(m),
  })),
});

export async function complete({ model, messages, key, signal }) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: headers(key),
    body: body(model, messages, false),
    signal,
  });

  if (!res.ok) {
    throw new Error(`${name} ${res.status}: ${summarise(await res.text().catch(() => ""))}`);
  }

  const data = await res.json();
  const text = (data?.content ?? [])
    .filter((block) => block?.type === "text")
    .map((block) => block.text)
    .join("");
  if (!text) throw new Error(`${name}: ${data?.stop_reason ?? "no content in response"}`);
  return text;
}

/**
 * Streaming (ADR-0004).
 *
 * Anthropic sends typed events, most of which carry no text, message_start, ping,
 * content_block_start, message_delta. Only content_block_delta does. Ignoring the rest
 * rather than failing on them is the difference between a working stream and one that
 * dies on the first keepalive.
 */
export async function* stream({ model, messages, key, signal }) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: headers(key),
    body: body(model, messages, true),
    signal,
  });

  if (!res.ok) {
    throw new Error(`${name} ${res.status}: ${summarise(await res.text().catch(() => ""))}`);
  }

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
        if (!payload) continue;
        try {
          const event = JSON.parse(payload);
          // An error arrives as an event rather than a status code once the stream has
          // started, so it has to be noticed here or the reply just stops silently.
          if (event?.type === "error") {
            throw new Error(`${name}: ${event.error?.message ?? "stream error"}`);
          }
          if (event?.type !== "content_block_delta") continue;
          const text = event.delta?.text ?? "";
          if (text) yield text;
        } catch (err) {
          if (err instanceof SyntaxError) continue;  // a framing hiccup, keep reading
          throw err;
        }
      }
    }
  }
}

/** Provider errors arrive as JSON. Keep the part a person can act on. */
function summarise(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message ?? raw.slice(0, 200);
  } catch {
    return raw.slice(0, 200); // not JSON; the raw prefix is the best available detail
  }
}

/** What this provider offers (ADR-0005). */
export async function models({ key, signal }) {
  const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: { "x-api-key": key, "anthropic-version": VERSION },
    signal,
  });
  if (!res.ok) throw new Error(`${name} ${res.status}: could not list models`);
  const data = await res.json();
  return (data.data ?? [])
    .map((m) => ({ id: String(m.id), label: m.display_name }))
    .filter((m) => SAFE_ID.test(m.id));
}
