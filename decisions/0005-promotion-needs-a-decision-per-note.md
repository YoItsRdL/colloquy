# ADR-0005: The plugin may write notes, one human decision at a time

**Status:** Superseded by [ADR-0007](0007-context-about-us-not-claims-about-the-world.md)
**Date:** 2026-08-19
**Amends:** [ADR-0001](0001-a-plugin-not-a-server.md) and the scope in `AGENTS.md`, which
put "anything writing to `10-notes/`" and "retrieval or search over the vault" out of
scope entirely.

## Context

Capture works. Conversations land in `00-inbox/` and stay there, and every one of them
carries a line pointing at a promotion step run by hand elsewhere. That step exists and is
good, it searches
before it writes, defaults to merging rather than creating, and treats an unprocessed
inbox as an acceptable outcome. But it lives in a terminal, so the trail goes cold at the
point the conversation was captured. The judgment about what it was worth happens
somewhere else, later, if at all.

The reason the original scope forbade this was sound: promotion is a judgment step, and
an agent that writes durable notes unattended fills a knowledge base with plausible,
duplicated, and confidently wrong material. That risk has not gone away.

What has changed is where the judgment can live. It does not have to be in a terminal.

## Decision

**The plugin may create and edit notes in `10-notes/`, and only ever as the direct result
of a person deciding about that specific note.**

Five constraints, each of which is the decision rather than a detail:

**One at a time. No bulk accept, ever.** The moment a screen can approve twelve notes at
once, the approval is theatre. The vault's own finding is blunt about this: *"polite
instructions lose to task-completion momentum every time, so I stopped writing
instructions and started writing gates."* One card at a time is the gate.

**Search before create, shown but never blocking.** Every proposal is accompanied by what
already exists on the subject. A similarity gate was considered and rejected: it blocks
precisely the notes such a system exists to produce, so this informs the person and never
vetoes them. What was found is recorded in `related:` whether or not a new note
was created, because that is the evidence the search happened.

**Merging is a first-class outcome, not a fallback.** The rule being followed is to default to
editing an existing note, and duplication is the failure this system is least able to
detect afterwards. Merge is offered with equal weight to create.

**Leaving it alone is a legitimate ending.** An unprocessed inbox is fine. Nothing counts
how many notes were produced, and nothing empties a queue for the sake of emptying it.

**The model that processes is the one chosen in the chips.** It is the person's choice,
it costs whatever that provider costs, and locally it costs nothing. Nothing reaches for
a different provider to do this.

**The source is not touched at all.** Reading a conversation does not change what it is
worth, so promotion neither moves nor deletes it. Conversations are already filed by the
day they happened; archiving them on the way out would buy nothing but a second place to
look, and it would answer a question (is this still worth having?) that this screen has
no business answering. A conversation stays in `00-inbox/` until the person moves it or
deletes it themselves.

## Consequences

**Good.** The judgment happens where the material is, in the app, seconds after reading
it, rather than in a terminal, later, if at all.

**Good.** Search-before-create becomes something the person sees rather than something an
agent claims to have done.

**Bad.** This duplicates part of what that manual step already does, and the two can drift. The
mitigation is that they share the same rules by being written from the same notes, not by
sharing code, and the manual step remains the more capable of the two, because it can read and
merge across the whole vault without asking permission for each step.

**Bad.** The scope rule that made this plugin easy to reason about is now qualified. "It
never writes notes" was a sentence anyone could hold; "it writes notes only on a per-note
human decision" is a rule with an exception, and exceptions erode.

**Accepted risk.** A person clicking Keep on twelve cards in a row has approved twelve
notes as surely as a bulk button would have, only more slowly. The design makes the wrong
thing tedious rather than impossible, which is the most that an interface can do.

## Alternatives rejected

**Triage in the plugin, promotion by hand elsewhere.** Recommended first, and rejected by the
person whose vault it is: the point of the plugin is that the work happens where they are,
and sending the important half to a terminal defeats it.

**Auto-promotion with a review afterwards.** Review-after-write is not review. The notes
are already in the vault and already being retrieved.

**A similarity gate that blocks near-duplicates.** Rejected on three counts, the decisive one
being that it blocks precisely the atomic notes such a system exists to produce: two notes
about the same subject, saying different things, look identical to a similarity check.
