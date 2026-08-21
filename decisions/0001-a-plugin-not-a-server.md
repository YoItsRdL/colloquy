# ADR-0001 — A plugin, not a server

**Status:** Accepted
**Date:** 2026-08-18

> The gateway's own ADRs are referenced below by number and are no longer linkable: that
> directory was deleted in TKT-0301. They are in git history, at the last commit that
> contained `_system/gateway/decisions/`.
**Supersedes:** the gateway's architecture entirely. Its
ADR-0001 of the gateway (provider seam),
ADR-0004 of the gateway
(streaming), ADR-0005 of the gateway
(model listing), ADR-0006 of the gateway
(fallback) and ADR-0007 of the gateway
(consent) are carried forward on their own merits. Its TKT-0501 (LAN auth), TKT-0502
(request limits) and the unmerged Google sign-in are retired.

## Context

The gateway was a local web server with a browser interface. It worked. The problem was
what it kept needing.

Binding to a port creates a boundary that must then be defended. That produced a shared
token for LAN access, then rate limiting, then — when the token stopped feeling adequate
for something holding four API keys and the whole vault — an attempt at Google sign-in.
That attempt is where the architecture showed itself: Google refuses to redirect to a
raw IP over plain HTTP, so the phone case could never be secured that way, and on
localhost the sign-in would have guarded a door into a room the person was already
standing in. Anything able to reach loopback can read the vault directly.

Roughly a third of the gateway's source existed to solve problems the gateway had
created. None of it made a single conversation better captured.

Two of the gateway's own split triggers had also fired: it needed a build step to go
further, and it stood at ~3,900 lines of source against a stated limit of 1,500.

## Decision

**The interface becomes an Obsidian plugin.**

There is no port, no origin, and no session, because there is no server. The plugin runs
inside an application the person has already trusted with the entire vault, under their
own account. The trust boundary is the operating system's, which was always the real one.

**What this deletes**, rather than ports: the HTTP server, static asset serving, the
asset allowlist, LAN tokens and enrolment, rate limiting, stream concurrency limits,
Google sign-in and the session store. Roughly 1,400 lines.

**What carries forward on its own merits**, because none of it was about being a server:
the provider seam and its four adapters, streaming as an optional capability, adapters
listing their own models, the learned fallback chain, and consent before spending.

**What is rewritten:** persistence moves from `node:fs` to Obsidian's vault API, so the
file explorer and any sync see writes as they happen. The interface becomes a view in
Obsidian's own DOM, using its theme variables rather than a private stylesheet.

**Mobile becomes a supported target.** This is the gain that no amount of work on the
gateway could have produced: Google would not authenticate a LAN address, so the phone
was permanently stuck behind a shared token on an untrusted network. A plugin travels
with the vault.

## Consequences

**Good.** Authentication ceases to be a problem rather than becoming a better-solved one.
The safest code is code that does not exist.

**Good.** Capture becomes ambient. The gateway had to be started, stayed running only as
long as a terminal did, and died silently. A plugin is present whenever Obsidian is.

**Good.** Writes go through the vault API, so Obsidian's own indexing, backlinks and sync
see a conversation the moment it lands. The gateway wrote behind Obsidian's back.

**Bad.** A build step, and with it one dev dependency (ADR-0002). The gateway's zero-
dependency property was real and is partly given up.

**Bad.** Obsidian becomes required for capture. The gateway worked with any editor, or
none. Accepted because the vault is an Obsidian vault and every conversation is a
markdown file that outlives both.

**Bad.** The interface is rebuilt. The chips, the consent dialog and the theme handling
were sound designs, but they were CSS against a private stylesheet, and Obsidian has its
own.

**Accepted risk.** Streaming on mobile is unproven — the WebView enforces CORS that
Electron does not. The fallback is a whole reply instead of a progressive one, which is a
degradation and not a failure: the note on disk is identical either way.

## Alternatives rejected

**Finish Google sign-in on localhost.** Complete and green on a branch. Rejected because
it protects a door into a room the person is already in, while doing nothing for the
phone — the case that actually needed it.

**Keep the gateway and add a plugin that talks to it.** Two components, one of which
still has a port and therefore still needs everything this decision deletes.

**Stay with the shared LAN token.** Honest and simple, and it was the status quo. It
leaves the phone on plain HTTP with a bearer secret, and leaves capture dependent on
remembering to start a server.
