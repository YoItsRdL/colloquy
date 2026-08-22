# Changelog

Dates are release dates. Reasoning that outlived a single release lives in
[`decisions/`](decisions/) instead.

## 1.0.1 — 2026-08-22

Two defects in the rename that follows the first answer, both found by installing the
released 1.0.0 into a real vault rather than testing a development build.

- **The automatic read never fired on its own.** A conversation is renamed once it has a
  title, and the three-minute idle clock was left pointing at the name the file had before.
  It fired on a path nothing lived at, returned without recording a reason, and the
  conversation waited for the next catch-up instead. Context notes were only ever written
  when Obsidian started — while the callout inside every conversation promised "a few
  minutes after this goes quiet".
- **A title matching the working name renamed the file anyway.** The filename comes from
  the question and the title from the answer, so the two agreeing is ordinary rather than
  rare. It produced `hello-2.md`.

Anyone who ran 1.0.0 kept everything: those conversations were read on the next launch,
just not when they went quiet.

## 1.0.0 — 2026-08-22

First public release.

- Chat in a side panel against Ollama, OpenAI, Anthropic, Google or DeepSeek.
- Every conversation written to the vault as markdown while it happens, named from its
  subject once there is one.
- A short first-person account of each conversation filed a few minutes after it goes
  quiet, and handed to later conversations as background. Local models only, so passive
  reading cannot run up a bill.
- Attachments from the vault or from disk: notes and images, three provider wire formats.
  PDFs are refused rather than silently ignored.
- Both folders configurable, because not every vault is organised like the one this was
  written in.
