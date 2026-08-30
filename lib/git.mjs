import { execFile } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Git, on the user's own machine, with their own credentials.
 *
 * The workspace cannot reach a private repository from a browser, and asking
 * for an OAuth token to do it means a token exists somewhere it can leak. The
 * project folder is already a clone with a remote and a credential helper
 * configured, so the shortest path is to use it: nothing to authorise, nothing
 * to store, and the API description versions alongside the code it describes.
 *
 * Three limits, enforced here rather than trusted from the caller:
 *
 *   1. Everything happens inside the folder the user picked.
 *   2. Only paths under `.atlas.api/` are ever written or committed.
 *   3. Commits name only those paths — never `git add .`, which would sweep up
 *      whatever else the user had staged.
 */

const REFUSED = new Set(["/", "/etc", "/usr", "/var", "/bin", "/sbin", "/System", "/Library"]);

/** The one directory Atlas owns inside someone else's repository. */
export const ATLAS_DIR = ".atlas.api";

async function resolveRepo(input) {
  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, error: "No project path given." };
  }

  const resolved = path.resolve(input.trim().replace(/^~(?=$|\/)/, homedir()));
  if (REFUSED.has(resolved) || resolved === homedir()) {
    return { ok: false, error: "Point this at your project folder, not a system or home directory." };
  }

  try {
    const entry = await stat(resolved);
    if (!entry.isDirectory()) return { ok: false, error: "That path is a file, not a folder." };
  } catch {
    return { ok: false, error: `Nothing at ${resolved}.` };
  }

  return { ok: true, path: resolved };
}

async function git(cwd, args) {
  try {
    const { stdout } = await run("git", args, {
      cwd,
      /* Never let git open an editor or a credential prompt: with no terminal
         attached it would hang the agent instead of failing. */
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: "true" },
      maxBuffer: 8 * 1024 * 1024,
    });
    return { ok: true, out: stdout.trim() };
  } catch (error) {
    const message = String(error?.stderr || error?.message || error).trim();
    return { ok: false, error: message.split("\n").slice(0, 3).join(" ").slice(0, 400) };
  }
}

/**
 * Which of these paths git refuses to track.
 *
 * Atlas writes a `.gitignore` inside `.atlas.api/` that excludes
 * `environments.json`, on purpose: an environment holds a base URL and very
 * often a real token, and the privacy page promises it is treated as
 * sensitive. A user may add rules of their own on top.
 *
 * So the rules are the policy, and this asks git what they say rather than
 * deciding here. `check-ignore` exits 1 when nothing matches, which is an
 * answer and not a failure.
 */
async function ignoredAmong(root, paths) {
  if (paths.length === 0) return [];
  const result = await git(root, ["check-ignore", "--", ...paths]);
  if (!result.ok) return [];
  return result.out.split("\n").map((line) => line.trim()).filter(Boolean);
}

/**
 * What repository this folder is, without touching the network.
 *
 * The workspace needs the remote and branch to describe where a push would go.
 * Everything here is read from the clone, so it works offline and cannot
 * prompt for credentials.
 */
