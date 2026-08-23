# ADR-0007: Record what we were doing, not what the model believes

**Status:** Accepted
**Date:** 2026-08-19
**Supersedes:** [ADR-0005](0005-promotion-needs-a-decision-per-note.md) entirely.
**Amends:** [ADR-0006](0006-passive-extraction-into-an-unreviewed-layer.md), the sweep
stays, what it writes and where it goes both change.

## Context

ADR-0005 and ADR-0006 built a pipeline that read conversations automatically and proposed
durable claims for a person to approve into `10-notes/`. It worked, in the sense that every
part did what it said. What it produced was not worth having.

Two runs, verbatim:

> **Claude Opus 5 does not exist.** Anthropic does not have a model named 'Claude Opus 5';
> the latest model in their series is Claude 3.

> **Qwen3 vs. Claude 3 Comparison.** The conversation clearly outlines the key differences
> between Qwen3 and Claude 3, focusing on training data cutoff, language support…

The first is false. It was written *while we were talking to Claude Opus 5*. The second is
a description of a transcript, written from outside by something that was not there.

Both failures have the same root. We were asking a 4B local model for claims about the
world, which is the one thing it is least able to supply and we are least able to check.
Every gate we added (the topic filter, the self-reference filter, the review queue) was
another attempt to catch bad claims after asking for claims in the first place.

The thing the model genuinely cannot get wrong is what *we* were doing. It was there. It saw
the subject we kept circling, the constraint we came back to, the thing we ruled out. That
is true whether or not its facts were.

## Decision

**The sweep writes a first-person account of what a conversation says about us, and nothing
else.**

**First person, from inside.** "We were weighing local models against Claude, mostly on
cost. You would rather not spend more on API credits." Not "the conversation outlines". The
voice is checked mechanically, not merely requested, because the prompt alone does not hold
it: an account containing "the conversation", "the user" or "this discussion", or containing
no first- or second-person pronoun at all, is discarded.

**Facts the assistant asserted are explicitly excluded.** They may be wrong and they are not
what this is for. What gets recorded is what we were doing with them.

**`60-log/conversations/`, not `10-notes/`.** These are records of what happened, and the
vault already defines `60-log/sessions/` for "what was discussed, decisions made, anything
left open". A statement about us in the folder reserved for claims about the world would be
a category error that later retrieval would quietly propagate.

**No review, and no queue.** This is the part ADR-0005 got wrong at the root rather than in
detail. A gate exists to stop something harmful reaching somewhere trusted; an account of
what we were doing is not a claim, does not enter the knowledge base, and cannot be wrong in
the way a claim can. Approving each one would be friction protecting nothing, and the
vault's own research is that capture friction is the main cause of abandonment.

**One record per conversation, rewritten as it grows.** A conversation picked up a week
later is still one thing that happened. The second reading replaces the first rather than
sitting beside a version of itself that stops halfway.

## Consequences

**Good.** The output is now something the model is qualified to produce. No filter can make
a 4B model right about the world; none is needed to make it right about what we just did.

**Good.** Capture is genuinely free at last, ask a question, and the context is recorded
without a click. That was the original request and ADR-0005 was the reason it could not be
honoured.

**Good.** A large amount of machinery goes: the review queue, the drafts layer, the promote
and merge flow, search-before-create, the topic and duplicate gates. Roughly six modules
and their tests, all of which existed to manage a risk we no longer take.

**Bad.** `10-notes/` no longer grows by itself, and nothing proposes durable knowledge any
more. That capability is genuinely lost, not relocated. Promoting a conversation by hand still
does it, deliberately and with a person present, which is where that judgment belongs.

**Bad.** Three ADRs in one day on the same subject, two of them now superseded. The record
is honest about the path but it is not a straight one.

**Accepted risk.** An account is still a model's reading of a conversation and can be
skewed, emphasising the wrong thread, missing the point. It is inert where a false claim
was not: it lives in a log, is attributed to an agent, and is never retrieved as fact.

## Alternatives rejected

**Keeping both, context automatically, claims still gated.** Offered and declined. Two
extractions per conversation, two homes, two things to maintain, to preserve a flow whose
every observed output was refused.

**Better prompting for claims.** Tried twice. The topic filter and the self-reference filter
were both written for exactly this, and both worked, they correctly refused what the model
produced, leaving nothing. Refusing bad output well is not the same as getting good output.
