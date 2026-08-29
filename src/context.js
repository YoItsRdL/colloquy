/**
 * Where what we learned about ourselves is kept (ADR-0007).
 *
 * A record of what happened rather than durable knowledge, so it is filed apart from
 * wherever a vault keeps its notes.
 *
 * One record per conversation, rewritten when the conversation grows, two half-accounts
 * of one thing are worse than one whole one.
 *
 * Filed by day, in the same shape as the conversations they describe. This used to shard by
 * month and put the day in the filename, which is the arrangement paths.js already rejects
 * for conversations: a prefix spends the first characters of every name saying what the
 * folder says.
 */
import { folderFor } from "./paths.js";
import { markdownUnder } from "./under.js";

const pad = (n) => String(n).padStart(2, "0");

export const stampOf = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * Makes a folder and everything above it.
 *
 * A folder that already exists is the normal case, not a problem. Two writes racing on the
 * same day would otherwise fail the second one for arriving second.
 */
export async function ensureFolder(app, folder) {
  const parts = folder.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const path = parts.slice(0, i).join("/");
    if (app.vault.getAbstractFileByPath(path)) continue;
    try { await app.vault.createFolder(path); } catch { /* raced, which is harmless */ }
  }
}

/**
 * Named for the conversation and filed under the conversation's own day, so the record and
 * its source are a pair in both name and place.
 *
 * The day of the conversation rather than the day it was read, which are the same thing
 * only the first time. Reading an August conversation again in December has to land on the
 * record it already wrote, or the promise below (that a record is replaced rather than
 * added to) quietly becomes two records saying different things about one conversation.
 *
 * A conversation that is not under a date at all, because somebody chose their own scheme
 * for the folder, falls back to the day it was read. It is still one path per conversation.
 */
export function recordPath(source, date, root) {
  const name = source.replace(/\.md$/, "").split("/").pop();
  const day = source.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
  const folder = day ? `${root}/${day[1]}/${day[2]}/${day[3]}` : folderFor(date, root);
  return `${folder}/${name}.md`;
}

export const LATELY = "## Lately";
export const ABOUT = "## About us";

/**
 * The two halves of a record, whichever of them it has.
 *
 * A record written before the split has neither heading. Its whole body counts as lately,
 * which is the safe reading: it was one paragraph mixing both, and treating a mixture as
 * durable would carry the disposable half forward for years.
 */
export function partsOf(text) {
  const body = String(text ?? "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
  if (!body.includes(ABOUT) && !body.includes(LATELY)) return { lately: body, about: "" };

  const section = (heading) => {
    const at = body.indexOf(heading);
    if (at === -1) return "";
    const rest = body.slice(at + heading.length);
    const next = rest.search(/\n## /);
    return (next === -1 ? rest : rest.slice(0, next)).trim();
  };
  return { lately: section(LATELY), about: section(ABOUT) };
}

/**
 * Writes what this conversation said about us.
 *
 * Two headings rather than one paragraph, because the halves have different lifespans:
 * what we were doing on a Tuesday is worth a week, and what we work under is worth years.
 * Kept apart here so that reading them back can spend its budget on the half that lasts.
 *
 * Overwrites rather than appends. The account describes the whole conversation, so when a
 * conversation is picked up again and read a second time, the new account replaces the old
 * one instead of sitting beside a version of itself that stops halfway.
 */
export async function writeContext(app, { context, source, root }, now = new Date()) {
  const lately = String(context?.lately ?? "").trim();
  const about = String(context?.about ?? "").trim();
  if (!lately && !about) return null;

  const path = recordPath(source, now, root);
  await ensureFolder(app, path.slice(0, path.lastIndexOf("/")));

  const name = source.replace(/\.md$/, "").split("/").pop();
  const text = [
    "---",
    "type: context",
    `created: ${stampOf(now)}`,
    // The vault's rule: nothing this plugin writes is ever claimed as the person's own.
    "author: agent",
    `source: "[[${name}]]"`,
    "---",
    "",
    ...(lately ? [LATELY, "", lately, ""] : []),
    ...(about ? [ABOUT, "", about, ""] : []),
  ].join("\n");

  const existing = app.vault.getAbstractFileByPath(path);
  // `process` rather than `modify`: this runs in the background, minutes after anybody
  // last touched anything, and it is the call that cannot lose a concurrent edit to the
  // same file. Read-then-write with `modify` can, and the whole point of this rewrite is
  // that it replaces an account rather than racing one.
  if (existing) await app.vault.process(existing, () => text);
  else await app.vault.create(path, text);

  return path;
}

/**
 * What has been noticed about us, most recent first.
 *
 * This is the half that makes it memory rather than a diary. A record nothing ever reads
 * back is just a log with ambitions.
 */
export function recentContext(app, root, limit = 12) {
  return markdownUnder(app, root)
    .sort((a, b) => (b.stat?.mtime ?? 0) - (a.stat?.mtime ?? 0))
    .slice(0, limit);
}
