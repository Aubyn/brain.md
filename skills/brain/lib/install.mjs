// Installing the `brain` skill for Pi.
//
// Nothing is published to npm and nothing is copied into other agents' config
// directories. `brain setup` links this skill bundle into Pi's user skills dir
// (`<agent-dir>/skills/brain`) and then wires the brain block into
// `<agent-dir>/AGENTS.md`. `brain uninstall` reverses both.

import {
  lstatSync,
  mkdirSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { agentDir } from "./wire.mjs";

/** Absolute path of this skill bundle (`.../skills/brain`). */
export function skillSource() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

export function skillTarget(env = process.env) {
  return join(agentDir(env), "skills", "brain");
}

function lexists(p) {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function realpathOrNull(p) {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

/** Link the skill into the agent skills dir. Returns { target, action }. */
export function installSkill(env = process.env) {
  const source = skillSource();
  const target = skillTarget(env);

  if (lexists(target)) {
    if (!isSymlink(target)) {
      throw new Error(
        `${target} exists and is not a symlink — move it aside first (this installer never overwrites a real directory)`,
      );
    }
    const current = realpathOrNull(target);
    if (current !== realpathOrNull(source)) {
      throw new Error(`${target} is a symlink to ${readlinkSync(target)} — remove it or re-point it at ${source}`);
    }
    return { target, source, action: "already linked" };
  }

  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(source, target);
  return { target, source, action: "linked" };
}

/** Remove only a symlink we own. Returns { target, action }. */
export function uninstallSkill(env = process.env) {
  const source = skillSource();
  const target = skillTarget(env);

  if (!lexists(target)) return { target, action: "absent" };
  if (!isSymlink(target)) {
    throw new Error(`${target} is a real directory, not a link created by 'brain setup' — leaving it untouched`);
  }
  const current = realpathOrNull(target);
  if (current !== null && current !== realpathOrNull(source)) {
    throw new Error(`${target} links to ${current}, not this checkout — leaving it untouched`);
  }
  unlinkSync(target);
  return { target, action: "removed" };
}
