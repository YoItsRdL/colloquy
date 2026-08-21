# ADR-0006 — Conversations are read automatically, into a layer nobody believes yet

**Status:** Accepted, and amended by [ADR-0007](0007-context-about-us-not-claims-about-the-world.md)
**Date:** 2026-08-19
**Amends:** [ADR-0005](0005-promotion-needs-a-decision-per-note.md), which required a human
decision before anything was written at all.

## Context

ADR-0005 put a person in front of every proposal, and it works — the first real run caught
a false claim (*"Claude Opus 5 does not exist"*) that a 4B local model was confident about,
and the second run correctly offered to merge rather than duplicate it.

It also costs a click per conversation, and the vault's own research is unambiguous about
what that does: *"the most consistent predictor of abandonment is how expensive it is to
add a note correctly."* A gate nobody passes through protects nothing.

Two things changed since ADR-0005 was written:

**Extraction became free.** `gemma3:4b` reads a conversation in 2.4 seconds locally, with
no thinking phase, against `qwen3:4b`'s 25 seconds of monologue. Cost is no longer the
argument for asking first.

**We saw exactly what unattended writing produces.** Both local models are confidently
wrong about the same thing, because the conversations are about the edge of what they know.
`gemma3` additionally returns topics where the vault demands claims — *"Qwen3 vs. Claude 3
Comparison"* is the failure `/process` names first.

So the question is not whether to automate, but what the automated output is allowed to
claim. The assistants this was modelled on — ChatGPT, Gemini — do not passively write a
knowledge base. They write a personalization store: short, disposable, wiped in one click,
never read as truth. Their passive layer is safe because of where it lands, not because
anyone reviewed it.

## Decision

**Conversations are read automatically, and what comes out lands in `15-drafts/`, which is
not the knowledge base.**

**Reading is automatic; believing is not.** A few minutes after the last turn, the
conversation is read and any claims are written to `15-drafts/YYYY/MM/` with
`type: draft` and `reviewed: false`. Nothing reaches `10-notes/` without a person choosing
it, so the property ADR-0005 was protecting is intact — what changed is that the person is
no longer the reason the work happens.

**An unreviewed draft is never linked as though it were established.** Drafts carry their
own type and live in their own tree, so a search of `10-notes/` cannot return one and a
graph of the vault does not connect through one. This is the whole safety argument: a
wrong draft is inert, while a wrong note is retrieved later and believed.

**Local models only.** Passive means every conversation, including the ones nobody would
have bothered to process. On a metered provider that is a bill that grows without anyone
pressing anything, against an explicit constraint of this vault's owner. If the chips are
set to a provider that charges per request, the sweep does not run and says so.

**Every conversation is read at most once, and eventually read at least once.** The
conversation's own frontmatter records it, so the marker survives the rename that follows
the first answer and cannot drift from the file the way a plugin-side ledger of paths
would. Because the marker is on the file rather than in the plugin, a catch-up pass can run
whenever, as often as it likes, without doing anything twice — so one runs at startup for
anything the idle clock never reached.

Without that pass the marker would be write-only, and a single evening with Ollama switched
off would mean those conversations are never read again by anything. The pass is bounded per
run: an inbox of two hundred must not mean ten minutes of GPU the moment somebody opens
their vault.

**A draft is disposable and the whole layer is.** Deleting `15-drafts/` costs nothing but
a re-read. Nothing else in the vault may link into it or depend on it.

## Consequences

**Good.** Capture is now genuinely free — ask a question, and by the time you look again
the claims are waiting. That is the property the vault's research says matters most.

**Good.** The queue is reviewed at whatever pace suits, in one sitting over many
conversations, instead of one modal per conversation at the moment of least interest.

**Good.** A bad model, a bad prompt, or a bad day is one folder to delete rather than notes
to find and unpick.

**Bad.** `15-drafts/` will fill with material nobody ever reads, and an unread queue is a
mild, permanent reproach. This is accepted: the alternative is not reading it in the inbox
instead, which is where we started.

**Bad.** The plugin now writes to the vault without being asked, which is a genuine change
in what it is. The mitigation is that everything it writes is quarantined by construction
rather than by convention.

**Accepted risk.** Somebody will eventually read a draft and treat it as a note, because it
looks like one. `reviewed: false` in the frontmatter and a separate tree are what stand
between that person and a false claim — and both are visible rather than enforced.

## Alternatives rejected

**Straight into `10-notes/`.** What was literally asked for, and rejected on the evidence
sitting in the vault already: the first automatic run wrote something false. At 2.4 seconds
per conversation, that failure mode arrives at machine speed.

**A memory file instead of notes.** What the assistants actually do, and genuinely safer —
the model cannot be wrong about what you said, only about what it knows. Rejected for now
because it does not grow the knowledge base, which is the point. Worth revisiting as a
separate feature rather than a substitute for this one.

**A plugin-side ledger of processed paths.** Rejected: conversations are renamed after
their first answer, so a ledger keyed on path would re-read half of them.