export async function gitInfo(payload = {}) {
  const target = await resolveRepo(payload.path);
  if (!target.ok) return target;

  const top = await git(target.path, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) {
    return {
      ok: true,
      isRepo: false,
      path: target.path,
      reason: "This folder is not a git repository.",
    };
  }

  const root = top.out;
  const [head, unborn, remote, status] = await Promise.all([
    git(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
    /* A repository with no commits yet has a branch that does not exist as a
       ref, so `rev-parse` fails on it. `symbolic-ref` still knows the name.
       Without this the branch reads as unknown for exactly the person who has
       just run `git init` and most needs to be told where their commit goes. */
    git(root, ["symbolic-ref", "--short", "HEAD"]),
    git(root, ["remote", "get-url", "origin"]),
    git(root, ["status", "--porcelain", "--", ATLAS_DIR]),
  ]);

  const branch = head.ok ? head : unborn;

  /* owner/repo out of either form of remote, so the workspace can show a name
     rather than a URL. A missing remote is normal: a local-only repo can still
     be committed to, it just cannot be pushed. */
  let slug = null;
  if (remote.ok) {
    const match = /github\.com[:/]+([^/]+)\/([^/.]+)/i.exec(remote.out);
    if (match) slug = `${match[1]}/${match[2]}`;
  }

  /* The names the workspace keeps here, so it can leave the ignored ones out
     of the comparison instead of reporting a change that can never be
     committed and never goes away. */
  const names = Array.isArray(payload.files) && payload.files.length > 0
    ? payload.files.map((name) => path.basename(String(name)))
    : ["project.json", "collection.json", "environments.json", "workspace.json"];
  const ignored = await ignoredAmong(root, names.map((name) => `${ATLAS_DIR}/${name}`));

  return {
    ok: true,
    isRepo: true,
    path: root,
    /* Relative to `.atlas.api/`, which is how the workspace names them. */
    ignored: ignored.map((entry) => path.basename(entry)),
    branch: branch.ok ? branch.out : null,
    /* Nothing committed on this branch yet — the panel says "first commit"
       rather than showing a comparison against a history that is not there. */
    unborn: !head.ok,
    remote: remote.ok ? remote.out : null,
    slug,
    hasRemote: remote.ok,
    /* Uncommitted changes under .atlas.api only — the rest of their working
       tree is none of our business. */
    dirty: status.ok ? status.out !== "" : false,
  };
}

/** Reads a file from `.atlas.api/`, or null when it is not there yet. */
export async function gitRead(payload = {}) {
  const target = await resolveRepo(payload.path);
  if (!target.ok) return target;

  const top = await git(target.path, ["rev-parse", "--show-toplevel"]);
  const root = top.ok ? top.out : target.path;
  const name = path.basename(String(payload.file ?? ""));
  if (!name || name.startsWith(".")) return { ok: false, error: "Invalid file name." };

  try {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(path.join(root, ATLAS_DIR, name), "utf8");
    return { ok: true, exists: true, file: name, content };
  } catch {
    return { ok: true, exists: false, file: name, content: null };
  }
}

/** Everything Atlas keeps in this repository, for the workspace to load at once. */
export async function gitList(payload = {}) {
  const target = await resolveRepo(payload.path);
  if (!target.ok) return target;

  const top = await git(target.path, ["rev-parse", "--show-toplevel"]);
  const root = top.ok ? top.out : target.path;

  try {
    const { readdir, readFile } = await import("node:fs/promises");
    const dir = path.join(root, ATLAS_DIR);
    const names = (await readdir(dir)).filter((name) => name.endsWith(".json"));

    const files = {};
    for (const name of names) {
      try {
        files[name] = await readFile(path.join(dir, name), "utf8");
      } catch {
        /* Unreadable one file, still return the rest. */
      }
    }
    return { ok: true, exists: names.length > 0, path: root, files };
  } catch {
    return { ok: true, exists: false, path: root, files: {} };
  }
}

/**
 * Writes files into `.atlas.api/`, commits them, and pushes if asked.
 *
 * Only the files named are staged. A repository with unrelated work in
 * progress must come out of this with that work still unstaged, which is why
 * this never runs `git add .` or `git commit -a`.
 */
export async function gitCommit(payload = {}) {
  const target = await resolveRepo(payload.path);
  if (!target.ok) return target;

  const top = await git(target.path, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) return { ok: false, error: "This folder is not a git repository." };
  const root = top.out;

  const files = payload.files && typeof payload.files === "object" ? payload.files : null;
  if (!files || Object.keys(files).length === 0) return { ok: false, error: "Nothing to write." };

  const dir = path.join(root, ATLAS_DIR);
  await mkdir(dir, { recursive: true });

  const written = [];
  for (const [rawName, content] of Object.entries(files)) {
    /* basename, so a caller cannot escape the directory with ../ */
    const name = path.basename(String(rawName));
    if (!name.endsWith(".json")) continue;
    await writeFile(path.join(dir, name), String(content ?? ""), "utf8");
    written.push(`${ATLAS_DIR}/${name}`);
  }
  if (written.length === 0) return { ok: false, error: "No writable files given." };

  const branch = payload.branch ? String(payload.branch) : null;
  if (branch) {
    const current = await git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!current.ok || current.out !== branch) {
      const made = await git(root, ["checkout", "-b", branch]);
      if (!made.ok) {
        const existing = await git(root, ["checkout", branch]);
        if (!existing.ok) return { ok: false, error: existing.error };
      }
    }
  }

  /* `git add` refuses the whole batch if any one path is ignored, so the
     ignored ones come out first. Skipping them is the correct outcome rather
     than a failure: the file Atlas ignores by default is the one holding
     tokens, and forcing it in would commit a credential on someone's behalf. */
  const skipped = await ignoredAmong(root, written);
  const stageable = written.filter((file) => !skipped.includes(file));

  if (stageable.length === 0) {
    return {
      ok: false,
      skipped,
      error:
        skipped.length === 1
          ? `${skipped[0]} is ignored by a .gitignore rule, so there is nothing left to commit.`
          : `Every file Atlas writes is ignored by a .gitignore rule (${skipped.join(", ")}), so there is nothing to commit.`,
    };
  }

  const added = await git(root, ["add", "--", ...stageable]);
  if (!added.ok) return { ok: false, error: added.error };

  const staged = await git(root, ["diff", "--cached", "--name-only"]);
  if (staged.ok && staged.out === "") {
    return { ok: true, committed: false, pushed: false, files: stageable, skipped, note: "Already up to date." };
  }

  const message = String(payload.message ?? "").trim() || "Update API collection";
  const committed = await git(root, ["commit", "-m", message, "--", ...stageable]);
  if (!committed.ok) return { ok: false, error: committed.error };

  if (payload.push === false) {
    return { ok: true, committed: true, pushed: false, files: stageable, skipped };
  }

  const head = await git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const pushed = await git(root, ["push", "-u", "origin", head.ok ? head.out : "HEAD"]);
  if (!pushed.ok) {
    /* The commit is real even when the push fails, and saying so prevents a
       second commit of the same thing on the retry. */
    return { ok: true, committed: true, pushed: false, files: stageable, skipped, error: pushed.error };
  }

  return { ok: true, committed: true, pushed: true, files: stageable, skipped, branch: head.ok ? head.out : null };
}

