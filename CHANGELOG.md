# Changelog

Dates are release dates. Reasoning that outlived a single release lives in
[`decisions/`](decisions/) instead.

## 1.0.3 (2026-08-26)

The memory stopped repeating things that were never true, and started keeping the things
worth keeping. Everything else here is smaller than that.

- **It no longer remembers what the model said.** A question about graphics cards drew an
  answer naming a card this machine does not have. That answer was in the transcript, the
  transcript was read, and a record was filed saying we owned it. That record was handed to
  the next conversation as background, agreed with, and summarised again. Four of twelve
  carried it. The observer now reads **your half of the conversation only**, so a claim the
  model invented can no longer become something the plugin believes about you (ADR-0013).

- **A record now has two halves, and the older one is what lasts.** What you were doing on
  a Tuesday is worth a week; what you work under is worth years. Both used to go in one
  paragraph, and recall spent its whole budget on whichever conversations were most recent,
  so the memory got *worse* the longer you used it. A year in, it would know which
  graphics card was priced on a Tuesday and nothing about the person who priced it. The two
  are written under their own headings now, and the durable half is gathered from far
  further back.

- **A conversation read twice no longer leaves two records.** The record was filed under the
  day it was written rather than the day of the conversation it describes, so re-reading an
  older conversation filed a second copy beside the first. Records are also stored by day
  now, matching the conversations themselves.

- **Nothing on screen that cannot be used.** On a phone with no key, the panel showed "No
  provider", "—" and "Not written yet" under a bright Send button that could not send.
  Every one of those was honest and none of them helped. Until there is something to answer
  with, the thread and the composer stand down and what remains is one sentence saying what
  is missing and one button that fixes it.

- **Removing a local model no longer breaks the two things beside it.** The removed model
  stayed selected, so every question afterwards failed at the provider with a 404 for a
  model nobody had; a download running at the time lost its progress display and reported
  into a row that had been thrown away.

- **A removal that fails now says so.** It announced "Removed" the moment the call
  returned, and let an error escape where nothing catches it, so a removal refused because
  a download held the model looked exactly like one that worked, and 3.1 GB stayed on disk
  under the belief it was freed. The server is now asked again afterwards, and only a model
  actually gone is reported as gone.

- **A link in your question is read and sent with it.** No model can fetch anything, so
  this does the fetching: title, address, description and whatever prose survives the
  markup coming off. A video gives its title and description, not what it contains
  (ADR-0014).

- **Paste a screenshot straight into the box.** It is copied into your vault like anything
  else attached from outside it, so the conversation links to something that is really
  there. Pasted text is untouched.

- **Usable on a phone.** Controls that were a pointer's size are a thumb's, the row of them
  wraps instead of running off the edge, the box no longer makes iOS zoom the page when you
  tap it, and nothing sits under the home indicator.
- **A phone no longer claims Ollama is configured.** It assumed `localhost`, which on a
  phone is nothing at all, so the panel looked ready and then failed every question with
  advice that could not be taken on that device. It now says no key is set, and names the
  screen to set one on. An address typed in by hand (Ollama on your desktop, reached over
  your network) works exactly as before (ADR-0012).

Under the surface: the em dash is gone from every line of prose the plugin shows you, and
the file picker's one inline style moved into the stylesheet, where a theme can reach it.

## 1.0.2 (2026-08-23)

- **Removing a key did nothing.** The confirmation's Remove button cleared the key in
  memory, never wrote that to disk, and left the confirmation on screen looking untouched,
  so the key came back on the next reload. It called two functions left behind by the
  fallback chain removed in ADR-0009 and threw before it reached the end.
- **A local provider that is not running now says so.** "The request did not complete, and
  it returned nothing to explain why" listed two possibilities and left you to work out
  which. For a provider addressed by a URL there is a likeliest cause worth naming, and the
  address is printed with it. A server that *is* running means the address is wrong.
- A way to say thanks, if it has been useful: in settings, in the plugin browser, and on
  the repository.

Under the surface: every module that talks to Obsidian is now tested. That was sixteen
files and about 1,400 lines with no coverage at all, and it is where both of the bugs above
were living.

## 1.0.1 (2026-08-22)

Two defects in the rename that follows the first answer, both found by installing the
released 1.0.0 into a real vault rather than testing a development build.

- **The automatic read never fired on its own.** A conversation is renamed once it has a
  title, and the three-minute idle clock was left pointing at the name the file had before.
  It fired on a path nothing lived at, returned without recording a reason, and the
  conversation waited for the next catch-up instead. Context notes were only ever written
  when Obsidian started, while the callout inside every conversation promised "a few
  minutes after this goes quiet".
- **A title matching the working name renamed the file anyway.** The filename comes from
  the question and the title from the answer, so the two agreeing is ordinary rather than
  rare. It produced `hello-2.md`.

Anyone who ran 1.0.0 kept everything: those conversations were read on the next launch,
just not when they went quiet.

## 1.0.0 (2026-08-22)

First public release.

- Chat in a side panel against Ollama, OpenAI, Anthropic, Google or DeepSeek.
- Every conversation written to the vault as markdown while it happens, named from its
  subject once there is one.
- A short first-person account of each conversation filed a few minutes after it goes
  quiet, and handed to later conversations as background. Local models only, so passive
  reading cannot run up a bill.
- Attachments from the vault or from disk: notes and images, three provider wire formats.
  PDFs are refused rather than silently ignored.
- Both folders configurable, because not every vault is organised like the one this was
  written in.
