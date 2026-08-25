/**
 * Reading a page that was linked to (ADR-0014).
 *
 * No model can fetch anything. When one says it looked something up, something around it
 * did the looking, and here that is this: a link in the question is read before the
 * question is sent, and travels with it as an attachment like a note would.
 *
 * Through Obsidian's own `requestUrl` rather than `fetch`, which a plugin cannot use for
 * another origin: the browser refuses it, and refuses it as a network error indistinguish-
 * able from the site being down.
 */
import { requestUrl } from "obsidian";

/**
 * Enough of a page to answer a question about it, and no more. A long article sent whole
 * crowds out everything else in the request and, on a metered provider, is a real bill for
 * text nobody chose to send.
 */
const MAX_CHARS = 4000;

/** Trailing punctuation belongs to the sentence, not to the address inside it. */
const LINK = /https?:\/\/[^\s<>"'`]+/g;

export const urlsIn = (text) =>
  [...String(text ?? "").matchAll(LINK)].map((match) => match[0].replace(/[.,;:!?)\]}]+$/, ""));

const decode = (text) => String(text ?? "")
  .replace(/&(#39|apos|lsquo|rsquo);/g, "'")
  .replace(/&(quot|ldquo|rdquo);/g, '"')
  .replace(/&nbsp;/g, " ")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  // Last, or an escaped ampersand becomes the start of the next entity.
  .replace(/&amp;/g, "&");

/**
 * A named piece of metadata, whichever way round the attributes were written.
 *
 * The og: tags are what makes a video or a paywalled article worth reading at all: the
 * page body is a script bundle, and the title and description are the only prose in it.
 */
function meta(html, name) {
  const attrs = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, "i"),
  ];
  for (const attr of attrs) {
    const found = html.match(attr);
    if (found) return decode(found[1]).trim();
  }
  return "";
}

/** Whatever prose survives having the markup taken off it. */
const prose = (html) => decode(
  html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " "),
).replace(/\s+/g, " ").trim();

/** What a page says, as far as it can be read without running it. */
export function readable(html, url) {
  const title = meta(html, "og:title") || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const description = meta(html, "og:description") || meta(html, "description");
  const body = prose(html);

  const parts = [title, url, "", description, "", body].filter((part) => part !== undefined);
  const text = parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return {
    title: title || new URL(url).hostname,
    // The description is repeated inside the body of most pages. Cutting the body rather
    // than the whole thing keeps the part that is only in the metadata.
    text: text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n(the rest of the page was not sent)` : text,
  };
}

/**
 * @returns an attachment, shaped like any other so the rest of the plugin needs to know
 *   nothing about where it came from. `path` is the address, which is what makes the
 *   transcript able to link back to it and what stops the same link being held twice.
 */
export async function pageAt(url) {
  const response = await requestUrl({
    url,
    throw: false,
    headers: { accept: "text/html,*/*" },
  });

  if (response.status >= 400) throw new Error(`the site answered ${response.status}`);

  const type = response.headers?.["content-type"] ?? response.headers?.["Content-Type"] ?? "";
  if (type && !/text\/|json|xml/i.test(type)) throw new Error(`it is ${type.split(";")[0]}, which is not text`);

  const { title, text } = readable(response.text ?? "", url);
  if (!text) throw new Error("there was no text in it");

  return { kind: "text", name: title, path: url, text };
}
