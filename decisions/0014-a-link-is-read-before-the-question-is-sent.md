# ADR-0014: A link is read before the question is sent

**Status:** Accepted
**Date:** 2026-08-25
**Extends:** ADR-0011 (attachments from the vault, or from anywhere into it)

## Context

Somebody linked to a video and asked whether the machine in it would do as a homelab. The
model answered at length about "the video's potential focus", and when asked directly said
it could not open the link. It was right: no model can fetch anything. A model that appears
to have looked something up had something around it do the looking.

The something is missing here, and everything needed to add it is already present. An
attachment is text that travels with a question and is linked from the transcript, and a
page is text. What was absent was a way to get one.

## Decision

**A link in the box is read before the question is sent, and held as an attachment.**

Through Obsidian's `requestUrl` rather than `fetch`, which a plugin cannot use against
another origin: the browser refuses it, and refuses it as a network error indistinguishable
from the site being down.

What travels is the title, the address, the description, and whatever prose is left after
the markup comes off, to four thousand characters. It is linked in the transcript by its
address rather than as a wikilink, because a page was never a note in the vault.

Read once the typing stops rather than on each keystroke, which would ask a stranger's
server for every half-written address on the way to the real one.

## Alternatives considered

**Tool calling, so the model asks for the page itself.** The honest version of "give it the
web", and much larger: a tool protocol per provider, a loop that runs a model's decisions,
and a model capable of using it. The local ones this is built around are not. It also puts
a request to an arbitrary address behind a model's judgement rather than a person's typing,
which is a different consent question and a worse one.

**Search rather than fetch.** Needs a search API, so a key, a bill, and a dependency. Three
things this plugin has one of and does not want more.

**Asking before each fetch.** Considered and refused for the same reason ADR-0006 refused a
review queue: a question that has to be confirmed twice is a question people stop asking.
The link is visible as a chip before Send, which is where the seeing happens.

## Consequences

**A question containing a link makes a request from this machine to that address.** It is a
link that was typed, so it is not a surprising request, but it is one the plugin makes
rather than the person. The chip is how it is visible, and a page that fails to load says so
without stopping the question.

**A video gives its title and description, not what it contains.** That page is a script
bundle, and no amount of stripping tags gets a transcript out of it. It is enough to answer
"what is this" and not enough to answer "what does it say", and the README says so rather
than letting somebody find out.

**Four thousand characters is arbitrary and will be wrong for something.** A long article
travels as its opening, which is usually where an article says what it is. The alternative
is a setting, and a number nobody knows how to choose is not a setting worth having yet.

**Anything behind a login is a login page.** The plugin sends no cookies and holds no
session, so a paywalled article gives its preamble, which is what a search engine sees too.
