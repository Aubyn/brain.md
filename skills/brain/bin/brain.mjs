#!/usr/bin/env node
// `brain` — the CLI of the brain.md project-memory layer.
//
// A project's memory lives OUTSIDE the repository, at
//   $BRAIN_HOME/<project-key>            (default ~/brain.md/<project-key>)
// where project-key is derived from the project's identity, not from the
// presence of a `brain/` directory. Run `brain where` from any directory of the
// project to see the resolved store.
//
// ALL reads and writes go through this CLI. There is no validator: frontmatter
// is always CLI-generated, and every compiled_truth rewrite appends its own
// timeline entry in the same atomic write. Never hand-edit a brain file.
//
// Subcommands
//   where                          resolved store + identity + counts
//   init                           create the store (idempotent)
//   list-pages / read-page <id>
//   read-root <slug>
//   create-page / update-truth / append-timeline / archive-page / set-tags
//   update-root <slug>
//   reindex / lint-links
//   setup / uninstall              link the skill into Pi + wire its global AGENTS.md
//   wire                           only refresh the global AGENTS.md block

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import {
  DECISION_CAP,
  PAGE_CATEGORIES,
  PAGE_STATUSES,
  ROOT_PAGE_META,
  ROOT_PAGE_SLUGS,
  TIMELINE_CAP,
  TIMELINE_HEADING,
  TIMELINE_KINDS,
  TRUTH_MARKER,
  appendTimeline,
  countDecisions,
  countTimeline,
  formatTimelineEntry,
  nowStamp,
  replaceTruth,
  setFrontmatterField,
  writeFileAtomic,
  yamlInlineArray,
  yamlScalar,
} from "../lib/doc.mjs";
import {
  indexPath,
  pagePath,
  pagesDir,
  resolveStore,
  rootPath,
} from "../lib/store.mjs";
import { listPages, lintLinks, loadDoc, reindex } from "../lib/brain.mjs";
import { unwire, wire } from "../lib/wire.mjs";
import { installSkill, skillTarget, uninstallSkill } from "../lib/install.mjs";

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

// ---- argument parsing -------------------------------------------------------

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function fail(msg) {
  console.error(`brain: ${msg}`);
  process.exit(1);
}

function requireFlag(flags, name) {
  const v = flags[name];
  if (v === undefined || v === true || String(v).trim() === "") fail(`missing required --${name}`);
  return String(v);
}

