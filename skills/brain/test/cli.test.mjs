import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLI = join(ROOT, "skills", "brain", "bin", "brain.mjs");

function sandbox(t) {
  const base = mkdtempSync(join(tmpdir(), "brain-cli-"));
  const box = {
    base,
    project: join(base, "project"),
    home: join(base, "home"),
    storeHome: join(base, "store"),
  };
  mkdirSync(box.project, { recursive: true });
  mkdirSync(box.home, { recursive: true });
  mkdirSync(box.storeHome, { recursive: true });
  box.agent = join(box.home, ".pi", "agent");
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return box;
}

function run(box, args, { input = "", cwd = box.project } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    input,
    env: {
      ...process.env,
      HOME: box.home,
      BRAIN_HOME: box.storeHome,
      PI_CODING_AGENT_DIR: box.agent,
    },
  });
}

function ok(box, args, opts) {
  const r = run(box, args, opts);
  assert.equal(r.status, 0, `brain ${args.join(" ")}\n${r.stdout}${r.stderr}`);
  return r;
}

function storeDir(box) {
  const r = ok(box, ["where"]);
  return r.stdout.match(/^store: (.+)$/m)[1];
}

function create(box, id, category = "decision") {
  ok(box, ["create-page", "--id", id, "--category", category, "--title", `Title ${id}`]);
}

test("init creates a project store outside the working tree", (t) => {
  const box = sandbox(t);
  const r = ok(box, ["init"]);
  const dir = storeDir(box);

  assert.match(r.stdout, /identity /);
  assert.ok(dir.startsWith(box.storeHome), dir);
  assert.ok(!dir.startsWith(box.project), "store must not live inside the project");
  assert.match(readFileSync(join(dir, "index.md"), "utf8"), /no pages yet/);
});

test("where reports the path fallback for a non-git project", (t) => {
  const box = sandbox(t);
  const r = ok(box, ["where"]);
  assert.match(r.stdout, /^source: path$/m);
  assert.match(r.stdout, /^exists: false$/m);
});

test("create, list, read, and update-truth", (t) => {
  const box = sandbox(t);
  ok(box, ["init"]);
  create(box, "markdown-over-sqlite");

  let list = ok(box, ["list-pages"]).stdout.trim().split("\n");
  assert.deepEqual(list[0].split("\t").slice(0, 5), ["markdown-over-sqlite", "decision", "active", "1", "1"]);

  assert.match(ok(box, ["read-page", "markdown-over-sqlite"]).stdout, /<!-- compiled_truth -->/);

  ok(box, ["update-truth", "--id", "markdown-over-sqlite", "--summary", "为什么改成 Markdown"], {
    input: "配置用 Markdown 存储，便于 diff。",
  });
  const page = ok(box, ["read-page", "markdown-over-sqlite"]).stdout;
  assert.match(page, /配置用 Markdown 存储/);
  assert.match(page, /为什么改成 Markdown/);

  list = ok(box, ["list-pages"]).stdout.trim().split("\n");
  assert.deepEqual(list[0].split("\t").slice(3, 5), ["2", "2"]);
});

test("create-page validates ids and categories", (t) => {
  const box = sandbox(t);
  ok(box, ["init"]);
  assert.equal(run(box, ["create-page", "--id", "Bad Id", "--category", "decision", "--title", "t"]).status, 1);
  assert.equal(run(box, ["create-page", "--id", "ok", "--category", "nope", "--title", "t"]).status, 1);
  create(box, "ok");
  assert.equal(run(box, ["create-page", "--id", "ok", "--category", "decision", "--title", "t"]).status, 1);
});

test("append-timeline stops at 30 entries; --force overrides", (t) => {
  const box = sandbox(t);
  ok(box, ["init"]);
  create(box, "capped");

  for (let i = 0; i < 29; i++) {
    ok(box, ["append-timeline", "--id", "capped", "--kind", "evidence", "--summary", `evidence ${i}`]);
  }
  assert.equal(ok(box, ["list-pages"]).stdout.trim().split("\t")[3], "30");

  const refused = run(box, ["append-timeline", "--id", "capped", "--kind", "evidence", "--summary", "one more"]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /30 timeline entries \(cap 30\)/);

  ok(box, ["append-timeline", "--id", "capped", "--kind", "evidence", "--summary", "forced", "--force"]);
  assert.equal(ok(box, ["list-pages"]).stdout.trim().split("\t")[3], "31");
});

test("append-timeline stops at 15 decisions", (t) => {
  const box = sandbox(t);
  ok(box, ["init"]);
  create(box, "decisions");
  for (let i = 0; i < 14; i++) {
    ok(box, ["update-truth", "--id", "decisions", "--summary", `rewrite ${i}`], { input: `truth ${i}` });
  }
  assert.deepEqual(ok(box, ["list-pages"]).stdout.trim().split("\t").slice(3, 5), ["15", "15"]);

  const refused = run(box, ["append-timeline", "--id", "decisions", "--kind", "evidence", "--summary", "more"]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /15 decision entries \(cap 15\)/);
});

test("update-truth is never capped", (t) => {
  const box = sandbox(t);
  ok(box, ["init"]);
  create(box, "rewritten");
  for (let i = 0; i < 20; i++) {
    ok(box, ["update-truth", "--id", "rewritten", "--summary", `consolidate ${i}`], { input: `truth ${i}` });
  }
  assert.deepEqual(ok(box, ["list-pages"]).stdout.trim().split("\t").slice(3, 5), ["21", "21"]);
});

test("archive-page turns the page into a read-only pointer", (t) => {
  const box = sandbox(t);
  ok(box, ["init"]);
  create(box, "old-decision");
  create(box, "new-decision");

  ok(box, [
    "archive-page",
    "--id", "old-decision",
    "--superseded-by", "new-decision",
    "--reason", "被新的方案取代",
  ]);

  const page = ok(box, ["read-page", "old-decision"]).stdout;
  assert.match(page, /^status: archived$/m);
  assert.match(page, /Superseded by \[\[new-decision\]\]/);
  assert.match(page, /被新的方案取代/);
  assert.doesNotMatch(page, /## Timeline/);

  for (const args of [
    ["update-truth", "--id", "old-decision"],
    ["append-timeline", "--id", "old-decision", "--kind", "note", "--summary", "x"],
    ["set-tags", "--id", "old-decision", "--tags", "a"],
    ["archive-page", "--id", "old-decision"],
  ]) {
    const r = run(box, args, { input: "new truth" });
    assert.equal(r.status, 1, `expected refusal for ${args[0]}`);
  }

  const missing = run(box, ["archive-page", "--id", "new-decision", "--superseded-by", "nope"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /does not exist/);
});

test("root pages are created on demand and lint-links catches broken references", (t) => {
  const box = sandbox(t);
  ok(box, ["init"]);
  ok(box, ["update-root", "architecture"], { input: "# Architecture\n\nRequests enter through the gateway.\n" });
  assert.match(ok(box, ["read-root", "architecture"]).stdout, /^title: Architecture$/m);

  create(box, "linked");
  ok(box, ["update-truth", "--id", "linked"], { input: "See [[architecture]] and [[missing-page]]." });

  const lint = run(box, ["lint-links"]);
  assert.equal(lint.status, 1);
  assert.match(lint.stderr, /\[\[missing-page\]\]/);
  assert.match(lint.stderr, /points at a root page slug/);
});
