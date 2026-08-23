/**
 * Everything that has to be true before a release, checked rather than remembered.
 *
 *   node scripts/release.mjs
 *
 * Two of these catch mistakes that fail silently. A tag written `v1.0.0` does not match the
 * manifest and Obsidian simply never offers the release, no error, no install. And the
 * manifest at the repository root is what the installer reads to decide what to fetch, so
 * when it drifts from the one in the release assets, people are offered a version that is
 * not there.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => JSON.parse(readFileSync(join(ROOT, file), "utf8"));

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
  if (!ok) failures++;
};

const manifest = read("manifest.json");
const versions = read("versions.json");
const pkg = read("package.json");
const { version, minAppVersion } = manifest;

console.log(`release ${version}\n`);

check("the version is the same in all three files",
  version === pkg.version && Object.keys(versions).includes(version),
  `manifest ${version}, package.json ${pkg.version}, versions.json ${Object.keys(versions).join(",")}`);

check("versions.json maps this version to the manifest's minimum",
  versions[version] === minAppVersion,
  `versions.json says ${versions[version]}, manifest says ${minAppVersion}`);

// Not "1.0.0" as a placeholder that nobody set.
check("the version is not a placeholder", /^\d+\.\d+\.\d+$/.test(version) && version !== "0.0.0", version);

for (const field of ["id", "name", "version", "minAppVersion", "description", "author", "isDesktopOnly"]) {
  check(`manifest has ${field}`, manifest[field] !== undefined && manifest[field] !== "");
}

// The three files a release carries, as individual assets rather than a zip.
for (const asset of ["main.js", "manifest.json", "styles.css"]) {
  const path = join(ROOT, asset);
  check(`${asset} is built and not empty`, existsSync(path) && statSync(path).size > 0);
}

check("the bundle carries no third-party code",
  !readFileSync(join(ROOT, "main.js"), "utf8").includes("node_modules"));

// The tag. No `v`: Obsidian matches it against the manifest version literally.
try {
  const tags = execFileSync("git", ["tag", "--list"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const prefixed = tags.filter((t) => /^v\d/.test(t));
  check("no tag is prefixed with v", prefixed.length === 0, `Obsidian will not match: ${prefixed.join(", ")}`);
  check(`a tag exists for ${version}`, tags.includes(version), `tags: ${tags.join(", ") || "none"}`);
} catch {
  check("git tags are readable", false, "not a git repository?");
}

console.log(failures ? `\n${failures} thing(s) to fix before releasing` : "\nREADY TO RELEASE");
process.exit(failures ? 1 : 0);
