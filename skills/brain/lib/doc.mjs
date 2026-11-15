// Document primitives for brain pages: a tiny frontmatter dialect, the two
// canonical sections (`<!-- compiled_truth -->` and `## Timeline`), timeline
// entry counting (the caps that enforce "one page = one proposition"), and
// atomic writes.
//
// There is deliberately no legacy-format support: a page that does not carry
// the canonical markers is treated as corrupt, not silently upgraded.

import { renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** The six page categories. */
export const PAGE_CATEGORIES = ["project", "concept", "decision", "person", "organization", "reference"];

/** Allowed page lifecycle statuses. */
export const PAGE_STATUSES = ["active", "draft", "archived"];

/** Timeline entry kinds. */
export const TIMELINE_KINDS = ["decision", "evidence", "reversal", "note"];

/** A page stops accepting appends at these counts (update-truth is never blocked). */
export const TIMELINE_CAP = 30;
export const DECISION_CAP = 15;

/** The six fixed root-page slots and their semantic role. */
export const ROOT_PAGE_META = {
  background: { role: "project background" },
  architecture: { role: "system architecture" },
  flow: { role: "key flows" },
  mindmap: { role: "feature mindmap" },
  stack: { role: "tech-stack choices" },
  roadmap: { role: "milestones" },
};

/** The six fixed root page slugs (ordered). */
export const ROOT_PAGE_SLUGS = Object.keys(ROOT_PAGE_META);

export const TRUTH_MARKER = "<!-- compiled_truth -->";
export const TIMELINE_HEADING = "## Timeline";

// ---- frontmatter ------------------------------------------------------------

/** Split a raw markdown file into { frontmatter (raw), body }. */
export function splitFrontmatter(raw) {
  if (!raw.startsWith("---")) return { frontmatter: null, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: null, body: raw };
  const lineEnd = raw.indexOf("\n", end + 1);
  return {
    frontmatter: raw.slice(raw.indexOf("\n") + 1, end),
    body: lineEnd === -1 ? "" : raw.slice(lineEnd + 1),
  };
}

/** Parse the flat `key: value` / `key: [a, b]` subset used by brain headers. */
export function parseFrontmatter(raw) {
  const out = {};
  for (const line of String(raw ?? "").split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const value = m[2].trim();
    out[m[1]] = value.startsWith("[") && value.endsWith("]")
      ? value.slice(1, -1).split(",").map((s) => unquote(s.trim())).filter(Boolean)
      : unquote(value);
  }
  return out;
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

/** Render a scalar, quoting when needed. */
export function yamlScalar(value) {
  const s = String(value);
  if (s === "") return '""';
  if (/^[A-Za-z0-9 _./-]+$/.test(s) && !/^\s|\s$/.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Render an inline array `[a, b, c]`. */
export function yamlInlineArray(items) {
  return `[${items.map((i) => String(i).trim()).filter(Boolean).join(", ")}]`;
}

/** Set (or append) one `key: value` line. `value` must already be rendered. */
export function setFrontmatterField(rawFrontmatter, key, value) {
  const re = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*.*$`);
  const lines = String(rawFrontmatter ?? "").split("\n");
  let found = false;
  const out = lines.map((line) => {
    if (!found && re.test(line)) {
      found = true;
      return `${key}: ${value}`;
    }
    return line;
  });
  if (!found) {
    while (out.length && out[out.length - 1].trim() === "") out.pop();
    out.push(`${key}: ${value}`);
  }
  return out.join("\n");
}

// ---- sections ---------------------------------------------------------------

function truthMarkerEnd(body) {
  const m = /^<!--\s*compiled_truth\s*-->[ \t]*$/m.exec(body);
  return m ? m.index + m[0].length : -1;
}

function timelineHeadingStart(body, after) {
  const re = /^##[ \t]+Timeline[ \t]*$/gm;
  re.lastIndex = after;
  const m = re.exec(body);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

/** Body layout check + offsets, or null when the page is not canonical. */
export function sectionOffsets(body) {
  const truthEnd = truthMarkerEnd(body);
  if (truthEnd === -1) return null;
  const timeline = timelineHeadingStart(body, truthEnd);
  if (!timeline) return null;
  return { truthEnd, timelineStart: timeline.start, timelineEnd: timeline.end };
}

/** Current compiled_truth text, or null when the markers are missing. */
export function extractTruth(body) {
  const offsets = sectionOffsets(body);
  if (!offsets) return null;
  return body.slice(offsets.truthEnd, offsets.timelineStart).trim();
}

/** Timeline section text (entries only), or "" when absent. */
export function extractTimeline(body) {
  const offsets = sectionOffsets(body);
  if (!offsets) return "";
  return body.slice(offsets.timelineEnd).trim();
}

/** Replace compiled_truth wholesale, leaving the timeline untouched. */
export function replaceTruth(body, text) {
  const offsets = sectionOffsets(body);
  if (!offsets) throw new Error("page is missing the canonical `<!-- compiled_truth -->` / `## Timeline` sections");
  const head = body.slice(0, offsets.truthEnd).replace(/\s+$/, "");
  const tail = body.slice(offsets.timelineStart);
  return `${head}\n\n${String(text).trim()}\n\n${tail}`;
}

/** Append one formatted entry to the end of the timeline. */
export function appendTimeline(body, entry) {
  const offsets = sectionOffsets(body);
  if (!offsets) throw new Error("page is missing the canonical `<!-- compiled_truth -->` / `## Timeline` sections");
  const before = body.slice(0, offsets.timelineStart).replace(/\s+$/, "");
  const existing = body.slice(offsets.timelineEnd).trim();
  return `${before}\n\n${TIMELINE_HEADING}\n\n${existing ? `${existing}\n\n` : ""}${String(entry).trim()}\n`;
}

/** Parse timeline entries as arrays of lines. */
export function timelineEntries(body) {
  const entries = [];
  let current = null;
  for (const line of extractTimeline(body).split("\n")) {
    if (/^-\s+\S/.test(line)) {
      if (current) entries.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) entries.push(current);
  return entries;
}

export function entryKind(entryLines) {
  const m = /^\s{2,}kind:\s*(\S+)/m.exec(entryLines.join("\n"));
  return m ? m[1] : "";
}

export function countTimeline(body) {
  return timelineEntries(body).length;
}

export function countDecisions(body) {
  return timelineEntries(body).filter((e) => entryKind(e) === "decision").length;
}

/** Format a timeline entry from fields. */
export function formatTimelineEntry({ time, kind, summary, source, affects }) {
  const lines = [`- time: ${time}`, `  kind: ${kind}`, `  summary: ${yamlScalar(summary)}`];
  if (source) lines.push(`  source: ${yamlScalar(source)}`);
  if (affects && affects.length) lines.push(`  affects: [${affects.join(", ")}]`);
  return lines.join("\n");
}

// ---- misc -------------------------------------------------------------------

const pad2 = (n) => String(n).padStart(2, "0");

/** `YYYY-MM-DDTHH:MM:SS` local-time stamp. */
export function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Atomic write: sibling temp file + rename. */
export function writeFileAtomic(path, content) {
  const tmp = join(dirname(path), `.${basename(path)}.tmp-${process.pid}`);
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}
