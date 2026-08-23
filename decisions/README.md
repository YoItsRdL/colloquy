# Decisions

Why this plugin works the way it does, one file per decision, in the order they were made.

Three of them were reversed or amended by later ones, and those are kept rather than tidied
away. A reader deciding whether to trust this learns more from ADR-0007 explaining why an
entire feature was ripped out than from any description of what remains.

| | Decision | Status |
|---|---|---|
| [0001](0001-a-plugin-not-a-server.md) | A plugin, not a server | Accepted |
| [0002](0002-one-build-dependency.md) | One build dependency, and none at runtime | Accepted |
| [0003](0003-keys-stay-out-of-plugin-data.md) | Keys stay in a dotfile, never in plugin data | **Superseded by 0004** |
| [0004](0004-keys-live-in-plugin-data.md) | Keys live in Obsidian's plugin data | Accepted |
| [0005](0005-promotion-needs-a-decision-per-note.md) | The plugin may write notes, one human decision at a time | **Superseded by 0007** |
| [0006](0006-passive-extraction-into-an-unreviewed-layer.md) | Conversations are read automatically | Accepted, amended by 0007 |
| [0007](0007-context-about-us-not-claims-about-the-world.md) | Record what we were doing, not what the model believes | Accepted |
| [0008](0008-what-was-noticed-is-handed-back.md) | What was noticed is handed back, as a hint | Accepted |
| [0009](0009-one-provider-and-a-plain-error.md) | One provider, and a plain error when it fails | Accepted |
| [0010](0010-the-folders-are-yours.md) | The folders are the vault owner's | Accepted |
| [0011](0011-asking-about-something-in-your-vault.md) | Attachments from the vault, or from anywhere into it | Accepted |
| [0012](0012-a-phone-has-no-localhost.md) | A phone has no localhost | Accepted |

## The two reversals, in short

**0003 → 0004.** Keys were kept in a dotfile beside the plugin, on the reasoning that a
plugin's data file is the wrong place for a secret. Correct in principle, and impossible on a
phone: there is no way to edit a dotfile from Obsidian mobile. They live in plugin data now,
which is gitignored and never rendered back to the screen.

**0005 → 0007.** The plugin used to read conversations and propose durable notes for a
person to approve. Every part of it worked and what it produced was not worth having: a 4B
local model asked for claims about the world wrote *"Claude Opus 5 does not exist"* while
that model was answering the question. The review queue, the drafts layer and the promotion
flow were all deleted. What is recorded now is what *we* were doing, which the model was
present for and cannot be wrong about.

## Reading them

Each one says what was decided, what it cost, and what was rejected. The **Consequences**
section is the honest part: everything here has a downside, and an ADR that only lists
benefits is marketing.
