/**
 * Gemini adapter. All Gemini-specific knowledge lives here and nowhere else.
 *
 * Per ADR-0001 the server never sees a provider-specific field: it hands over the
 * neutral message shape and receives text back. Streaming is optional per ADR-0004.
 */

import { safeModelId, SAFE_ID } from "./model-id.js";

export const name = "gemini";
export const label = "Gemini";   // what a person calls it, so no product name lives outside providers/
// An alias, not a pinned version. "gemini-2.5-flash" was this default until Google
// retired it for new keys, and a pinned id is exactly the thing that goes stale.
export const defaultModel = "gemini-flash-latest";
export const keyVar = "GEMINI_API_KEY";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// Server-Sent Events framing: records are separated by a blank line, lines within a
// record by a newline. Either may carry a carriage return depending on the server.
const SEP_RECORD = /\r?\n\r?\n/;
const SEP_LINE = /\r?\n/;

/** Parts, in the order they should be read: what was attached, then what was asked. */
const partsOf = (m) => [
  ...(m.images ?? []).map((image) => ({
    inlineData: { mimeType: image.mime, data: image.data },
  })),
  { text: m.text },
];

const body = (messages) => JSON.stringify({
  contents: messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: partsOf(m),
  })),
});

// The key travels in a header, not the query string. As a query parameter it would ride
// along in any echoed URL, and errors are written into transcripts, which get
// committed. See standards/code.md, Secrets.
const headers = (key) => ({ "content-type": "application/json", "x-goog-api-key": key });

/**
 * @param {{model: string, messages: {role: "user"|"assistant", text: string}[],
 *          key: string, signal?: AbortSignal}} req
 * @returns {Promise<string>} reply text
 */
export async function complete({ model, messages, key, signal }) {
  const res = await fetch(`${ENDPOINT}/${safeModelId(model)}:generateContent`, {
    method: "POST",
    headers: headers(key),
    body: body(messages),
    signal,
  });

  if (!res.ok) {
    throw new Error(`${name} ${res.status}: ${summarise(await res.text().catch(() => ""))}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (!text) {
    throw new Error(`${name}: ${data?.candidates?.[0]?.finishReason ?? "no content in response"}`);
  }
  return text;
}

/**
 * Streaming variant (ADR-0004). Optional by contract. The server's fallback is what
 * keeps a provider without one behaving identically from the client's side.
 *
 * Parsed by hand rather than with a library, per ADR-0002. It is one framing rule:
 * lines beginning "data:", records separated by a blank line.
 */
export async function* stream({ model, messages, key, signal }) {
  const res = await fetch(`${ENDPOINT}/${safeModelId(model)}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: headers(key),
    body: body(messages),
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

    // Anything after the last blank line is a partial record and stays buffered until
    // the rest of it arrives.
    const records = buffered.split(SEP_RECORD);
    buffered = records.pop() ?? "";

    for (const record of records) {
      for (const line of record.split(SEP_LINE)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload);
          const text = chunk?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
          if (text) yield text;
        } catch {
          // A record that will not parse is a framing hiccup, not a reason to abandon a
          // reply that is otherwise arriving. Skip it and keep reading.
        }
      }
    }
  }
}

/** Provider errors arrive as large JSON. Keep the part a person can act on. */
function summarise(raw) {
  try {
    return JSON.parse(raw)?.error?.message ?? raw.slice(0, 200);
  } catch {
    return raw.slice(0, 200); // not JSON; the raw prefix is the best available detail
  }
}

/**
 * What this provider offers (ADR-0005). Filtered to models that can actually answer:
 * the list includes embedding and vision-only models that would fail on use.
 */
export async function models({ key, signal }) {
  const res = await fetch(`${ENDPOINT}?pageSize=200`, { headers: { "x-goog-api-key": key }, signal });
  if (!res.ok) throw new Error(`${name} ${res.status}: could not list models`);
  const data = await res.json();
  return (data.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => ({ id: String(m.name).split("/").pop(), label: m.displayName }))
    .filter((m) => SAFE_ID.test(m.id));
}