function optionalText(flags, name) {
  const v = flags[name];
  if (v === undefined) return "";
  if (v === true) fail(`--${name} requires a value`);
  const text = String(v).trim();
  if (!text) fail(`--${name} requires a non-empty value`);
  return text;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

// ---- store / page helpers ---------------------------------------------------

let cachedStore;
function store() {
  if (!cachedStore) cachedStore = resolveStore();
  return cachedStore;
}

function ensureStore() {
  const ctx = store();
  if (!existsSync(ctx.storeDir)) {
    fail(`no brain store for this project at ${ctx.storeDir} — run: brain init`);
  }
  return ctx;
}

function ensurePage(id) {
  const ctx = ensureStore();
  if (!ID_RE.test(id)) fail(`invalid page id "${id}" (use kebab-case: a-z 0-9 -)`);
  const path = pagePath(ctx.storeDir, id);
  if (!existsSync(path)) fail(`page "${id}" does not exist in ${ctx.storeDir}`);
  return loadDoc(path);
}

function assertWritable(doc) {
  if (String(doc.frontmatter.status || "active") === "archived") {
    fail(`page "${doc.id}" is archived (read-only) — write to the page that superseded it instead`);
  }
}

function pageContent(frontmatter, body) {
  return `---\n${frontmatter}\n---\n\n${String(body).trim()}\n`;
}

function writePage(path, frontmatter, body) {
  writeFileAtomic(path, pageContent(frontmatter, body));
}

function stampUpdated(rawFrontmatter, stamp) {
  return setFrontmatterField(rawFrontmatter, "updated", yamlScalar(stamp));
}

/** Timeline summaries are caller-authored; the CLI never invents a sentence. */
function summaryFromTruth(text) {
  for (const raw of String(text).split("\n")) {
    let line = raw.trim();
    if (!line || line.startsWith("<!--") || /^`{3,}/.test(line)) continue;
    line = line.replace(/^#{1,6}\s+/, "").trim();
    if (line) return line;
  }
  return "";
}

// ---- reads ------------------------------------------------------------------

function cmdWhere() {
  const ctx = store();
  const pages = listPages(ctx.storeDir);
  console.log(`store: ${ctx.storeDir}`);
  console.log(`home: ${ctx.home}`);
  console.log(`key: ${ctx.key}`);
  console.log(`identity: ${ctx.identity}`);
  console.log(`source: ${ctx.source}`);
  console.log(`exists: ${existsSync(ctx.storeDir)}`);
  console.log(`pages: ${pages.length}`);
}

function cmdListPages() {
  const ctx = ensureStore();
  const pages = listPages(ctx.storeDir);
  if (!pages.length) {
    console.log("(no pages yet)");
    return;
  }
  for (const doc of pages) {
    const fm = doc.frontmatter;
    console.log(
      [
        fm.id || doc.id,
        fm.category || "?",
        fm.status || "?",
        countTimeline(doc.body),
        countDecisions(doc.body),
        fm.title || "(untitled)",
      ].join("\t"),
    );
  }
}

function cmdReadPage(positional) {
  const id = positional[0];
  if (!id) fail("read-page needs a page id: brain read-page <id>");
  const doc = ensurePage(id);
  process.stdout.write(doc.raw);
}

function cmdReadRoot(positional) {
  const slug = positional[0];
  if (!slug) fail(`read-root needs a slug: brain read-root <slug> (one of ${ROOT_PAGE_SLUGS.join(", ")})`);
  if (!ROOT_PAGE_SLUGS.includes(slug)) fail(`invalid root slug "${slug}" (one of ${ROOT_PAGE_SLUGS.join(", ")})`);
  const ctx = ensureStore();
  const path = rootPath(ctx.storeDir, slug);
  if (!existsSync(path)) fail(`root page "${slug}" does not exist in ${ctx.storeDir}`);
  process.stdout.write(readFileSync(path, "utf8"));
}

// ---- project lifecycle ------------------------------------------------------

function cmdInit() {
  const ctx = store();
  mkdirSync(pagesDir(ctx.storeDir), { recursive: true });
  const { count } = reindex(ctx.storeDir);
  console.log(`brain: store ${ctx.storeDir}`);
  console.log(`brain: identity ${ctx.identity} (${ctx.source})`);
  console.log(`brain: index ${indexPath(ctx.storeDir)} (${count} pages)`);
  console.log("brain: seed real knowledge next (references/bootstrap.md), then maintain it while coding.");
}

// ---- page writes ------------------------------------------------------------

function cmdCreatePage(flags) {
  const ctx = ensureStore();
  const id = requireFlag(flags, "id");
  const category = requireFlag(flags, "category");
  const title = requireFlag(flags, "title");
  const status = flags.status ? String(flags.status) : "active";
  const source = flags.source ? String(flags.source) : "brain create-page";
  const summary = optionalText(flags, "summary") || title;
  const tags = flags.tags
    ? String(flags.tags).split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  if (!ID_RE.test(id)) fail(`invalid --id "${id}" (use kebab-case: a-z 0-9 -)`);
  if (!PAGE_CATEGORIES.includes(category)) fail(`invalid --category "${category}" (one of ${PAGE_CATEGORIES.join(" / ")})`);
  if (!PAGE_STATUSES.includes(status)) fail(`invalid --status "${status}" (one of ${PAGE_STATUSES.join(" / ")})`);
  if (existsSync(pagePath(ctx.storeDir, id))) fail(`page "${id}" already exists`);

  const stamp = nowStamp();
  const fm = [`id: ${id}`, `title: ${yamlScalar(title)}`, `category: ${category}`, `status: ${status}`];
  if (tags.length) fm.push(`tags: ${yamlInlineArray(tags)}`);
  fm.push(`created: ${yamlScalar(stamp)}`, `updated: ${yamlScalar(stamp)}`);

  const body = [
    TRUTH_MARKER,
    "",
    "<current best understanding — replace this with the real content>",
    "",
    TIMELINE_HEADING,
    "",
    formatTimelineEntry({ time: stamp, kind: "decision", summary, source, affects: [id] }),
  ].join("\n");

  writePage(pagePath(ctx.storeDir, id), fm.join("\n"), body);
  const { count } = reindex(ctx.storeDir);
  console.log(`brain: created page "${id}" (${count} pages) in ${ctx.storeDir}`);
}

async function cmdUpdateTruth(flags) {
  const id = requireFlag(flags, "id");
  const doc = ensurePage(id);
  assertWritable(doc);

  const source = flags.source ? String(flags.source) : "brain update-truth";
  const explicit = optionalText(flags, "summary");
  const newTruth = (await readStdin()).trim();
  if (!newTruth) fail("update-truth reads the new compiled_truth from stdin, but stdin was empty");
  const summary = explicit || summaryFromTruth(newTruth);
  if (!summary) fail("pass --summary; the new compiled_truth has no text line to use as a timeline summary");

  const stamp = nowStamp();
  let body = replaceTruth(doc.body, newTruth);
  body = appendTimeline(body, formatTimelineEntry({ time: stamp, kind: "decision", summary, source, affects: [id] }));
  writePage(pagePath(store().storeDir, id), stampUpdated(doc.rawFrontmatter, stamp), body);

  const { count } = reindex(store().storeDir);
  // Deliberately uncapped: rewriting the truth is how a page gets smaller again.
  console.log(`brain: rewrote compiled_truth and recorded the change on "${id}" (${count} pages)`);
}

function cmdAppendTimeline(flags) {
  const id = requireFlag(flags, "id");
  const kind = requireFlag(flags, "kind");
  const summary = requireFlag(flags, "summary");
  const source = flags.source ? String(flags.source) : "";
  const affects = flags.affects
    ? String(flags.affects).split(",").map((s) => s.trim()).filter(Boolean)
    : [id];
  if (!TIMELINE_KINDS.includes(kind)) fail(`invalid --kind "${kind}" (one of ${TIMELINE_KINDS.join(" / ")})`);

  const doc = ensurePage(id);
  assertWritable(doc);

  const entries = countTimeline(doc.body);
  const decisions = countDecisions(doc.body);
  if (!flags.force) {
    if (entries >= TIMELINE_CAP) {
      fail(
        `append-timeline refused: page "${id}" already has ${entries} timeline entries (cap ${TIMELINE_CAP}).\n` +
          "brain: consolidate with update-truth, split the knowledge into a new page, archive this one, or pass --force.",
      );
    }
    if (decisions >= DECISION_CAP) {
      fail(
        `append-timeline refused: page "${id}" already has ${decisions} decision entries (cap ${DECISION_CAP}).\n` +
          "brain: one page should carry one proposition — split it into new pages, archive it, or pass --force.",
      );
    }
  }

  const stamp = nowStamp();
  const body = appendTimeline(doc.body, formatTimelineEntry({ time: stamp, kind, summary, source, affects }));
  writePage(pagePath(store().storeDir, id), stampUpdated(doc.rawFrontmatter, stamp), body);

  const { count } = reindex(store().storeDir);
  console.log(`brain: appended a ${kind} entry to "${id}" (${count} pages)`);
}

function cmdArchivePage(flags) {
  const id = requireFlag(flags, "id");
  const supersededBy = flags["superseded-by"] ? String(flags["superseded-by"]).trim() : "";
  const reason = optionalText(flags, "reason");

  const doc = ensurePage(id);
  if (String(doc.frontmatter.status || "active") === "archived") fail(`page "${id}" is already archived`);

  const ctx = store();
  if (supersededBy) {
    if (!ID_RE.test(supersededBy)) fail(`invalid --superseded-by "${supersededBy}" (use kebab-case)`);
    if (supersededBy === id) fail("--superseded-by must point at a different page");
    if (!existsSync(pagePath(ctx.storeDir, supersededBy))) fail(`--superseded-by page "${supersededBy}" does not exist`);
  }

  const stamp = nowStamp();
  const pointer = [TRUTH_MARKER, "", `> Archived ${stamp.slice(0, 10)}.`];
  if (supersededBy) pointer.push(`> Superseded by [[${supersededBy}]].`);
  if (reason) pointer.push(">", ...reason.split("\n").map((line) => `> ${line}`.trimEnd()));

  let fm = setFrontmatterField(doc.rawFrontmatter, "status", "archived");
  fm = stampUpdated(fm, stamp);
  writePage(pagePath(ctx.storeDir, id), fm, pointer.join("\n"));

  const { count } = reindex(ctx.storeDir);
  console.log(
    `brain: archived "${id}" as a read-only pointer${supersededBy ? ` to "${supersededBy}"` : ""} (${count} pages)`,
  );
}

function cmdSetTags(flags) {
  const id = requireFlag(flags, "id");
  const tags = requireFlag(flags, "tags").split(",").map((s) => s.trim()).filter(Boolean);
  const doc = ensurePage(id);
  assertWritable(doc);

  const fm = stampUpdated(setFrontmatterField(doc.rawFrontmatter, "tags", yamlInlineArray(tags)), nowStamp());
  writePage(pagePath(store().storeDir, id), fm, doc.body);

  const { count } = reindex(store().storeDir);
  console.log(`brain: set tags on "${id}" to [${tags.join(", ")}] (${count} pages)`);
}

async function cmdUpdateRoot(positional) {
  const ctx = ensureStore();
  const slug = positional[0];
  if (!slug) fail("update-root needs a slug: brain update-root <slug>");
  if (!ROOT_PAGE_SLUGS.includes(slug)) fail(`invalid root slug "${slug}" (one of ${ROOT_PAGE_SLUGS.join(", ")})`);

  const body = (await readStdin()).replace(/^\uFEFF/, "").trim();
  if (!body) fail("update-root reads the page body from stdin, but stdin was empty");

  const title = body.split("\n", 1)[0].match(/^#\s+(.+?)\s*$/)?.[1]?.trim();
  if (!title) fail("update-root body must start with a Markdown H1 title: # Your title");
  if (title.length > 200) fail("update-root title must contain 1 to 200 characters");
  if (!hasMeaningfulRootContent(body)) fail("update-root body must contain meaningful content after its title");

  const frontmatter = [
    `slug: ${slug}`,
    `title: ${yamlScalar(title)}`,
    `role: ${yamlScalar(ROOT_PAGE_META[slug].role)}`,
    `updated: ${yamlScalar(nowStamp())}`,
  ].join("\n");
  writeFileAtomic(rootPath(ctx.storeDir, slug), pageContent(frontmatter, body));
  console.log(`brain: rewrote root page "${slug}" in ${ctx.storeDir}`);
}

function hasMeaningfulRootContent(body) {
  const remainder = body.split("\n").slice(1).join("\n").replace(/<!--[\s\S]*?-->/g, "");
  return remainder.split("\n").some((line) => {
    if (/^\s{0,3}#{1,6}\s+/.test(line) || /^\s*```/.test(line)) return false;
    const visible = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim();
    return Boolean(visible) && !/^(?:[-*_]\s*){3,}$/.test(visible);
  });
}

