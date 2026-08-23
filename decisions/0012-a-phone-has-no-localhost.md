# ADR-0012 — A phone has no localhost

**Status:** Accepted
**Date:** 2026-08-23
**Amends:** ADR-0002 (the local provider's default address), ADR-0006 (what runs unasked)

## Context

`manifest.json` has said `isDesktopOnly: false` since 1.0.0, and the README has said mobile
was untested. It has now been tested, and the honest answer was that the plugin loads on a
phone and then fails in a way that reads as broken rather than unconfigured.

The cause is one line. `keysOf()` fills in an adapter's `defaultKey` when nothing is
stored, which is what makes Ollama work on a desktop without anyone typing an address. On
a phone that default is `http://localhost:11434/v1`, where nothing is listening and nothing
ever will be. The consequences all followed from treating it as configured:

- The provider chip named Ollama, because a configured provider outranks an unconfigured
  one, so the panel looked ready.
- Every question failed with *"Ollama is not answering at http://localhost:11434/v1. It is
  usually not running: start it and try again."* — accurate, actionable on a desktop, and
  impossible to act on from a phone.
- The settings screen offered a model library for a server that cannot exist, and reported
  it as unreachable rather than inapplicable.

None of that is a mobile bug in the interface. It is a desktop assumption stated as a
default.

## Decision

**`keysOf()` does not apply a `defaultKey` on mobile.** An address stored by hand is used
exactly as before.

The result on a phone with nothing configured is that no provider is configured, which is
true, and the first question fails with *"No key for … Add one in Settings → Colloquy"* —
which names the screen it is fixed on.

## Alternatives considered

**Leave it and reword the message for mobile.** Cheaper, and wrong in the same way:
the chip would still name a provider that cannot answer, and the settings screen would
still offer to manage models for a server that cannot run. The message was a symptom.

**Make the local provider desktop-only outright.** Overreaches. Ollama on a desktop reached
over the network is a real setup and the one worth protecting — a phone on the same wifi
pointed at `192.168.1.4:11434` works, and always did. Only the localhost assumption is
wrong, so only the assumption is removed.

**Flip `isDesktopOnly` to true.** Would have been honest about the state before this, but it
gives up the thing that makes the vault worth syncing to a phone. The plugin uses no Node,
no Electron and no filesystem; nothing about it needs a desktop except this default.

## Consequences

Automatic reading still never runs on a phone, and now for a stated reason rather than an
accident: it only ever runs on a provider that charges nothing per request (ADR-0006), which
means a local one, which on a phone means one reached over the network. Somebody who
configures that will get it; nobody else will, and nobody's phone quietly bills them.

A phone therefore needs an API key to be useful out of the box, and the README says so
rather than implying the local route is available everywhere.
