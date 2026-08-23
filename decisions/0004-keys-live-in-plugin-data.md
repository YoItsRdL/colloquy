# ADR-0004: Keys live in Obsidian's plugin data, and that file is gitignored

**Status:** Accepted
**Date:** 2026-08-18
**Supersedes:** [ADR-0003](0003-keys-stay-out-of-plugin-data.md), which reached the right
conclusion from the wrong premise.

## Context

ADR-0003 forbade plugin data because `.obsidian/` is tracked in this repository, and
routed key reading to the gateway's `.env` instead. The hazard it named is real. The
conclusion was wrong on two counts.

**It is not native.** Setting a key meant opening a hidden dotfile in a text editor, and
the settings screen could only report the result. The reasoning offered for that, that
the gateway's own settings screen "existed because a server could not read a file", was
simply incorrect. That screen existed because editing a dotfile by hand is hostile, which
is just as true inside Obsidian.

**It is impossible on a phone.** There is no way to edit a dotfile beside a server from
Obsidian mobile. So keys could only ever be configured on one machine, which gives up
the single largest reason ADR-0001 chose a plugin.

And the premise was avoidable. `.obsidian/` being tracked is a fact about one ignore rule,
not a law. A rule plus a check is a smaller thing than a permanently worse configuration
path.

## Decision

**Keys are stored in plugin data**, through Obsidian's own `saveData`, the native
location, reachable on every platform.

**That file is gitignored, and the gate fails if it is ever tracked.** The protection is a
check that runs on every ticket, not a habit or a comment. `.obsidian/plugins/colloquy/
data.json` is the only path involved.

**A stored key is never rendered back**, not masked, not prefixed. The field is empty and
the state beside it says whether one exists. Showing part of a secret to prove it is
stored puts a secret on a screen, and a prefix is enough to identify an account.

**Existing keys are carried over once** from the gateway's `.env`, filling only what is
missing. Nothing reads that file afterwards. An existing setup keeps working without
anyone re-entering four keys, and the fallback chain comes with them. It is configuration,
and losing it on migration would silently re-enable the failure it prevents.

**The fallback chain becomes a setting too**, for the same reason: it was in `.env`, and
leaving it there would mean one native control and one hidden one.

## Consequences

**Good.** Keys can be set on any device, in the app, where every other setting is.

**Good.** No dependency on a component being retired. The gateway can be deleted without
touching how keys work.

**Good.** With Obsidian Sync, keys travel to the phone encrypted, rather than needing to
be entered twice.

**Bad.** The store sits in a tracked directory, so correctness depends on an ignore rule.
Mitigated by the gate check, which is why that check exists.

**Bad.** Plugin data is plaintext on disk. So was `.env`. Anything running as this user can
read either, and a keychain is unavailable on mobile, which standard 7 rules out.

**Accepted risk.** Someone could commit the store with `git add -f`. Nothing prevents
deliberate action; the gate catches the accident, which is the realistic case.

## Alternatives rejected

**Keep reading `.env`, and write to it from the settings screen.** Considered seriously,
and it nearly shipped. One store, already ignored, already what everything read. Rejected
because it keeps the plugin tied to a path named after a superseded component, and puts
this plugin in the business of editing a file the vault's other machinery also owns.

**Keys in `.env`, entry by hand.** The status quo of ADR-0003. Rejected for being
impossible on the platform this architecture was chosen to reach.

**Encrypt the store with a passphrase.** Real protection, and it means typing a passphrase
to ask a question. The threat it defends against, someone with filesystem access as this
user, can also read the vault, which is the thing actually worth protecting.
