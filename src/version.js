// version: what code this machine is actually running.
//
// WHY: the hub and its peers share protocols — the combined-print request, and
// the print-confirm handshake — so a machine left on older code breaks printing
// in ways that look like a network fault. That has happened before (the `all`
// flag on /api/peer/print), and it is invisible without this.
//
// Read from git, because that is the only source that cannot drift: a
// package.json version has to be remembered, and the one thing a stale machine
// will not have done is remember. Read ONCE at startup — the running process is
// not going to change commit underneath itself, and re-reading per request
// would just be disk I/O on the status poll.

import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.js";

function readGit() {
  try {
    const gitDir = path.join(ROOT, ".git");
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();

    // Detached HEAD is the commit itself; otherwise follow the ref.
    if (!head.startsWith("ref:")) return { commit: head.slice(0, 7), branch: "(detached)" };

    const ref = head.slice(4).trim();
    const branch = ref.replace(/^refs\/heads\//, "");

    // Loose ref first, then packed-refs (a freshly cloned machine often has the
    // ref only in packed-refs, which is exactly the machine worth checking).
    const refFile = path.join(gitDir, ref);
    if (fs.existsSync(refFile)) {
      return { commit: fs.readFileSync(refFile, "utf8").trim().slice(0, 7), branch };
    }
    const packed = fs.readFileSync(path.join(gitDir, "packed-refs"), "utf8");
    for (const line of packed.split("\n")) {
      const [sha, name] = line.trim().split(/\s+/);
      if (name === ref) return { commit: String(sha).slice(0, 7), branch };
    }
    return { commit: null, branch };
  } catch {
    return { commit: null, branch: null };
  }
}

function readPkgVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version || null;
  } catch {
    return null;
  }
}

const git = readGit();
const pkg = readPkgVersion();

// `id` is what machines compare. Git commit when available; otherwise the
// package version, so a deployment without .git still reports something
// comparable rather than looking identical to every other machine.
export const VERSION = {
  id: git.commit || (pkg ? `v${pkg}` : "unknown"),
  commit: git.commit,
  branch: git.branch,
  pkg,
};

export function versionLine() {
  return VERSION.branch && VERSION.commit ? `${VERSION.commit} (${VERSION.branch})` : VERSION.id;
}
