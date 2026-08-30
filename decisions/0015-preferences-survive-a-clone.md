# ADR-0015: The settings that are not secret survive a clone

**Status:** Accepted
**Date:** 2026-08-30
**Amends:** [ADR-0004](0004-keys-live-in-plugin-data.md), which is right about keys and
silent about everything stored beside them.

## Context

ADR-0004 put keys in Obsidian's plugin data and gitignored that file, with a gate check so
the ignore rule is enforced rather than remembered. Its Consequences section names the
hazard it accepted: *"the store sits in a tracked directory, so correctness depends on an
ignore rule."*

What it did not consider is that `data.json` holds more than keys. The ignore rule does not
distinguish, so it discards the provider, the model, the folders and every toggle along
with the secret it was written to protect. Nobody noticed because the vault it was written
in never left the machine it was written on.

Then it did. A vault cloned to a second machine came back with the plugin's code, which is
tracked, and none of its configuration, which is not. Every symptom followed from that one
fact: the provider fell back to a default with no key and every question failed naming a
provider nobody had chosen, the model fell back to a constant naming something that was
never installed, and the folders fell back to defaults, so conversations were written to a
new tree at the vault root while sixteen existing records sat unread in the folder the
person had actually configured. The plugin reported that it knew nothing about them, which
was true and was not the answer.

None of this is a key problem. It is the cost of storing two kinds of thing in one file and
then making a decision about one of them.

## Decision

**The non-secret half is mirrored to `preferences.json`, beside the store.** It is tracked,
because nothing in it is a secret. `data.json` is unchanged: still the store, still holding
the keys, still gitignored, still checked by the gate.

**The store wins wherever it exists.** Load is defaults, then mirror, then store. The mirror
only ever answers the question "what was this vault set to" for a vault that has no store
yet, which is exactly the clone.

**What may be mirrored is an allowlist, named field by field.** Not "everything except
keys". The default for a setting nobody has thought about is to stay out of a tracked file,
because getting that backwards is how a secret is committed, and ADR-0004's whole argument
is that the safe thing should be what happens when nobody is paying attention. A test
fails if `keys` ever appears in it.

**Both files are written on every save**, so they cannot drift. The mirror is written
second and is allowed to fail silently: it is a copy, and losing a copy must not cost the
setting or interrupt somebody about a file they have never heard of.

## Consequences

**Good.** A clone, a second machine or a restored backup behaves the way the vault it came
from behaved. Only the keys need re-entering, which is the one thing that should never
have travelled.

**Good.** ADR-0004 is untouched. No migration: the first save creates the mirror.

**Bad.** Two files hold settings, so "where does this live" is now a question with two
answers. Mitigated by the allowlist being one line and the load order being three.

**Bad.** A setting added later is not mirrored until somebody adds it to the allowlist, and
nothing will complain. This is the direction the mistake should point: a setting that fails
to travel is an inconvenience, and one that travels when it should not is a leaked key.

**Accepted risk.** Somebody could put a secret in an allowlisted field, an API key typed
into the model box, say. Nothing prevents that, and nothing prevented it before either:
that key would have been in `data.json` on a machine where `.gitignore` is one line long.

## Alternatives rejected

**Invert it: preferences in the tracked `data.json`, keys in a new ignored file.** The
tempting one-line version, and worse. It makes the tracked file the one that could
accidentally contain a secret, which trades this plugin's best property for a shorter
diff.

**Say so loudly instead of fixing it.** Detect the missing store and tell the person to
reconfigure. Rejected as a fix and kept as an observation: two of the three losses now
correct themselves, because a provider without a key falls back to one that has a key and
a model that is not installed falls back to one that is. The folders are the only setting
whose loss still does damage, and telling somebody about damage is not the same as not
doing it.

**Keep it all in the vault, beside `_system/filing.json`.** The folders are a fact about
this vault rather than this device, so this is the tidiest home for them. Rejected for the
reason ADR-0004 gave for not writing to `.env`: it puts this plugin in the business of
editing a file the vault's other machinery also owns.
