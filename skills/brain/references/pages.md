# Pages

Everything about authoring pages: the category taxonomy, id conventions, and the exact
flags of each write command. Read `references/protocol.md` first for the page model and
the caps.

Assume, from the project root:

```sh
brain() { node "<this skill directory>/bin/brain.mjs" "$@"; }
```

## Categories

`category` must be one of these six:

| category | boundary — what belongs here | typical compiled_truth |
|---|---|---|
| `project` | A concrete piece of work with a goal, scope, and an end ("will this be done?"); dated progress belongs in the timeline | goal, scope, current status, constraints |
| `concept` | A concept, term, mechanism, or unfinished idea; the deliberate home for durable knowledge that fits nowhere else | definition or proposition, why it matters, boundaries, counter-examples |
| `decision` | An established judgment and its reasoning (the most common) | what was decided, alternatives, rationale, blast radius |
| `person` | A relevant person or role, their preferences and responsibilities | who they are, what they care about, collaboration conventions |
| `organization` | A company, school, foundation, government body, standards body, or internal team | what it is, relationship to this work, linked people/decisions/pages |
| `reference` | An external resource or object of analysis worth keeping | what it is, key takeaways, links, implications for this project |

Use a `company` tag to narrow an organization that is specifically a company; it is a
tag, not a category. When in doubt, most knowledge lands in `decision` or `concept`.

`status` is `active` / `draft` / `archived`. Day to day, look at `active` pages;
include `draft` / `archived` only when asked or when tracing history.

## Ids

- kebab-case, semantically clear: `markdown-over-sqlite`, `auth-flow`.
- The id must equal the filename (`pages/<id>.md`); the CLI enforces this.
- Ids referenced via `[[id]]` should stay stable. Renaming means writing the new page,
  archiving the old one with `--superseded-by`, and running `lint-links`.

## Creating a page

```sh
brain create-page --id <kebab-id> --category <cat> --title "<one line>" \
  [--summary "<creation note, in the user's working language>"] \
  [--tags a,b] [--status active] [--source "<provenance>"]
```

Writes frontmatter + `<!-- compiled_truth -->` with a placeholder + `## Timeline`
seeded with one `kind: decision` entry, then reindexes. Fill the real understanding
next with `update-truth` — a page whose truth is still the placeholder is unfinished.

## Rewriting the understanding

```sh
printf '%s\n' "<new compiled_truth markdown>" | brain update-truth --id <id> \
  --summary "<what changed and why>" [--source "<provenance>"]
```

Reads the new truth from **stdin**, replaces the compiled_truth section, appends one
`kind: decision` entry, and bumps `updated` — all in one atomic write. There is no cap
here: this is the command that makes a full page small again.

Pass `--summary` whenever the first line of the new truth would not explain the change.
Do not put a top-level `## Timeline` heading inside the new truth — it delimits the
timeline section.

## Appending provenance

```sh
brain append-timeline --id <id> --kind <decision|evidence|reversal|note> \
  --summary "<one line>" [--source "<provenance>"] [--affects a,b] [--force]
```

Adds to the end of the timeline only. Refused once the page holds 30 entries or 15
decisions (`--force` overrides). Use:

- `evidence` — new support for the current understanding;
- `reversal` — a previous conclusion was overturned;
- `note` — context that is not a decision or evidence.

## Archiving

```sh
brain archive-page --id <id> [--superseded-by <new-id>] [--reason "<why>"]
```

The body becomes a read-only pointer (`> Superseded by [[new-id]].` plus the reason)
and `status` becomes `archived`. All write commands refuse archived pages afterwards.
`--superseded-by` must name an existing, different page.

## Tags

```sh
brain set-tags --id <id> --tags a,b,c
```

## Root pages

```sh
brain update-root <slug>     # body on stdin, must start with "# Title"
```

Slugs: `background`, `architecture`, `flow`, `mindmap`, `stack`, `roadmap`. The slot is
created by the first write. Frontmatter is regenerated; the H1 supplies the title.
Include meaningful content after the heading. Root pages have no timeline and are not
capped.

## List, index, links

```sh
brain list-pages   # id  category  status  entries  decisions  title
brain reindex      # rebuild index.md
brain lint-links   # every [[page-id]] resolves
```

Reference other pages only as `[[page-id]]`. Do not wrap root slugs, file paths,
ordinary words, or uncertain entities in `[[ ]]`. `lint-links` lints page
compiled_truth and root page bodies; timeline entries are provenance and are skipped.
