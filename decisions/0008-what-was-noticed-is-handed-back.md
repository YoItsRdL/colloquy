# ADR-0008: What was noticed is handed back, as a hint

**Status:** Accepted
**Date:** 2026-08-19
**Completes:** [ADR-0007](0007-context-about-us-not-claims-about-the-world.md), which
established the records but left nothing reading them.

## Context

ADR-0007 has the sweep write an account of each conversation to
`60-log/conversations/`. Nothing read them. That is the same defect the `noticed:` marker
had before the catch-up pass existed. A store only ever written to is not a store, and the
stated purpose of these records was "so the system keeps learning about us". A record
nothing reads back learns nobody anything.

## Decision

**Each conversation carries a short block of what earlier ones noticed, as background.**

**Offered as a hint, never as instruction.** The block says in as many words that it was
written by a small model, may be wrong, may be stale, and should be ignored where it does
not apply. These records are one model's reading of a conversation and a reading can be
skewed; the one thing a wrong record must never do is arrive with the authority of
something we actually said.

**On the session, not in the history.** The transcript records what was said, and this was
not said by anybody, so it never reaches the file. It is also why it cannot accumulate: a
preamble pushed into the history would be re-sent with every turn, growing the request for
as long as the conversation lasted.

**Whole records or none.** Eight at most, 2400 characters at most, and a record that will
not fit is dropped rather than truncated. Half an account read back is worse than one fewer
account, because the half that survives reads as the whole of what we thought.

**A vault with nothing noticed costs nothing.** No block, no reads, no tokens.

**It can be switched off, and the setting says where the text goes.** This is the only
place vault content leaves the machine without somebody having typed it, and if the chips
are set to a paid provider it goes there. Saying so is not optional.

## Consequences

**Good.** The loop closes. Asked "what did we decide about local models?" in a conversation
with no history, the model answered from a record written by an earlier one.

**Good.** The cost is bounded and visible, a couple of thousand characters at the front of
the first request of a conversation, and nothing after that.

**Bad.** Errors can now compound. ADR-0007 accepts that a record may carry a claim the model
got wrong; handing it back makes that claim an input to the next conversation. The
mitigations are that it is labelled untrusted, that it is capped, and that it can be turned
off, none of which make it impossible.

**Bad.** Conversations are no longer independent. A strange answer may now be caused by
something recorded days ago, and the only way to see it is to read
`60-log/conversations/`.

## Alternatives rejected

**A system-role message.** The adapters map anything that is not `assistant` to `user`, and
adding a role would mean touching every provider to gain nothing this does not already do.

**Rebuilding it every turn.** Reads the same files to produce the same block. Built once per
conversation instead, which also makes the background stable for the length of it.

**Retrieving by relevance to the question.** Would need embeddings or a search step before
every turn, for a set of records small enough that recency is a reasonable proxy. Worth
revisiting when the log is long enough for that to be false.
