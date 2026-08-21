/**
 * The build (ADR-0002).
 *
 * Short enough to read in full, which is the property that made the zero-dependency rule
 * worth having. It bundles the source into the one file Obsidian loads.
 *
 *   node build.mjs [--watch] [--vault <path to a vault>]
 *
 * By default `main.js` lands beside `manifest.json` at the repository root, which is where
 * a release expects it and where Obsidian loads it from if the repository *is* the plugin
 * folder. Pass `--vault` to install into a real vault as well, which is how this gets
 * tested against the running app.
 */
import { build, context } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = ["manifest.json", "styles.css"];

/** `--vault <path>`, or nothing, in which case the build stays where it was built. */
function vaultFromArgs(argv) {
  const at = argv.indexOf("--vault");
  if (at === -1 || !argv[at + 1]) return null;
  return join(argv[at + 1], ".obsidian", "plugins", "colloquy");
}

const installTo = vaultFromArgs(process.argv);

const options = {
  entryPoints: [join(HERE, "src", "main.js")],
  outfile: join(HERE, "main.js"),
  bundle: true,
  // Obsidian provides these at runtime. Bundling them would ship a second copy of the app
  // inside a plugin, and on mobile the node builtins do not exist to bundle.
  external: ["obsidian", "electron", "node:*"],
  format: "cjs",
  target: "es2020",
  platform: "browser",
  logLevel: "info",
  sourcemap: false,
  // Readable output on purpose: this file goes into a release, and a bundle nobody can
  // read is a bundle nobody can check.
  minify: false,
};

function install() {
  if (!installTo) return;
  mkdirSync(installTo, { recursive: true });
  for (const file of [...ASSETS, "main.js"]) copyFileSync(join(HERE, file), join(installTo, file));
}

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
  install();
  console.log(`watching${installTo ? ` — installing to ${installTo}` : ""}`);
} else {
  await build(options);
  install();
  console.log(installTo ? `built, and installed to ${installTo}` : "built to main.js");
}
