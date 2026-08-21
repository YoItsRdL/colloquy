# ADR-0010 — The folders are the vault owner's, not this plugin's

**Status:** Accepted
**Date:** 2026-08-19

## Context

Every path this plugin wrote to was a constant in the source: `00-inbox` for conversations,
`60-log/conversations` for what was noticed. Those are one vault's scheme — a numbered
system its owner designed, documented in its own `CLAUDE.md`, and good for them.

Nobody else has it. An Obsidian vault might be flat, or PARA, or Zettelkasten with a
different numbering, or in a language where "inbox" is not the word. A plugin that creates
`00-inbox/` regardless has not adapted to the vault; it has started reorganising it.

## Decision

**The folders are settings, and the current values are only their defaults.**

**Two of them, because there are two things written.** Where a conversation is kept, and
where the account of it is kept. Nothing else is written anywhere.

**What ships as the default is plain, and this vault carries its own scheme as a setting.**
`Conversations/` and `Conversations/context/` — named for what they hold rather than for a
numbering system. `00-inbox` as a placeholder would tell every new user that a numbered
vault is expected, which is one person's taste presented as a requirement. The account
folder sits inside the conversation folder so everything this plugin writes is one folder
somebody can move or delete in a single gesture — which in turn means the sweep has to
exclude it explicitly, or it would read its own accounts and write accounts of those.

**The sharding underneath is not configurable.** A folder per day for conversations, per
month for records. That is what stops one folder holding four years of them, it is the same
rule whatever the folder above is called, and making it configurable would be three more
inputs for a decision nobody wants to make.

**What is typed is cleaned, and the cleaning is shown before anything is written.** A
leading slash means the vault root to a reader and an absolute path to a filesystem; a
trailing one is invisible and doubles a separator; `..` climbs out of the vault; Windows
refuses `:*?"<>|` outright, and a vault synced between machines is only as portable as its
least tolerant one. The settings screen says "Will be: notes/chats" whenever the cleaned
form differs from what was typed, so the surprise happens before the write rather than
after it.

**Nothing usable means the default, never the vault root.** A cleared field must not
scatter conversations across the top of somebody's vault.

**Read fresh on every use.** A folder changed in settings applies to the next conversation,
not the next restart.

**Changing a folder does not move what is already filed.** The setting says so. Moving
files on a settings change is a migration, and a migration triggered by a text field is the
kind of thing that eats a vault.

## Consequences

**Good.** The plugin works in a vault that looks nothing like this one, which is the
difference between something one person uses and something anyone can.

**Good.** The path rules were already pure and tested, so this was passing a root in rather
than untangling anything. `folderFor(date)` became `folderFor(date, root)` and the tests
that covered the rule still cover it.

**Bad.** Two folders can now be set to the same place, which would put context records among
the conversations they describe. Nothing stops it, because nothing about it is harmful —
they are distinguishable by frontmatter, and forbidding it would be a rule protecting
against tidiness rather than damage.

**Bad.** Somebody who moves a folder after months of use has two folders in play and only
the new one is written to or read from. The alternative was moving their files for them,
which is worse.

## Alternatives rejected

**A folder picker.** Obsidian has no folder-picker primitive, and the plugin would have to
build one — a modal over the vault tree — to save typing a path most people paste anyway.

**One root, with fixed names beneath it.** Simpler to configure and wrong for the vault this
was built in, where conversations belong in the inbox and records belong in the log. Those
are different places on purpose.
