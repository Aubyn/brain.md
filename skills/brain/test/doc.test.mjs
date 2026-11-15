import test from "node:test";
import assert from "node:assert/strict";
import {
  appendTimeline,
  countDecisions,
  countTimeline,
  extractTruth,
  formatTimelineEntry,
  parseFrontmatter,
  replaceTruth,
  setFrontmatterField,
  yamlScalar,
} from "../lib/doc.mjs";

const entry = (kind, summary) =>
  formatTimelineEntry({ time: "2026-01-01T00:00:00", kind, summary, source: "test", affects: ["x"] });

function page(truth, entries) {
  return [
    "<!-- compiled_truth -->",
    "",
    truth,
    "",
    "## Timeline",
    "",
    entries.join("\n\n"),
    "",
  ].join("\n");
}

test("frontmatter round-trips scalars and inline arrays", () => {
  const raw = ["id: x", `title: ${yamlScalar("Use X: over Y")}`, "tags: [a, b]", "status: active"].join("\n");
  const fm = parseFrontmatter(raw);
  assert.equal(fm.id, "x");
  assert.equal(fm.title, "Use X: over Y");
  assert.deepEqual(fm.tags, ["a", "b"]);
  assert.equal(fm.status, "active");
});

test("setFrontmatterField replaces in place and appends when absent", () => {
  const raw = "id: x\nstatus: active";
  assert.equal(setFrontmatterField(raw, "status", "archived"), "id: x\nstatus: archived");
  assert.equal(setFrontmatterField(raw, "updated", "now"), "id: x\nstatus: active\nupdated: now");
});

test("compiled_truth can be rewritten without touching the timeline", () => {
  const body = page("old truth", [entry("decision", "created")]);
  const next = replaceTruth(body, "new truth\n\nwith detail");
  assert.equal(extractTruth(next), "new truth\n\nwith detail");
  assert.equal(countTimeline(next), 1);
  assert.match(next, /created/);
});

test("appendTimeline adds at the end and counts kinds", () => {
  let body = page("truth", [entry("decision", "created")]);
  body = appendTimeline(body, entry("evidence", "benchmark"));
  body = appendTimeline(body, entry("decision", "changed mind"));
  assert.equal(countTimeline(body), 3);
  assert.equal(countDecisions(body), 2);
  assert.ok(body.indexOf("changed mind") > body.indexOf("benchmark"));
});

test("a non-canonical page is rejected rather than silently upgraded", () => {
  const legacy = "## compiled_truth\n\nold\n\n## timeline\n\n- time: x\n";
  assert.equal(extractTruth(legacy), null);
  assert.throws(() => replaceTruth(legacy, "x"), /canonical/);
  assert.throws(() => appendTimeline(legacy, entry("note", "x")), /canonical/);
});
