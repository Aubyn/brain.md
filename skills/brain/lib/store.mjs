// Where a project's brain lives.
//
// A brain is NOT stored inside the repository. It is located by project
// identity under $BRAIN_HOME (default ~/brain.md), so the same project keeps
// the same memory no matter which directory you run from, whether the checkout
// was cloned fresh, or whether the project is a git repository at all.
//
//   store = $BRAIN_HOME/<project-key>
//
// The project key falls back through three identities:
//   1. git remote (normalized)          source: git-remote
//   2. git absolute common dir          source: git-common-dir
//   3. project absolute path            source: path
// and is `<readable-slug>-<sha256(identity)[0..8]>`.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Directory name used under $HOME when BRAIN_HOME is not set. */
export const DEFAULT_HOME_DIR = "brain.md";

/** `~` / `~/x` expansion (Node does not do it for us). */
function expandHome(p) {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return join(homedir(), p.slice(2));
  return p;
}

/** Resolve $BRAIN_HOME: env override, else `~/brain.md`; always absolute. */
export function brainHome(env = process.env, cwd = process.cwd()) {
  const configured = String(env.BRAIN_HOME ?? "").trim();
  const base = configured ? expandHome(configured) : join(homedir(), DEFAULT_HOME_DIR);
  return isAbsolute(base) ? resolve(base) : resolve(cwd, base);
}

function realpathOrSelf(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

function runGit(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function stripGitSuffix(p) {
  return String(p).replace(/\/+$/, "").replace(/\.git$/i, "").replace(/\/+$/, "");
}

function joinHost(host, path) {
  const clean = stripGitSuffix(path).replace(/^\/+/, "");
  return clean ? `${host}/${clean}` : host;
}

/**
 * Normalize a git remote URL into a stable identity string.
 *   git@github.com:owner/repo.git        -> github.com/owner/repo
 *   https://github.com/owner/repo.git    -> github.com/owner/repo
 *   ssh://git@host:2222/owner/repo.git   -> host/owner/repo
 *   /srv/git/repo.git                    -> /srv/git/repo
 * Empty/unparseable input returns "".
 */
export function normalizeRemote(raw) {
  const input = String(raw ?? "").trim();
  if (!input) return "";

  if (/^file:\/\//i.test(input)) {
    try {
      return stripGitSuffix(realpathOrSelf(fileURLToPath(input)));
    } catch {
      return "";
    }
  }

  if (input.includes("://")) {
    let url;
    try {
      url = new URL(input);
    } catch {
      return "";
    }
    return joinHost(url.hostname.toLowerCase(), url.pathname);
  }

  // scp-like `[user@]host:path` (but never a Windows drive letter or a plain path)
  if (!/^[A-Za-z]:[\\/]/.test(input) && /^(?:[^@/:]+@)?[^/:]+:/.test(input)) {
    const colon = input.indexOf(":");
    let host = input.slice(0, colon);
    const at = host.indexOf("@");
    if (at !== -1) host = host.slice(at + 1);
    return joinHost(host.toLowerCase(), input.slice(colon + 1));
  }

  // Local path remote: keep it absolute so it never collides with a URL identity.
  const abs = isAbsolute(input) ? input : resolve(process.cwd(), input);
  return stripGitSuffix(realpathOrSelf(abs));
}

/** `<slug>-<hash8>`, where hash8 = sha256(identity)[0..8]. */
export function projectKey(identity) {
  const hash = createHash("sha256").update(identity).digest("hex").slice(0, 8);
  const slug = String(identity)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug ? `${slug}-${hash}` : hash;
}

function firstRemote(cwd) {
  const names = runGit(cwd, ["remote"]).split("\n").map((s) => s.trim()).filter(Boolean);
  if (!names.length) return "";
  const name = names.includes("origin") ? "origin" : names.sort()[0];
  return runGit(cwd, ["remote", "get-url", name]);
}

function gitCommonDir(cwd) {
  const absolute = runGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (absolute) return realpathOrSelf(absolute);
  const relative = runGit(cwd, ["rev-parse", "--git-common-dir"]);
  if (!relative) return "";
  return realpathOrSelf(isAbsolute(relative) ? relative : resolve(cwd, relative));
}

/** Resolve the project identity, with the three-level fallback. */
export function projectIdentity(cwd = process.cwd()) {
  const normalized = normalizeRemote(firstRemote(cwd));
  if (normalized) return { identity: normalized, source: "git-remote" };

  const common = gitCommonDir(cwd);
  if (common) return { identity: common, source: "git-common-dir" };

  return { identity: realpathOrSelf(resolve(cwd)), source: "path" };
}

/** Resolve { home, key, identity, source, storeDir } for a working directory. */
export function resolveStore({ cwd = process.cwd(), env = process.env } = {}) {
  const home = brainHome(env, cwd);
  const { identity, source } = projectIdentity(cwd);
  const key = projectKey(identity);
  return { home, key, identity, source, storeDir: join(home, key) };
}

// ---- store layout -----------------------------------------------------------

export function pagesDir(storeDir) {
  return join(storeDir, "pages");
}

export function indexPath(storeDir) {
  return join(storeDir, "index.md");
}

export function pagePath(storeDir, id) {
  return join(pagesDir(storeDir), `${id}.md`);
}

export function rootPath(storeDir, slug) {
  return join(storeDir, `${slug}.md`);
}

export function storeExists(storeDir) {
  return existsSync(storeDir);
}
