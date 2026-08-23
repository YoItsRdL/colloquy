# ADR-0009: One provider, and a plain error when it fails

**Status:** Accepted
**Date:** 2026-08-19
**Supersedes:** the gateway's ADR-0006 (a free fallback chain) and ADR-0007 (offering a paid
provider), both carried into this plugin and referenced throughout it until now.

## Context

A turn used to walk a chain. If the chosen provider refused, the refusal was classified into
a taxonomy (`unavailable`, `exhausted`, `unfunded`, `fatal`) a register recorded which
model was cooling off and until when, the turn moved to the next free model, and if the
whole free chain was spent it offered to continue somewhere that charged. The chips then
marked themselves to show that what answered was not what had been asked for.

All of that was written in a week when every hosted provider was out of credit and running a
model locally was not yet an option. It was a sensible answer to "everything I can afford
has stopped working".

That week is over. There is a local model, it costs nothing, and it is the default. The
chain now answers a question nobody has, and it charges for the privilege:

- **It is confusing.** The most common report was not knowing which model had actually
  replied. The chips had a marked state and a tooltip explaining that a choice had survived
  a substitution. An interface for a situation that should not arise.
- **It is a lot of machinery.** A module of verdicts and registers, a chain parser, a
  settings screen to configure the chain, an escalation offer rendered into the thread, a
  retry path through the view, and the tests for all of it.
- **It decides something that is not its to decide.** Which model answers a question is the
  point of the chips. Substituting one silently, however well-signposted, overrides the one
  choice the interface exists to give.

## Decision

**A turn runs against the provider and model the chips name. If it fails, it says so.**

**The provider's own words reach the person.** Whatever the provider said about why it
refused is what appears, and what is written to the conversation file. It knows what went
wrong and this code does not.

**One exception, and it is not a diagnosis.** A browser reporting "Failed to fetch" has said
nothing usable. That is what it returns for no connection, a blocked origin, or a refusal
too hard to read. It is widened into a sentence naming those possibilities and explicitly
not choosing between them, because which one happened is not knowable from here.

**A partial answer survives.** Whatever arrived before a stream broke is still what the
model said, and it is usually the most useful thing on the screen when something has gone
wrong.

**Nothing is offered, retried, or substituted.** Changing provider is what the chips are
for. If a provider is out of credit, the person picks another one, which is one click, and
is a decision about their money.

## Consequences

**Good.** What answered is always what was asked. The chips can no longer disagree with the
transcript, so the marked state, the tooltip, and the whole idea of an answer arriving from
somewhere unchosen all go.

**Good.** Roughly four hundred lines leave: the fallback module, the chain parser, the chain
settings screen, the escalation path through the view and the thread, and their tests.

**Bad.** A conversation now stops when the provider does. Where the chain would have carried
on for free, the person retypes nothing but does have to change a chip and ask again.

**Bad.** The rate-limit handling goes with it. A provider saying "retry in 20s" used to be
waited out. Now that message reaches the person, who waits or switches. That is more honest
and less convenient.

## Alternatives rejected

**Keeping the chain but hiding it.** The confusion was caused by substitution, not by being
told about it. Hiding it makes the interface calmer and the behaviour worse.

**Keeping automatic retry for rate limits only.** The smallest defensible piece of the
machinery, and still a special case with a timer, a register and a state to explain. A
provider that says "retry in 20s" has already said the useful thing.
