import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLI = join(ROOT, "skills", "brain", "bin", "brain.mjs");

function sandbox(t) {
  const base = mkdtempSync(join(tmpdir(), "brain-install-"));
  const box = { base, home: join(base, "home"), agent: join(base, "agent") };
  mkdirSync(box.home, { recursive: true });
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return box;
}

function run(box, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: box.base,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: box.home,
      PI_CODING_AGENT_DIR: box.agent,
      BRAIN_HOME: join(box.base, "store"),
    },
  });
}

function agentsFile(box) {
  return join(box.agent, "AGENTS.md");
}

test("setup links the skill into Pi's agent dir and wires AGENTS.md", (t) => {
  const box = sandbox(t);
  const r = run(box, ["setup"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const link = join(box.agent, "skills", "brain");
  assert.ok(lstatSync(link).isSymbolicLink());
  assert.ok(existsSync(join(link, "SKILL.md")));

  const wired = readFileSync(agentsFile(box), "utf8");
  assert.match(wired, /<!-- BEGIN brain\.md -->/);
  assert.match(wired, /<!-- END brain\.md -->/);
  assert.ok(wired.includes(join(box.agent, "skills", "brain", "bin", "brain.mjs")));
  assert.match(wired, /one page = one proposition/i);

  // Re-running is idempotent: one block, same link.
  assert.equal(run(box, ["setup"]).status, 0);
  const again = readFileSync(agentsFile(box), "utf8");
  assert.equal(again.match(/<!-- BEGIN brain\.md -->/g).length, 1);
  assert.equal(again, wired);
});

test("setup preserves existing AGENTS.md content and --no-wire skips wiring", (t) => {
  const box = sandbox(t);
  mkdirSync(box.agent, { recursive: true });
  writeFileSync(agentsFile(box), "# My rules\n\nBe nice.\n");

  assert.equal(run(box, ["setup", "--no-wire"]).status, 0);
  assert.equal(readFileSync(agentsFile(box), "utf8"), "# My rules\n\nBe nice.\n");

  assert.equal(run(box, ["wire"]).status, 0);
  const wired = readFileSync(agentsFile(box), "utf8");
  assert.ok(wired.startsWith("# My rules\n\nBe nice.\n"));
  assert.match(wired, /# Project Brain/);
});

test("uninstall removes only the link and the block", (t) => {
  const box = sandbox(t);
  mkdirSync(box.agent, { recursive: true });
  writeFileSync(agentsFile(box), "# My rules\n\nBe nice.\n");
  assert.equal(run(box, ["setup"]).status, 0);

  const r = run(box, ["uninstall"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(join(box.agent, "skills", "brain")), false);
  assert.equal(readFileSync(agentsFile(box), "utf8"), "# My rules\n\nBe nice.\n");

  // Nothing to remove is not an error.
  assert.equal(run(box, ["uninstall"]).status, 0);
});

test("setup refuses to overwrite a real directory", (t) => {
  const box = sandbox(t);
  mkdirSync(join(box.agent, "skills", "brain"), { recursive: true });

  const r = run(box, ["setup"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not a symlink/);
});
