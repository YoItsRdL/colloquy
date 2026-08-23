/**
 * Everything a ticket closes against, in one command.
 *
 * The checks that are not tests are the ones worth having here: a dependency that
 * appeared, a provider name that leaked out of its adapter, a bundle that stopped
 * building. None of those fail a unit test, and all of them are how the rules in
 * AGENTS.md quietly stop being true.
 *
 * Everything here runs against this repository alone. It used to reach two directories up
 * into the vault this plugin was built inside, for the key store and the built bundle;
 * neither is here any more, and both checks were replaced by ones that mean something in a
 * repository somebody else might clone.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

let failures = 0;

const report = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
  if (!ok) failures++;
};

/** Every .js under a directory, recursively. */
function sources(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sources(path));
    else if (extname(entry.name) === ".js") found.push(path);
  }
  return found;
}

const run = (cmd, args, cwd = ROOT) =>
  execFileSync(cmd, args, { cwd, stdio: "pipe", shell: process.platform === "win32" }).toString();

console.log("gate");

// ── syntax ───────────────────────────────────────────────────────────────────────
const files = [...sources(join(ROOT, "src")), ...readdirSync(ROOT).filter((f) => f.endsWith(".test.js")).map((f) => join(ROOT, f))];
try {
  for (const file of files) run("node", ["--check", file]);
  report(`syntax (${files.length} files)`, true);
} catch (err) {
  report("syntax", false, String(err.stderr ?? err).split("\n")[0]);
}

// ── tests ────────────────────────────────────────────────────────────────────────
try {
  const out = run("node", ["--import", "./test/register.mjs", "--test", ...readdirSync(ROOT).filter((f) => f.endsWith(".test.js"))]);
  const failed = /# fail (\d+)/.exec(out)?.[1] ?? "0";
  report("tests", failed === "0", failed === "0" ? "" : `${failed} failing`);
} catch (err) {
  report("tests", false, String(err.stdout ?? err).split("\n").filter((l) => l.startsWith("not ok")).slice(0, 3).join("\n        "));
}

// ── no runtime dependencies (ADR-0002) ───────────────────────────────────────────
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const runtime = Object.keys(pkg.dependencies ?? {});
report("no runtime dependencies", runtime.length === 0, runtime.join(", "));

// ── the provider seam (standard 2) ───────────────────────────────────────────────
// A provider name outside its adapter means the seam has become a convention.
// Derived from the adapters themselves, so a provider added tomorrow is covered without
// anyone remembering to add it here. Listing them by hand meant ollama went unchecked.
const SHARED = new Set(["index.js", "model-id.js", "openai-wire.js"]);
const names = readdirSync(join(ROOT, "src", "providers"))
  .filter((f) => f.endsWith(".js") && !SHARED.has(f))
  .map((f) => f.slice(0, -3));
const leaks = [];
for (const file of sources(join(ROOT, "src"))) {
  if (file.includes(`${"providers"}`)) continue;
  const text = readFileSync(file, "utf8");
  for (const name of names) {
    if (new RegExp(`["'\`]${name}["'\`]`).test(text)) leaks.push(`${file.slice(ROOT.length + 1)}: ${name}`);
  }
}
report("no provider name outside providers/", leaks.length === 0, leaks.join("\n        "));

// ── one responsibility per file ──────────────────────────────────────────────────
// The gateway audited this and the rule did not survive the port: AGENTS.md stopped
// stating it and nothing checked it, so two files quietly grew past it. A standard that
// is only remembered is not a standard.
const LIMIT = 200;
const oversized = sources(join(ROOT, "src"))
  .map((file) => [file.slice(ROOT.length + 1), readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).length])
  .filter(([, lines]) => lines > LIMIT)
  .map(([file, lines]) => `${file}: ${lines} lines`);
report(`no source file over ${LIMIT} lines`, oversized.length === 0, oversized.join("\n        "));

// ── no secret has been committed (ADR-0004) ─────────────────────────────────────
// The key store itself lives in whichever vault this plugin is installed into, and is not
// in this repository at all. What this repository can be wrong about is a key pasted into
// a source file or a test fixture and never noticed.
const SECRET = /\b(sk-ant-|sk-proj-|sk-[A-Za-z0-9]{20}|AIza[A-Za-z0-9_-]{30})/;
const leaked = [...sources(join(ROOT, "src")), ...readdirSync(ROOT).filter((f) => f.endsWith(".test.js")).map((f) => join(ROOT, f))]
  .filter((file) => SECRET.test(readFileSync(file, "utf8")))
  .map((file) => file.slice(ROOT.length + 1));
report("no key has been committed", leaked.length === 0, leaked.join("\n        "));

// ── the bundle still builds ──────────────────────────────────────────────────────
try {
  run("node", [join(ROOT, "build.mjs")]);
  const bundle = readFileSync(join(ROOT, "main.js"), "utf8");
  // Nothing third-party may reach the vault, which is the runtime half of ADR-0002.
  report("bundle builds, and carries no third-party code", !bundle.includes("node_modules"));
} catch (err) {
  report("bundle builds", false, String(err.stderr ?? err).split("\n")[0]);
}

console.log(failures ? `\n${failures} stage(s) failing` : "\nGATE GREEN");
process.exit(failures ? 1 : 0);
