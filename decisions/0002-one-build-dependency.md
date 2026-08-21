# ADR-0002 — One build dependency, and none at runtime

**Status:** Accepted
**Date:** 2026-08-18
**Amends:** the gateway's ADR-0002 of the gateway,
which forbade dependencies of any kind.

## Context

Obsidian loads exactly one file per plugin, and mobile has no module resolution — no
`require` of a relative path, no import map. So the choice is a bundler, or one enormous
source file.

One file would break the 200-line rule the gateway held to throughout, and would make the
provider seam a convention rather than a boundary. The seam is what lets a provider be
replaced by editing one file; collapsing it to survive a packaging constraint trades a
real property for a tooling preference.

## Decision

**One build-time dependency: esbuild.** Nothing else, and nothing at runtime.

The bundle contains this project's source and nothing else. `dependencies` stays empty
permanently; a populated one fails review exactly as before.

The build is a script in this repository, not a config file interpreted by a framework.
It is short enough to read in full, which is the property that made the zero-dependency
rule worth having in the first place.

**The runtime rule is unchanged and is the one that mattered.** A shipped bundle with no
third-party code cannot break because a package was yanked, cannot carry a supply-chain
compromise, and cannot drift underneath a vault that has to still work in ten years.

## Consequences

**Good.** The seam survives packaging. Files stay small and one-responsibility.

**Good.** The property people actually cared about — nothing third-party executing next
to the vault and the keys — is intact.

**Bad.** `node_modules` now exists in this repository, and a fresh clone needs an install
before it can build. Gitignored, and the built plugin is committed so the vault works
without ever running the build.

**Bad.** A dependency is a dependency. If esbuild becomes unavailable, a replacement is a
day's work and the source is unaffected, because nothing imports it.

## Alternatives rejected

**One large main.js, no build.** Proven possible — the streaming spike was plain
CommonJS. Rejected because it dissolves the module boundaries that make provider code
replaceable, to avoid a tool that runs on a laptop and never ships.

**Hand-rolled concatenation.** A bundler written badly, maintained here, to avoid
admitting a dependency. This is the kind of purity that costs more than it saves.

**Ship unbundled and mark the plugin desktop-only.** Relative `require` works under
Electron. It would trade mobile — the single largest gain of ADR-0001 — for the
appearance of having no build step.