/** Brings the repository up to date before reading it. */
export async function gitPull(payload = {}) {
  const target = await resolveRepo(payload.path);
  if (!target.ok) return target;

  const top = await git(target.path, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) return { ok: false, error: "This folder is not a git repository." };

  const pulled = await git(top.out, ["pull", "--ff-only"]);
  if (!pulled.ok) return { ok: false, error: pulled.error };
  return { ok: true, out: pulled.out };
}

/**
 * Turns a folder into a repository, when the user asks for it.
 *
 * Offered rather than done quietly. `git init` in the wrong directory leaves a
 * `.git` somewhere nobody expects, so the workspace puts the question in front
 * of the user and this only ever runs against the folder already open.
 *
 * Nothing else happens: no remote is added and nothing is committed. An empty
 * repository is all `.atlas.api/` needs to be committed into, and where that
 * eventually gets pushed is the user's decision to make in their own terminal.
 */
export async function gitInit(payload = {}) {
  const target = await resolveRepo(payload.path);
  if (!target.ok) return target;

  /* Already inside one — including as a subdirectory of a repository whose
     root is further up. Initialising there would nest a second repository
     inside the first, which is almost never what someone means. */
  const existing = await git(target.path, ["rev-parse", "--show-toplevel"]);
  if (existing.ok) return { ok: true, already: true, path: existing.out };

  const made = await git(target.path, ["init"]);
  if (!made.ok) return { ok: false, error: made.error };

  return gitInfo({ path: target.path });
}
