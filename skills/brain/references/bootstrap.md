# Bootstrap

Seeding an empty store with real project knowledge for the first time. The goal is the
bridge between "a store exists" and "the store is worth reading".

Gather information by reasoning over the project itself — code, docs, `git log` — or by
interviewing the user, but never write the brain by hand. Every landing is a `brain`
subcommand.

## Step 0 — pick the mode

- **Brownfield** — substantial source code and/or real git history. There is something
  to read.
- **Greenfield** — a near-empty repo with little or no history. There is nothing to
  read; interview the user.

When mixed, infer what you can from the code and interview for the rest.

## Brownfield — synthesize

Three sources, synthesized rather than transcribed:

1. **Code** — directory layout, module boundaries, entry points, dependencies
   (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, …). Strongest evidence for
   `architecture` and `stack`.
2. **Docs** — README, `docs/`, `CONTRIBUTING`, design notes. Stated intent and naming.
3. **`git log`** — `git log --oneline -n 200`, spot-read full messages for turning
   points. Mine real decisions, not a changelog.

Draft only the root pages the evidence supports:

```sh
printf '%s\n' "# Architecture

## Overview

Requests enter through the gateway, then fan out to the workers.

\`\`\`mermaid
graph LR
  Client --> Gateway --> Workers
\`\`\`
" | brain update-root architecture
```

Consider `architecture`, `stack`, `flow`, `mindmap`. Only write `background` and
`roadmap` when grounded in user intent — never invent goals or plans. Mark anything
low-confidence and ask.

Capture historical decisions as pages:

```sh
brain create-page --id <kebab-id> --category decision \
  --title "<one-line decision>" \
  --summary "<why this page was created>" \
  --source "<where this came from>"
printf '%s\n' "<what was decided, the alternatives, the rationale, the blast radius>" | \
  brain update-truth --id <kebab-id> --summary "<what was captured>" --source "<provenance>"
```

Link related pages and root areas with `[[page-id]]`.

## Greenfield — interview

Ask open-ended questions and let the answers drive the seed:

- **Goal** — what is this for, what problem does it solve?
- **Target users** — who is it for?
- **Non-goals** — what is explicitly out of scope?
- **Rough shape** — architecture and stack as currently imagined (may be loose).

Then seed `background` with `update-root background`. Draft `stack` and/or `roadmap` as
clearly provisional early sketches if the user has a real opinion. Leave
`architecture`, `flow`, and `mindmap` absent until there is something real to describe.

## Quality guardrails

- **Synthesize, don't copy.** Never paste a README section or a directory listing.
- **`git log` → real decisions only.** Skip "fix typo" / "bump dep".
- **Infer only what evidence supports.** `background` and `roadmap` usually cannot be
  inferred from code; ask instead of fabricating.
- **Prefer less but accurate.** If the code already says it plainly, leave it there.

## Wrap up

```sh
brain reindex
brain list-pages
```

Report which root pages and decision pages you wrote, and anything marked
low-confidence. Then hand ongoing capture to `references/pages.md` and
`references/ingest.md`.

Write bodies and `--summary` values in the user's working language.
