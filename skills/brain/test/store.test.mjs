import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeRemote, projectIdentity, projectKey, resolveStore } from "../lib/store.mjs";

function sandbox(t) {
  const base = mkdtempSync(join(tmpdir(), "brain-store-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return base;
}

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

test("normalizeRemote canonicalizes the common remote forms", () => {
  assert.equal(normalizeRemote("git@github.com:Owner/repo.git"), "github.com/Owner/repo");
  assert.equal(normalizeRemote("https://github.com/Owner/repo.git"), "github.com/Owner/repo");
  assert.equal(normalizeRemote("https://github.com/Owner/repo/"), "github.com/Owner/repo");
  assert.equal(normalizeRemote("ssh://git@gitlab.com:2222/group/repo.git"), "gitlab.com/group/repo");
  assert.equal(normalizeRemote("git://github.com/Owner/repo.git"), "github.com/Owner/repo");
  assert.equal(normalizeRemote("  "), "");
});

test("normalizeRemote keeps local path remotes absolute", () => {
  const dir = mkdtempSync(join(tmpdir(), "brain-remote-"));
  try {
    assert.equal(normalizeRemote(`${dir}/repo.git`), realpathSync(dir) + "/repo");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("projectKey is a readable slug plus 8 hex chars of sha256", () => {
  const key = projectKey("github.com/Owner/repo");
  assert.match(key, /^github-com-owner-repo-[0-9a-f]{8}$/);
  assert.equal(key, projectKey("github.com/Owner/repo"), "stable for the same identity");
  assert.notEqual(key, projectKey("github.com/Owner/other"));
});

test("resolveStore falls back to the absolute project path without git", (t) => {
  const base = sandbox(t);
  const project = join(base, "plain");
  mkdirSync(project, { recursive: true });
  const home = join(base, "brains");

  const resolved = resolveStore({ cwd: project, env: { BRAIN_HOME: home } });
  assert.equal(resolved.source, "path");
  assert.equal(resolved.identity, realpathSync(project));
  assert.equal(resolved.home, home);
  assert.equal(resolved.storeDir, join(resolved.home, resolved.key));
  assert.match(resolved.key, /-([0-9a-f]{8})$/);
});

test("resolveStore defaults BRAIN_HOME to ~/brain.md", (t) => {
  const base = sandbox(t);
  const project = join(base, "plain");
  mkdirSync(project, { recursive: true });
  const resolved = resolveStore({ cwd: project, env: {} });
  assert.ok(resolved.home.endsWith("/brain.md"), resolved.home);
});

test("git remote wins over the common dir", (t) => {
  const base = sandbox(t);
  const project = join(base, "repo");
  mkdirSync(project, { recursive: true });
  git(project, "init", "-q");
  git(project, "remote", "add", "origin", "git@github.com:Example/Brain.git");

  const identity = projectIdentity(project);
  assert.deepEqual(identity, { identity: "github.com/Example/Brain", source: "git-remote" });
});

test("without a remote, the absolute git common dir identifies the project", (t) => {
  const base = sandbox(t);
  const project = join(base, "repo");
  mkdirSync(project, { recursive: true });
  git(project, "init", "-q");
  mkdirSync(join(project, "src", "deep"), { recursive: true });

  const root = resolveStore({ cwd: project, env: { BRAIN_HOME: join(base, "brains") } });
  const nested = resolveStore({ cwd: join(project, "src", "deep"), env: { BRAIN_HOME: join(base, "brains") } });

  assert.equal(root.source, "git-common-dir");
  assert.equal(root.identity, realpathSync(join(project, ".git")));
  assert.equal(root.key, nested.key);
  assert.equal(root.storeDir, nested.storeDir);
});