// ---- index / lint -----------------------------------------------------------

function cmdReindex() {
  const ctx = ensureStore();
  const { path, count } = reindex(ctx.storeDir);
  console.log(`reindex: wrote ${path} (${count} page${count === 1 ? "" : "s"})`);
}

function cmdLintLinks() {
  const ctx = ensureStore();
  const { broken, rootRefs, pageCount, rootCount } = lintLinks(ctx.storeDir);
  for (const r of rootRefs) {
    console.warn(`warn: ${r.from} -> [[${r.target}]] points at a root page slug; root pages are addressed by slug, not [[ ]].`);
  }
  if (!broken.length) {
    console.log(`lint-links: OK (${pageCount} pages, ${rootCount} root pages scanned, no broken links)`);
    return;
  }
  for (const b of broken) console.error(`error: ${b.from} -> [[${b.target}]] has no matching page`);
  console.error(`lint-links: ${broken.length} broken link${broken.length === 1 ? "" : "s"}`);
  process.exit(1);
}

// ---- machine-level setup ----------------------------------------------------

function cmdSetup({ noWire = false } = {}) {
  const installed = installSkill();
  console.log(`brain: ${installed.action} ${installed.target} -> ${installed.source}`);
  if (!noWire) {
    const wired = wire();
    console.log(`brain: ${wired.action} ${wired.path}`);
  }
  console.log(`brain: skill target ${skillTarget()}`);
  console.log("brain: in a project root run: brain init");
}

