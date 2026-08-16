/**
 * Reading a project on this machine.
 *
 * The analyser runs here rather than on a server, which is the whole point:
 * your code is read on your own machine by a process you started, and only the
 * result — routes, shapes, the database map — is sent to the browser tab. The
 * source never leaves.
 *
 * This is also the one part of the agent that touches the filesystem, so it is
 * the part worth being careful about. A connected page can ask for any path
 * the user running the agent can read, which is why the token and origin
 * checks in `index.mjs` matter more than they would for a proxy alone.
 */

import { stat, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Directories that are never a backend project, and would be miserable to
 * walk by accident. A mistyped path should fail immediately rather than spend
 * four minutes reading someone's entire home directory.
 */
const REFUSED = new Set(["/", "/etc", "/usr", "/var", "/bin", "/sbin", "/System", "/Library"]);

/** Resolves `~`, checks the folder is real, and refuses the obvious mistakes. */
async function resolveTarget(input) {
  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, error: "No path given." };
  }

  const resolved = path.resolve(input.trim().replace(/^~(?=$|\/)/, homedir()));

  if (REFUSED.has(resolved) || resolved === homedir()) {
    return {
      ok: false,
      error: "Point this at your project folder rather than a system or home directory.",
    };
  }

  let entry;
  try {
    entry = await stat(resolved);
  } catch {
    return { ok: false, error: `Nothing at ${resolved}.` };
  }

  if (!entry.isDirectory()) return { ok: false, error: "That path is a file, not a folder." };

  return { ok: true, path: resolved };
}

/**
 * Scans a folder and returns the project the workspace renders.
 *
 * The analyser is imported lazily so that starting the agent to forward a few
 * requests never pays for loading it, or for loading TypeScript behind it.
 */
export async function scan(payload = {}) {
  const target = await resolveTarget(payload.path);
  if (!target.ok) return { ok: false, error: target.error };

  let scanProject;
  try {
    ({ scanProject } = await import("./analyzer.min.mjs"));
  } catch (error) {
    return {
      ok: false,
      error:
        "The analyser could not be loaded. Reinstall the agent, and check `typescript` is present.",
      detail: String(error?.message ?? error),
    };
  }

  const startedAt = Date.now();
  try {
    const project = await scanProject(target.path, { includeTests: payload.includeTests === true });
    return { ok: true, project, durationMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, error: error?.message ?? "The scan failed." };
  }
}

/**
 * The folders directly inside a path, so the app can offer a picker instead of
 * demanding an absolute path typed from memory.
 *
 * Names only, never file contents, and never recursive — enough to navigate,
 * and nothing that would make this a way to read a machine.
 */
export async function list(payload = {}) {
  const raw = typeof payload.path === "string" && payload.path.trim() !== ""
    ? payload.path
    : homedir();

  const resolved = path.resolve(raw.trim().replace(/^~(?=$|\/)/, homedir()));

  try {
    const entries = await readdir(resolved, { withFileTypes: true });
    return {
      ok: true,
      path: resolved,
      parent: path.dirname(resolved) === resolved ? null : path.dirname(resolved),
      directories: entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 500),
    };
  } catch {
    return { ok: false, error: `Cannot read ${resolved}.` };
  }
}
