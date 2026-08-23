# Colloquy

**Build a knowledge base out of your AI conversations.**

Each one is saved to your vault as markdown, then summarised so the next starts with the
context. Supports Ollama, OpenAI, Anthropic, Google and DeepSeek.

The conversations are written as they happen — searchable, linkable, and still readable if
this plugin goes away. A few minutes after each one, the plugin reads it back and keeps a
short account of what you were doing, and that account is what later conversations are
given as background. It reads what it wrote; it does not read the rest of your vault.

## Two things it does that you should know before installing

**It writes to your vault on its own.** A few minutes after a conversation goes quiet, the
plugin reads it and files a short account of what you were doing — not what the model
claimed, what *you* were doing — in a folder you choose. That is the feature, and it is the
most surprising thing here, so it is at the top rather than under Advanced. It can be turned
off.

**It sends earlier conversations with your question.** Whatever it noticed about your last
few conversations rides in front of the next one, so the model has context. It goes to
whichever provider you have selected, **including a paid one**. This can be turned off too,
and the setting says plainly where the text goes.

The automatic reading only ever runs on a local model. Reading every conversation through a
metered API is a bill that grows while you sleep, so it was designed out rather than
warned about.

## What it looks like in your vault

```
Conversations/2026/08/19/is-it-better-by-train.md      the conversation, as markdown
Conversations/context/2026/08/19-is-it-better…md       what it noticed about you
```

Both folders are settings. The defaults are plain names; if your vault has its own scheme,
put your own paths in and the plugin will use them. Nothing else is ever written anywhere.

## Getting started

**With a local model** — nothing leaves your machine and nothing costs anything.

1. Install [Ollama](https://ollama.com) and start it.
2. Settings → Colloquy → download a model. `gemma3:4b` is a good first one: it reads an
   image, and it summarises a conversation in about two seconds.
3. Open the panel from the ribbon and ask something.

**With an API key** — better answers, and you pay per question.

1. Settings → Colloquy → paste a key for OpenAI, Anthropic, Google or DeepSeek.
2. Pick the provider and model in the chips under the composer.

Keys are stored in the plugin's own data file, which is never rendered back to the screen
and never leaves your machine except as the request you asked for.

## Using it

- **Ask** — type, press Enter. The answer streams in and the file is written as it goes.
- **Stop** — Send becomes Stop while an answer arrives. What arrived is kept.
- **Attach** — the paperclip takes a note or an image, from your vault or from your
  computer. A file from your computer is copied into your vault first, so the conversation
  links to something that is actually there.
- **Pick up where you left off** — the history button lists past conversations. They are
  rebuilt from the file, so one you edited by hand resumes just the same.

## What it will not do

- **PDFs are refused.** They need extracting rather than encoding, and sending bytes a model
  will silently ignore is worse than saying no.
- **Resuming does not re-send attachments.** The links stay in the transcript; the model
  picking it up sees the words, not the picture.
- **A small local model gets things wrong.** The accounts it writes are one model's reading
  of a conversation. They live in a log, are marked `author: agent`, and are handed back as
  a hint that says it may be wrong — never as fact.
- **Mobile is untested.** Nothing here uses Node, Electron or the filesystem, so it should
  run — but "should" is not "does", and nobody has put it on a phone yet. A local model at
  `localhost` certainly will not be there; on mobile it would need an API key. If you try
  it, an issue saying what happened would be genuinely useful.

## Why it works the way it does

[`decisions/`](decisions/) holds the reasoning, one file per decision, including the ones
that were reversed. ADR-0007 explains why an earlier version that extracted "durable notes"
was removed entirely: it kept producing confident, false claims.

## What changed when

[`CHANGELOG.md`](CHANGELOG.md), one entry per release.

## Building it

```
npm install
npm test
node build.mjs --vault "/path/to/a/test/vault"
```

No runtime dependencies. One build dependency, esbuild, and the build script is short enough
to read in full.

## Support

Colloquy is free and stays free. If it has been useful,
[a coffee](https://buymeacoffee.com/ibonescalap) is a kind way to say so.

## Licence

MIT.
