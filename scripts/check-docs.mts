/**
 * Guards the doc split.
 *
 * CLAUDE.md used to be 2,815 lines and was loaded in full before any work
 * started - and again into every subagent, since a subagent inherits the
 * project memory. The detail now lives in `docs/`, reached either from the
 * routing table in the root or from a nested `CLAUDE.md` stub that loads when
 * a tool touches that directory.
 *
 * That arrangement has three ways to rot silently, and this guards all three.
 * The root can grow back, because the same-commit rule has no counter-pressure
 * of its own. A doc can become unreachable, at which point it is a file nobody
 * will ever be shown. And an `@` import would quietly reinstate the whole cost,
 * because imports are expanded into the prompt at launch rather than on demand.
 *
 * A stub is a pointer. It carries no rules, because a rule in a stub is a rule
 * that only fires for one directory, which is how the same fact ends up in two
 * places saying different things.
 *
 * Stubs load *upward*: reading src/lib/draft/bots.ts pulls src/lib/draft/,
 * src/lib/ and every other ancestor that has one. Measured, and the reason a
 * stub over a subtree has to say it governs only its own files - without that,
 * one Read of a draft file arrived with nine doc pointers, seven of them about
 * auth, printings and card images. A stub that misroutes at that rate is worse
 * than no stub.
 *
 * Needs nothing. Runs in CI.
 *
 *   npm run check:docs
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative, resolve, sep } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const ROOT_DOC = join(REPO, "CLAUDE.md");
const DOCS_DIR = join(REPO, "docs");

/** The root is a router. Past this it has started holding detail again. */
const ROOT_MAX_LINES = 400;
/** A stub names its docs and stops. Past this it is holding a rule. */
const STUB_MAX_LINES = 12;

const SKIP_DIRS = new Set([".git", "node_modules", ".next", ".next-build", "dist"]);

const failures: string[] = [];
let checks = 0;

function expectTrue(what: string, value: boolean): void {
  checks += 1;
  if (!value) failures.push(what);
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function lineCount(text: string): number {
  return text.replace(/\n$/, "").split("\n").length;
}

/** Every CLAUDE.md in the repo: the root first, then the nested stubs. */
function findClaudeFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      findClaudeFiles(join(dir, entry.name), found);
    } else if (entry.name === "CLAUDE.md") {
      found.push(join(dir, entry.name));
    }
  }
  return found;
}

const claudeFiles = findClaudeFiles(REPO).sort();
const stubs = claudeFiles.filter((f) => f !== ROOT_DOC);
const rootText = read(ROOT_DOC);

// --- the root stays a router -------------------------------------------------
expectTrue(
  `CLAUDE.md is ${lineCount(rootText)} lines, over the ${ROOT_MAX_LINES} ceiling - move detail into docs/ rather than raising this`,
  lineCount(rootText) <= ROOT_MAX_LINES,
);

// --- no @ imports, anywhere --------------------------------------------------
// An import is expanded at launch, so it costs exactly what inlining the text
// would. Using one here would undo the split without looking like it had.
for (const file of claudeFiles) {
  const offenders = read(file)
    .split("\n")
    .filter((line) => /(^|\s)@[A-Za-z0-9._/-]+\.md\b/.test(line) && !line.trim().startsWith(">"));
  expectTrue(
    `${relative(REPO, file)} uses an @ import (${offenders[0]?.trim()}) - imports are inlined at launch, so link to the doc instead`,
    offenders.length === 0,
  );
}

// --- every doc is reachable --------------------------------------------------
const docFiles = readdirSync(DOCS_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort();
expectTrue("docs/ holds at least one document", docFiles.length > 0);

const allPointerText = claudeFiles.map(read).join("\n");
for (const doc of docFiles) {
  expectTrue(
    `docs/${doc} is not linked from the root routing table or any stub - an unreachable doc is one nobody is shown`,
    allPointerText.includes(`docs/${doc}`),
  );
}

// --- every relative link resolves -------------------------------------------
const LINK = /\[[^\]]*\]\(([^)]+)\)/g;
const linkSources = [...claudeFiles, ...docFiles.map((f) => join(DOCS_DIR, f))];
let linksChecked = 0;
for (const file of linkSources) {
  const text = read(file);
  for (const match of text.matchAll(LINK)) {
    const target = match[1];
    if (/^(https?:|#|mailto:)/.test(target)) continue;
    linksChecked += 1;
    const path = resolve(dirname(file), target.split("#")[0]);
    expectTrue(`${relative(REPO, file)} links to ${target}, which does not exist`, existsSync(path));
  }
}
expectTrue("the docs link to each other and to the code", linksChecked > 50);

// --- a stub is a pointer, not a rulebook ------------------------------------
for (const stub of stubs) {
  const text = read(stub);
  const rel = relative(REPO, stub).split(sep).join("/");
  expectTrue(
    `${rel} is ${lineCount(text)} lines, over the ${STUB_MAX_LINES} a pointer needs - put the rule in its doc`,
    lineCount(text) <= STUB_MAX_LINES,
  );
  expectTrue(`${rel} names no doc`, /docs\/[a-z-]+\.md/.test(text));
  // A stub that grew headings is a stub that grew content.
  expectTrue(`${rel} has headings, so it is holding content rather than pointing`, !/^#{1,6} /m.test(text));
}

// --- a stub over a subtree says so ------------------------------------------
// Ancestors fire too, so an unscoped parent stub sprays its docs over every
// read beneath it.
const stubDirs = stubs.map((f) => relative(REPO, dirname(f)).split(sep).join("/"));
for (const stub of stubs) {
  const dir = relative(REPO, dirname(stub)).split(sep).join("/");
  const hasDescendants = stubDirs.some((d) => d !== dir && d.startsWith(`${dir}/`));
  if (!hasDescendants) continue;
  expectTrue(
    `${dir}/CLAUDE.md sits above other stubs but does not say it governs only its own files - it will fire on every read beneath it`,
    read(stub).includes("governs the"),
  );
}

// --- the stubs point at directories that exist ------------------------------
for (const stub of stubs) {
  expectTrue(`${relative(REPO, stub)} is not in a directory`, statSync(dirname(stub)).isDirectory());
}

if (failures.length > 0) {
  console.error(`docs check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log(
    `docs check passed (${checks} cases: root ${lineCount(rootText)}/${ROOT_MAX_LINES} lines, ` +
      `${docFiles.length} docs, ${stubs.length} stubs, ${linksChecked} links)`,
  );
}
process.exit(failures.length > 0 ? 1 : 0);
