// Writes THIRD_PARTY_LICENSES.txt for the built web app: every npm package esbuild actually bundled,
// plus the fonts and icon set that ship with it. Fails the build when a bundled package has no
// licence file or a licence that isn't on the allowlist, so nothing ships without its notice.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const here = (p) => join(ROOT, "scripts/licenses", p);

/** Licences RipTide may bundle without a review (permissive, notice-only). */
export const ALLOWED = new Set(["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD", "BlueOak-1.0.0"]);
const LICENSE_FILES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "license", "license.md", "LICENCE", "LICENCE.md", "LICENSE-MIT"];

/** Package directories (node_modules/<name> or node_modules/@scope/<name>) found in esbuild's inputs. */
export function bundledPackages(inputs) {
  const dirs = new Set();
  for (const file of inputs) {
    const p = file.replace(/\\/g, "/");
    const i = p.lastIndexOf("node_modules/");
    if (i < 0) continue;
    const rest = p.slice(i + "node_modules/".length).split("/");
    const name = rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
    dirs.add(p.slice(0, i) + "node_modules/" + name);
  }
  return [...dirs].sort();
}

export function collect(inputs) {
  const out = [];
  const problems = [];
  for (const dir of bundledPackages(inputs)) {
    const abs = resolve(ROOT, dir);
    const pkg = JSON.parse(readFileSync(join(abs, "package.json"), "utf8"));
    const license = typeof pkg.license === "string" ? pkg.license : pkg.license?.type;
    const file = LICENSE_FILES.map((f) => join(abs, f)).find((f) => existsSync(f));
    if (!ALLOWED.has(license)) problems.push(`${pkg.name}: licence "${license ?? "none"}" isn't on the allowlist`);
    if (!file) problems.push(`${pkg.name}: no licence file to ship`);
    out.push({ name: pkg.name, version: pkg.version, license, text: file ? readFileSync(file, "utf8").trim() : "" });
  }
  return { packages: out, problems };
}

export function render(packages) {
  const rule = "-".repeat(78);
  const parts = [
    "Third-party software and assets in RipTide Tools",
    "",
    "RipTide's own code and brand: see LICENSE in https://github.com/DosukaSOL/RipTide (all rights reserved).",
    "Map art and place data have their own notices in the app (Help & feedback > About and credits)",
    "and in THIRD_PARTY_NOTICES.md.",
    "",
  ];
  for (const p of packages) parts.push(rule, `${p.name} ${p.version} (${p.license})`, rule, "", p.text, "");
  parts.push(rule, "Lucide icons (ISC; some icons MIT), bundled through react-icons", rule, "", readFileSync(here("lucide.txt"), "utf8").trim(), "");
  parts.push(rule, "DM Sans (fonts/DMSans.ttf)", rule, "", "Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts)", "", readFileSync(here("OFL-1.1.txt"), "utf8").trim(), "");
  parts.push(rule, "Anonymous Pro (fonts/AnonymousPro.ttf)", rule, "", readFileSync(here("AnonymousPro-OFL.txt"), "utf8").trim(), "");
  parts.push(
    rule,
    "TeX Gyre Adventor Bold (fonts/Adventor-Bold.otf, unmodified texgyreadventor-bold.otf)",
    rule,
    "",
    "Copyright 2007--2018 for TeX Gyre extensions by B. Jackowski, J.M. Nowacki et al. (on behalf of TeX Users Groups).",
    "Vietnamese characters were added by Han The Thanh. Distributed under the GUST Font License, an instance of the",
    "LaTeX Project Public License. Source: http://www.gust.org.pl/projects/e-foundry/tex-gyre/adventor",
    "",
    readFileSync(here("GUST-FONT-LICENSE.txt"), "utf8").trim(),
    "",
  );
  return parts.join("\n");
}

/** Called by build-studio.mjs with esbuild's metafile. */
export function writeLicenses(metafile, outFile) {
  const { packages, problems } = collect(Object.keys(metafile.inputs));
  if (problems.length) throw new Error(`Licence check failed:\n  ${problems.join("\n  ")}`);
  writeFileSync(outFile, render(packages));
  return packages;
}
