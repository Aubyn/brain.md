// Wiring the brain contract into Pi's global AGENTS.md.
//
// The memory lives outside the repo, so the instruction that keeps it in the
// loop is machine-level too: one marked block in `<agent-dir>/AGENTS.md`
// (default `~/.pi/agent/AGENTS.md`), applied across every working directory.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "./doc.mjs";

export const WIRE_BEGIN = "<!-- BEGIN brain.md -->";
export const WIRE_END = "<!-- END brain.md -->";

/** Pi's agent directory (overridable, as Pi itself allows). */
export function agentDir(env = process.env) {
  const configured = String(env.PI_CODING_AGENT_DIR ?? "").trim();
  return configured || join(homedir(), ".pi", "agent");
}

export function wirePath(env = process.env) {
  return join(agentDir(env), "AGENTS.md");
}

/** The CLI entry point as it will exist after `brain setup` links the skill. */
export function cliInvocation(env = process.env) {
  return join(agentDir(env), "skills", "brain", "bin", "brain.mjs");
}

export function wireBlock(env = process.env) {
  const cli = cliInvocation(env);
  return [
    WIRE_BEGIN,
    "## Project Brain",
    "",
    "Every project on this machine has a **Project Brain**: its durable decisions, constraints, and background, stored as plain Markdown **outside the repository**. It is located by project identity (git remote, then git common dir, then absolute path) under `$BRAIN_HOME` (default `~/brain.md`), never by a `brain/` directory in the repo.",
    "",
    "Use the globally installed `brain` skill for the full contract (`references/protocol.md`, `references/pages.md`). From the project root:",
    "",
    "```sh",
    `brain() { node "${cli}" "$@"; }`,
    "brain where         # store path for the current project",
    "brain init          # create this project's store (idempotent)",
    "```",
    "",
    "- **Start of a task:** load what already applies — `brain list-pages`, then `brain read-page <id>` / `brain read-root <slug>`. Prefer a narrow read over scanning everything.",
    "- **When a decision, requirement, constraint, or durable insight settles:** capture it immediately with `brain create-page`, `brain update-truth`, or `brain update-root`. Do not wait to be asked and do not batch it.",
    "- **Pure implementation with no new decision:** do not write to the brain.",
    "- **When overturning a previous conclusion:** `brain update-truth` and/or `brain append-timeline --kind reversal`; retire the page with `brain archive-page --id <id> --superseded-by <new-id>`.",
    "- **One page = one proposition.** `brain append-timeline` refuses past 30 timeline entries or 15 decision entries (`--force` overrides). Consolidate with `update-truth`, split the knowledge into a new page, or archive the old one.",
    "- Write compiled_truth, root pages, and every `--summary` in the user's working language. Keep ids, slugs, field names, and enum values as they are.",
    "- Only store what will still matter in six months and is hard to reconstruct from the code.",
    "- **Never hand-edit a brain file.** Every read and write goes through the CLI.",
    "",
    "If a project has no brain yet, run `brain init` from its root before relying on it.",
    WIRE_END,
  ].join("\n");
}

function countOccurrences(haystack, needle) {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) n += 1;
  return n;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Write or refresh the marked block. Returns { path, action }. */
export function wire(env = process.env) {
  const path = wirePath(env);
  const block = wireBlock(env);

  if (!existsSync(path)) {
    writeFileAtomic(path, `${block}\n`);
    return { path, action: "created" };
  }

  const current = readFileSync(path, "utf8");
  const begin = countOccurrences(current, WIRE_BEGIN);
  const end = countOccurrences(current, WIRE_END);
  if (begin !== end) {
    throw new Error(
      `${path} has a damaged brain block (${begin > end ? "BEGIN" : "END"} marker without its pair) — repair or remove the marker and re-run`,
    );
  }
  if (begin > 1) {
    throw new Error(`${path} has ${begin} brain blocks (duplicate BEGIN/END pairs) — leave a single pair and re-run`);
  }

  if (begin === 1) {
    const re = new RegExp(`${escapeRegExp(WIRE_BEGIN)}[\\s\\S]*?${escapeRegExp(WIRE_END)}`);
    if (!re.test(current)) throw new Error(`${path} has BEGIN/END markers but the brain block could not be matched`);
    writeFileAtomic(path, current.replace(re, () => block));
    return { path, action: "refreshed the block in" };
  }

  writeFileAtomic(path, `${current.replace(/\s*$/, "")}\n\n${block}\n`);
  return { path, action: "appended a block to" };
}

/** Remove the marked block. Returns { path, removed }. */
export function unwire(env = process.env) {
  const path = wirePath(env);
  if (!existsSync(path)) return { path, removed: false };

  const current = readFileSync(path, "utf8");
  const begin = countOccurrences(current, WIRE_BEGIN);
  const end = countOccurrences(current, WIRE_END);
  if (begin !== end) {
    throw new Error(
      `${path} has a damaged brain block (${begin > end ? "BEGIN" : "END"} marker without its pair) — repair it manually`,
    );
  }
  if (begin === 0) return { path, removed: false };
  if (begin > 1) throw new Error(`${path} has ${begin} brain blocks — remove the extras manually`);

  const re = new RegExp(`\\n*${escapeRegExp(WIRE_BEGIN)}[\\s\\S]*?${escapeRegExp(WIRE_END)}\\n*`);
  const next = current.replace(re, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\s*$/, "\n");
  if (next.trim()) writeFileAtomic(path, next);
  else writeFileAtomic(path, "");
  return { path, removed: true };
}