function cmdUninstall() {
  const removed = uninstallSkill();
  if (removed.action === "removed") console.log(`brain: removed ${removed.target}`);
  else console.log(`brain: no skill link at ${removed.target}`);
  const unwired = unwire();
  if (unwired.removed) console.log(`brain: removed the brain block from ${unwired.path}`);
  else console.log(`brain: no brain block in ${unwired.path}`);
  console.log("brain: project stores under $BRAIN_HOME were not touched.");
}

function cmdWire() {
  const wired = wire();
  console.log(`brain: ${wired.action} ${wired.path}`);
}

// ---- help / dispatch --------------------------------------------------------

const HELP = `brain — persistent project memory that lives outside the repo

Usage: brain <subcommand> [flags]
Run project commands from the project root; the store is resolved from the
project identity, never from a brain/ directory.

Reads:
  where                     resolved store, identity source, existence, page count
  list-pages                id / category / status / entries / decisions / title
  read-page <id>            print pages/<id>.md
  read-root <slug>          print <slug>.md

Project writes (correct-by-construction):
  init                      create this project's store (idempotent)
  create-page     --id <kebab> --category <cat> --title <t> [--summary s] [--tags a,b] [--status active] [--source s]
  update-truth    --id <kebab> [--summary s] [--source s]   (new compiled_truth on stdin; never capped)
  append-timeline --id <kebab> --kind <k> --summary s [--source s] [--affects a,b] [--force]
  archive-page    --id <kebab> [--superseded-by <kebab>] [--reason s]
  set-tags        --id <kebab> --tags a,b,c
  update-root     <slug>                                     (stdin body must start with # Title)

Index / checks:
  reindex                   rebuild index.md
  lint-links                verify [[page-id]] references resolve

Machine setup (Pi only; nothing is published to npm):
  setup [--no-wire]         link this skill into <agent-dir>/skills/brain and wire AGENTS.md
  uninstall                 remove that link and the wired block
  wire                      only refresh <agent-dir>/AGENTS.md (default ~/.pi/agent/AGENTS.md)

Caps (one page = one proposition):
  append-timeline refuses at ${TIMELINE_CAP} timeline entries or ${DECISION_CAP} decision entries.
  update-truth is never refused: rewriting the truth is how a page gets smaller again.
  Archived pages are read-only pointers and accept no writes.

Categories: ${PAGE_CATEGORIES.join(" / ")}
Statuses:   ${PAGE_STATUSES.join(" / ")}
Kinds:      ${TIMELINE_KINDS.join(" / ")}
Root slugs: ${ROOT_PAGE_SLUGS.join(" / ")}

Environment:
  BRAIN_HOME              store home (default ~/brain.md)
  PI_CODING_AGENT_DIR     Pi agent dir (default ~/.pi/agent)`;

