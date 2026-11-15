# Setup

Installing the `brain` skill for Pi and creating a project's store. There is **no npm
package**: the skill is installed from a checkout, and nothing is copied into other
agents' config directories.

## 1. Link the skill into Pi

From the checkout of this repository:

```sh
./setup                    # same as: node skills/brain/bin/brain.mjs setup
./setup --no-wire          # link only; leave AGENTS.md alone
```

This does two things:

1. Symlinks `skills/brain` to `<agent-dir>/skills/brain` (default
   `~/.pi/agent/skills/brain`), so Pi discovers the skill and edits in the checkout are
   live. An existing real directory at that path is never overwritten — move it aside
   first. Re-running is idempotent.
2. Writes a marked block (`<!-- BEGIN brain.md -->` … `<!-- END brain.md -->`) into
   `<agent-dir>/AGENTS.md`, creating the file if needed. Existing content outside the
   markers is preserved; `brain wire` refreshes only the block.

Pi's agent directory is `~/.pi/agent` unless `PI_CODING_AGENT_DIR` says otherwise.
`brain setup` respects that variable for both the link and the wiring, and the wired
block contains the resulting absolute CLI path.

Verify:

```sh
ls -l "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills/brain"
node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills/brain/bin/brain.mjs" help
```

Reverse with `./uninstall` (or `brain uninstall`): it removes only the symlink it
created and the marked block. Project stores under `$BRAIN_HOME` are never touched.

## 2. Create a project's store

Run from the project root. In a git repository any subdirectory resolves to the same
store; a non-git project uses the absolute path it was invoked from, so run `brain`
from that project's root.

```sh
brain where     # store path, identity, source, exists, page count
brain init      # create the store if missing (idempotent)
```

The store is `$BRAIN_HOME/<project-key>` — default `~/brain.md/<project-key>`. It is
**outside the repository**; nothing is added to the project. `BRAIN_HOME` relocates
the home for all projects (`BRAIN_HOME=/Volumes/brain ./setup`, or export it in your
shell profile).

`brain init` makes `pages/` and `index.md`. It never overwrites existing content.

## 3. Seed it

An empty store is a deliberate resting state. Read `references/bootstrap.md` to seed it
from the code, docs, and `git log` (brownfield) or by interviewing the user
(greenfield).

## Environment

| variable | default | meaning |
|---|---|---|
| `BRAIN_HOME` | `~/brain.md` | root of all project stores |
| `PI_CODING_AGENT_DIR` | `~/.pi/agent` | Pi agent dir; holds `skills/` and `AGENTS.md` |

## Moving or duplicating a project

Nothing to migrate for the skill itself. A store is keyed by identity, so:

- Same remote, new clone → same store.
- No remote: the key derives from the absolute git common dir or path, so a moved or
  copied checkout gets a different (empty) store. Copy `$BRAIN_HOME/<old-key>` to
  `$BRAIN_HOME/<new-key>` if you want to carry the memory over.
- Worktrees of a repo without a remote share the main repo's common dir, so they share
  a store.

Old brains kept inside a repository (`brain/` directories, `BRAIN.md` files) are not
read by this CLI. If the user wants their history kept, ask them to have an agent
migrate the content page by page through `brain create-page` / `update-truth`; there is
no automated import.
