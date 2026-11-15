# Ingest

Turning scattered input — a conversation conclusion, an external document, a piece of
research, the reasoning behind a set of code changes — into durable brain knowledge,
in the right place and the right structure.

Reach for this whenever knowledge crystallizes, not only when asked to "ingest"
something. The brain is the project's persistent memory, so capturing a settled
decision as it surfaces is part of normal work.

Command details and the taxonomy live in `references/pages.md`. Never hand-edit a brain
file.

## 1. Break the input down

Split it into **atomic knowledge points**: one judgment, fact, or decision that stands
on its own. Drop procedural chatter, restatements, and anything that will not matter in
six months.

## 2. Place each point

- Changes positioning / architecture / stack / roadmap → rewrite the matching root page
  with `brain update-root <slug>` (stdin body starting with `# Title`).
- About one entity (decision / concept / person / organization / reference / project) →
  create or update a page.
- Often both — write both sides.

## 3. Create or update?

```sh
brain list-pages
brain read-page <likely-id>
```

- **Found** → `update-truth` when the understanding changes (it records the change
  atomically), or `append-timeline` for new evidence that does not change the
  conclusion.
- **Not found** → `create-page`, then fill the real understanding with `update-truth`.
- **Full page** (30 entries / 15 decisions) → consolidate with `update-truth`, split the
  topic into a new page, or archive the old one with `--superseded-by`.
- **Avoid duplication** — one topic should not sprawl across several pages.

## 4. Write

- All writes through the CLI; never hand-edit frontmatter or timelines.
- Root pages are rewritten wholesale by `update-root`; they have no timeline and start
  with `# Title`.
- Write bodies in the user's working language; pass `--summary` in that language too.
  Keep ids, slugs, field names, and enum values verbatim.
- Connect related pages with `[[page-id]]`.

## 5. Verify (optional)

```sh
brain lint-links
```

The CLI reindexes on every write, and correctness is guaranteed by construction. The
only way to break it is a manual edit, which is why you never make one.

## Principles

- **Prefer less but accurate.** If it is readable from the code or `git log`, leave it
  there.
- **Every truth rewrite carries its own trace** — `update-truth` guarantees it.
- **One page, one proposition.** A page that needs a 31st timeline entry is telling you
  to split or consolidate it.
