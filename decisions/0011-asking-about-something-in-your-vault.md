# ADR-0011 — Attachments come from the vault, or from anywhere and into it

**Status:** Accepted
**Date:** 2026-08-19

## Context

Every assistant worth using can be handed a file. This one could not, which in a plugin
for Obsidian is a strange gap: the vault is already full of the notes and screenshots
somebody would want to ask about, and the panel sat beside them unable to see any of them.

## Decision

**The vault first, and your computer too.** The paperclip offers both. The vault is first
because it is usually the answer — this is a plugin for an app already full of your notes
and screenshots — and the fuzzy suggester finds anything in it in one search.

**A file from your computer is copied into the vault on the way in**, at the path Obsidian
itself would choose (`getAvailablePathForAttachment`, which honours the configured
attachment folder and makes the name collision-safe). From that moment it behaves like
anything else here: the transcript links to it, the file explorer shows it, a sync carries
it. Sending it without saving it would leave the conversation referring to something on a
disk somewhere that nothing else in the vault can reach.

**Two kinds, because they are two problems.** A note is text, so it folds into the question
and every provider reads it without knowing anything happened. An image has to reach the
wire, and each API wants a different shape — so each adapter renders it in its own, and a
provider with no vision support simply never receives one.

**A note is named and fenced.** `--- staleness.md ---` … `--- end ---`, with the question
after it. Pasted in bare, two notes become one run-on document with no indication of where
either began. When a note is longer than can be sent, the text says so where it was cut,
because a note that stops mid-sentence otherwise reads as a note that ends there.

**Refusals name the file and the reason.** "screenshot.png is 12MB — images have to be
under 4MB", not a validation code. And they happen when the file is chosen rather than when
Send is pressed, so the problem arrives while the paperclip is still the thing you were
thinking about.

**The transcript records links, not copies.** `![[diagram.png]]` and `[[staleness.md]]` —
the file is already in the vault, Obsidian renders the embed, and nothing is duplicated.

**Attachments belong to the question, not the conversation.** They are cleared the moment
one is sent, and cleared again when a new conversation is started. Left in place, the next
question would carry them silently and be charged for them.

## Consequences

**Good.** "What does this diagram show" and "summarise this note" both work, verified
against `gemma3:4b` locally. The first attempt at that verification was worthless: the file
was called `red-square.png`, so a correct answer proved nothing. Repeated with a violet
square named `a1b2c3.png` it answered "Purple", and the sent payload was inspected to
confirm the filename never leaves the transcript — only the question and the pixels reach
the model.

**Good.** The `images` field on a turn is additive. A turn without one still sends `content`
as a bare string, which is what every one of these APIs accepted before images existed —
wrapping every ordinary request in an array to serve the few that carry a picture would
have changed every request in the plugin.

**Bad.** Resuming a conversation does not re-send its attachments. The transcript keeps the
links, so the record is intact, but the model picking it up sees the words and not the
picture. Re-reading and re-encoding every image in a long conversation on every resume is a
cost nobody asked for; a question that depends on the image can attach it again.

**Bad.** PDFs are refused. They need extracting rather than encoding, which is a different
piece of work — and refusing them plainly is better than sending bytes a model will
silently ignore.

**Accepted risk.** A 4MB image is a large request, and on a metered provider it is a
noticeable one. The limit is stated in the refusal rather than hidden, and local models
cost nothing.

## Alternatives rejected

**Vault-only, with no route to the filesystem.** Written into the first draft of this ADR on
the grounds that what you want is usually already in the vault. Usually is not always, and
refusing the photo on somebody's desktop for no better reason than where it happens to sit
is not a principle. Overruled by the person whose vault it is. The objection it was based on
— a file sent from disk leaving a dangling reference — is answered by copying it in rather
than by refusing it.

**Copying attachments into the conversation folder.** Would make the transcript
self-contained at the cost of duplicating every image somebody asks about, in a vault whose
whole point is that things live in one place and are linked to.

**Sending images again on resume.** Correct in principle and expensive in practice: every
image in the conversation, re-read and re-encoded, on every resume.
