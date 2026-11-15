---
name: brain
description: Maintain a project's persistent memory (the Project Brain) — durable decisions, constraints, background, and open questions kept as plain Markdown outside the repository, keyed by project identity. Use when starting work on a project (recall what was already decided), when a decision or constraint settles (write it down), when seeding a brain for a new or existing project, when digesting a document or conversation into project knowledge, or when installing and wiring the brain CLI.
---

# brain

A project's durable knowledge — the decisions, constraints, background, and reasoning
that will still matter in six months — belongs in its **Project Brain**. The brain is
plain Markdown, but it does **not** live in the repository: it is stored by project
identity under `$BRAIN_HOME/<project-key>` (default `~/brain.md/<project-key>`), so the
same project keeps the same memory across checkouts, worktrees, agents, and machines.

Everything goes through one zero-dependency Node CLI. There is no validator, because
the CLI is the only writer: frontmatter is always generated, and a compiled_truth
rewrite can never happen without its timeline entry.

## Invoke the CLI

The CLI ships in this skill at `bin/brain.mjs`. Run it from the **project root**:

```sh
brain() { node "<this skill directory>/bin/brain.mjs" "$@"; }
brain where      # resolved store + project identity
```

`<this skill directory>` is the directory containing this `SKILL.md`. A shell
function is portable across bash and zsh; `VAR="node …"; $VAR` is not.

## Which reference to read

| file | read it when |
|---|---|
| `references/protocol.md` | always read once: storage, identity, page model, caps, writing rules |
| `references/pages.md` | before creating or modifying any page: categories, ids, exact flags |
| `references/setup.md` | installing this skill, wiring Pi's global `AGENTS.md`, creating a store |
| `references/bootstrap.md` | seeding a brain from code / docs / `git log`, or interviewing the user |
| `references/ingest.md` | turning a conversation, document, or research result into pages |

## Non-negotiable rules

- **Never hand-edit a brain file.** Every read and write is a `brain` subcommand.
  Nothing at the file layer can catch a bad manual edit, and there is no validator.
- **One page = one proposition.** `append-timeline` refuses past **30 timeline
  entries** or **15 decision entries** (pass `--force` only when you deliberately
  override). When a page is full: consolidate it with `update-truth`, split the
  knowledge into new pages, or archive it.
- **`update-truth` is never capped.** Rewriting the compiled_truth is how a page gets
  smaller again; it always appends exactly one `decision` entry in the same atomic write.
- **Archived pages are read-only pointers.** `archive-page --id X --superseded-by Y`
  replaces the body with a pointer to `[[Y]]`; afterwards no write command accepts `X`.
- **Write in the user's working language** — compiled_truth, root pages, and every
  `--summary`. Keep ids, slugs, field names, and enum values exactly as specified.
- **Store only what outlives the code.** If the answer is readable from the source or
  `git log`, leave it there.

## First moves in a project

```sh
brain where     # does this project already have a store, and where?
brain init      # create it (idempotent) — only when it does not exist
brain list-pages
```

If the store exists but is empty, read `references/bootstrap.md` and seed it. If the
project has no `brain` CLI installed for Pi yet, read `references/setup.md`.
