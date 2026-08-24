# ADR-0013: Only our half is read back

**Status:** Accepted
**Date:** 2026-08-24
**Amends:** ADR-0007 (context about us, not claims about the world)

## Context

ADR-0007 stopped this plugin extracting claims about the world, on the grounds that a small
local model gets them confidently wrong. What it kept was an account of what we were doing,
justified like this:

> what it cannot be wrong about is what we were doing, because it was there.

That justification is true of our half of a conversation. It was never true of the model's,
and the observer was given both.

The result, found by using it rather than by reading it. A question was asked about which
graphics card was needed. The model answered, and its answer named a GTX 1070 Ti, which is
not the card in this machine. That answer went into the transcript. The observer read the
transcript, including the answer, and wrote a record saying we own a 1070 Ti. That record
was handed to the next conversation as background. The next model read it, agreed with it,
and said it again. That conversation was summarised too.

Four records now say we own a card we do not own. One says that `qwen3:7b` "provided the
best performance and a working solution", a model at a size Qwen3 has never shipped, filed
as settled.

Nothing outside the loop ever disagreed, because nothing outside the loop was in it:

```
memory  ->  sent as context  ->  model repeats it  ->  written to the transcript
   ^                                                              |
   +---------------  a new record carries it  <------------------ +
```

The prompt already forbade this. It said "record no facts about the world, not even ones
worked out here", four lines after asking for "what we decided, and what we ruled out". A
decision is where a claim goes to be laundered, and the rule and the request contradicted
each other in the same paragraph.

## Decision

**The observer reads our turns only.** The model's replies are dropped before the
conversation is handed over.

The bullet asking for decisions now asks for "what we chose to do next, and what we set
aside", which is about our own direction rather than about how anything behaves.

## Alternatives considered

**Tighten the prompt again.** The prompt was already right and already ignored. A 4B model
asked in two places for opposite things will do the easier one, and no wording makes the
model's errors safe to summarise. This is a structural problem and wanted a structural fix.

**Have a second model check the records.** More machinery, the same weakness, and now two
models can be confidently wrong together. It also doubles what runs unasked, against
ADR-0006.

**Expire records after some time.** Does nothing about the loop. A wrong record is wrong on
the day it is written, and would be re-derived from the next conversation anyway.

**Show every record for approval before filing.** This is a plugin whose whole point is that
it writes without being asked. A queue of things to approve is the friction it exists to
remove, and ADR-0006 already refused it once.

## Consequences

**Records are thinner.** A question is shorter than an answer, and some genuine context only
appears in the reply. That is the price, and it buys a record that cannot contain something
the model invented.

**Our own mistakes still get recorded.** If we say we own a 1070 Ti, that is what is filed.
This is correct: the record is of what we said, and a system claiming to know better than
the person it is recording is a worse problem than the one being fixed here.

**The four poisoned records already in the vault are not repaired by this.** They were
deleted by hand. Nothing here detects a bad record that already exists, and that remains
true.
