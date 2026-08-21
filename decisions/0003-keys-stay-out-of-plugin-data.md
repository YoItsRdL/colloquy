# ADR-0003 — Keys stay in the vault's .env, never in plugin data

**Status:** Superseded by [ADR-0004](0004-keys-live-in-plugin-data.md)
— the hazard named here is real, but the conclusion was wrong: it made key entry
impossible on mobile, which is the platform ADR-0001 chose a plugin to reach. Kept rather
than deleted, because reasoning that turned out wrong is worth being able to read.
**Date:** 2026-08-18
**Carries forward:** the gateway's
ADR-0003 of the gateway unchanged in
substance, and retires its
ADR-0008 of the gateway, whose
settings screen existed because a server could not read a file nobody had handed it.

## Context

The obvious place for a plugin's API keys is plugin data — `.obsidian/plugins/<id>/data.json`,
which Obsidian manages and most plugins use.

In this vault that is a trap. `.obsidian/` is **tracked in git**: only `workspace*` and
`cache` are ignored, and four files are already committed. A key written to plugin data
would be committed and pushed to GitHub on the next commit, through a mechanism nobody
would think to check, in a directory nobody reads diffs for.

The streaming spike tested the alternative, and it works: `app.vault.adapter.read()`
reaches `_system/gateway/.env` — a dotfile, inside a directory Obsidian hides from its
own file explorer — and returned the key on the first attempt.

## Decision

**Keys are read from the vault's existing `.env`, and this plugin never writes one.**

That file is already gitignored, already the single place secrets live, and already what
every other part of this repository reads. One store, one rule, one thing to get wrong.

**No field ever offers to save a key** — not in settings, not in a modal. A field that
writes a secret into a tracked directory is worse than no field, because it looks like
the supported path.

**Plugin data holds preferences only** — the chosen provider and model — and nothing that
would matter if it were published.

## Consequences

**Good.** No secret can reach the repository through any mechanism this plugin controls.

**Good.** The keys already configured for the gateway work with no migration.

**Bad.** Setting a key means editing a file, which is worse than a settings field. That
is the cost of the file not being tracked, and it is paid once per provider.

**Bad.** The path `_system/gateway/.env` names a component being superseded. Renaming it
is recorded rather than done, because moving a secrets file and changing its readers in
the same step is how a working setup breaks quietly.

**Accepted risk.** If someone later un-ignores `.env`, this protection is gone. The
vault's audit already fails when `.env` is tracked, which is the check that catches it.

## Alternatives rejected

**Plugin data with a warning in the description.** Relies on someone reading a
description at the exact moment they are pasting a credential.

**Plugin data, plus a gitignore rule for it.** Would work, and adds a second secrets
store with a second ignore rule to keep correct forever. The existing one is already
correct.

**The OS keychain.** Unavailable on mobile, and reaching one from a plugin needs Electron
APIs mobile does not have — which standard 7 forbids.