async function main() {
  const [, , sub, ...rest] = process.argv;
  const { positional, flags } = parseArgs(rest);

  switch (sub) {
    case "where":
      return cmdWhere();
    case "list-pages":
      return cmdListPages();
    case "read-page":
      return cmdReadPage(positional);
    case "read-root":
      return cmdReadRoot(positional);
    case "init":
      return cmdInit();
    case "create-page":
      return cmdCreatePage(flags);
    case "update-truth":
      return cmdUpdateTruth(flags);
    case "append-timeline":
      return cmdAppendTimeline(flags);
    case "archive-page":
      return cmdArchivePage(flags);
    case "set-tags":
      return cmdSetTags(flags);
    case "update-root":
      return cmdUpdateRoot(positional);
    case "reindex":
      return cmdReindex();
    case "lint-links":
      return cmdLintLinks();
    case "wire":
      return cmdWire();
    case "setup":
      return cmdSetup({ noWire: Boolean(flags["no-wire"]) });
    case "uninstall":
      return cmdUninstall();
    case undefined:
    case "help":
    case "-h":
    case "--help":
      console.log(HELP);
      return;
    default:
      fail(`unknown subcommand "${sub}"\n\n${HELP}`);
  }
}

main().catch((e) => fail(e?.message || String(e)));
