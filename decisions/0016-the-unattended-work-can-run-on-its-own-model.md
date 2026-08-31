# ADR-0016: The work nobody asked for can run on its own model

**Status:** Accepted
**Date:** 2026-08-31
**Amends:** [ADR-0006](0006-passive-extraction-into-an-unreviewed-layer.md), which made
reading free-only, and [ADR-0009](0009-one-provider-and-a-plain-error.md), which is about
the model a *question* runs against and stays true of it.

## Context

Three things in this plugin ask a model something. One of them is a person waiting for an
answer. The other two are a conversation being read a few minutes after it goes quiet, and
a conversation being given a name once there is something to name it after. Until now all
three ran on whatever the chips beside the composer said, because the chips were the only
place a model could be named.

That is one setting doing two jobs whose requirements have nothing in common. The question
wants the best model available and its cost is a decision made per question, in front of
somebody who chose to spend it. The other two want something cheap, local and dull, run
without supervision, at a cost that is per conversation and therefore unbounded.

What that cost the person using it: **conversations held with a paid provider were never
read at all.** ADR-0006 makes reading free-only, correctly, so a bill cannot grow while
nobody is watching. With the chips on a paid provider that rule fires on every sweep, and
the only trace is one line in the settings screen saying the provider "charges per
request". The context folder simply stays empty, and the memory that later conversations
are supposed to start from is missing for exactly the conversations most worth having.
The plugin's central claim, that each conversation starts with what the last ones noticed,
quietly did not hold on a paid provider.

Naming had the milder version of the same problem: a request per conversation, spent at
whatever the chips point at, for a filename.

## Decision

**One setting, on the settings screen: the model for reading and naming.** Unset by
default, and unset does not mean a model. It means the chat one, so a vault that never
opens the setting behaves exactly as it did.

**It is chosen the way the chips are chosen, and for the same reasons.** A control for the
provider and a control for the model, not one list: which provider is a question about
money and which model is a question about capability, and one list makes them look alike.
The listing is fetched when the control is clicked rather than when the screen is drawn,
because this screen is rebuilt every time a toggle moves.

**ADR-0009 is untouched.** It governs the model a question runs against, and nothing here
substitutes anything for that. A question still runs where the chips say, still fails
plainly when that fails. This is a second choice about a second kind of work, not a
fallback for the first.

**The free-only rule of ADR-0006 keeps its meaning rather than its letter.** It exists
against a bill nobody chose. A model named in this row is a choice, made deliberately,
about somebody's own money, so reading runs there. It still refuses a paid provider that
was merely inherited from the chips, and the refusal now names the setting that fixes it
instead of stopping at "charges per request". What that costs, it says in the row, in the
colour this theme uses for something about to spend money.

**Which model answered is still recorded per turn** in the conversation file, as it always
was. The reading and the naming are not turns and are not recorded there.

## Consequences

**Good.** The pairing this was built for works: talk to a large paid model, have a small
local one keep the record. Both halves do what they are good at, and the context folder
fills up whatever the chips are set to.

**Good.** The one setting that could spend money unattended is explicit, reversible in one
click, and says what it will cost where it is set.

**Bad.** A second model to configure, on a screen whose first section already asks for
credentials. Mitigated by unset being sensible: nobody has to open it, and nothing on the
row is required to make the plugin work.

**Bad.** The conversation and the account of it can now come from different models, so a
record can be written by something that was never in the room. It is only ever written
from our half of the conversation (ADR-0013), which is the half neither model authored, so
what changes is the wording and not the subject.

**Accepted risk.** Somebody sets a large paid model here and gets a bill per conversation.
The row says so; the plugin does not argue further. Refusing to honour a choice about
somebody else's money is the plugin deciding how it is spent.

## Alternatives rejected

**Fall back to a local model automatically whenever the chat one charges.** Fewer settings,
and it fixes the empty folder without anybody being asked. Rejected because it is a
substitution nobody chose, which is the thing ADR-0009 removed from turns: a record would
appear written by a model the person never picked, and there would be nowhere on screen
that said so.

**A third chip beside the composer.** Wrong place. The chips are per-question controls, and
this is not a per-question choice: nobody is at the composer when this work runs. It would
also put a control for money next to a control for money that means something else.

**Let it name only local models.** Safe, and dishonest about why. The rule is about a cost
nobody chose, not about local being better, and a person who wants a cheap hosted model to
do the reading has a reasonable want.
