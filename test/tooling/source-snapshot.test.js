import assert from "node:assert/strict";
import test from "node:test";

import {
  formatSourceSnapshotFile,
  inspectSourceSnapshot,
  sourceSnapshotLines,
  summarizeWorkingTree,
} from "../../scripts/source-snapshot.mjs";

test("working tree summary membedakan perubahan penting tanpa mengekspos isi file", () => {
  const summary = summarizeWorkingTree([
    " M frontend/src/App.jsx",
    "A  docs/NEW.md",
    " D docs/OLD.md",
    "R  old.js -> new.js",
    "?? notes.txt",
    "UU api/gateway.js",
  ].join("\n"));

  assert.deepEqual(summary, {
    changed: 6,
    modified: 1,
    added: 1,
    deleted: 1,
    renamed: 1,
    untracked: 1,
    conflicted: 1,
  });
});

test("source snapshot membaca branch, commit, status, dan origin/main bila Git tersedia", () => {
  const replies = new Map([
    ["rev-parse --is-inside-work-tree", "true"],
    ["branch --show-current", "main"],
    ["rev-parse HEAD", "1234567890abcdef1234567890abcdef12345678"],
    ["rev-parse --short=8 HEAD", "12345678"],
    ["log -1 --pretty=%s", "feat: canonical source snapshot"],
    ["status --short --untracked-files=normal", " M README.md\n?? docs/new.md"],
    ["rev-parse --verify refs/remotes/origin/main", "abcdef1234567890abcdef1234567890abcdef12"],
    ["rev-list --left-right --count refs/remotes/origin/main...1234567890abcdef1234567890abcdef12345678", "2\t3"],
  ]);
  const runGit = (args) => {
    const key = args.join(" ");
    if (!replies.has(key)) throw new Error(`unexpected git call: ${key}`);
    return replies.get(key);
  };

  const snapshot = inspectSourceSnapshot({ projectRoot: "/repo", runGit });
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.branch, "main");
  assert.equal(snapshot.shortCommit, "12345678");
  assert.equal(snapshot.workingTreeClean, false);
  assert.equal(snapshot.changes.changed, 2);
  assert.deepEqual(snapshot.remoteMain, {
    available: true,
    commit: "abcdef1234567890abcdef1234567890abcdef12",
    shortCommit: "abcdef12",
    ahead: 3,
    behind: 2,
  });
  assert.match(sourceSnapshotLines(snapshot).join("\n"), /DIRTY \(2 perubahan\)/);
  assert.match(formatSourceSnapshotFile(snapshot, { verified: true }), /Full commit\s+: 1234567890abcdef/);
  assert.match(formatSourceSnapshotFile(snapshot, { verified: true }), /melewati full verification/);
});

test("source snapshot graceful bila clean ZIP tidak memiliki .git", () => {
  const snapshot = inspectSourceSnapshot({
    projectRoot: "/archive",
    runGit: () => { throw new Error("not a git repository"); },
  });

  assert.deepEqual(snapshot, { available: false, reason: "git-unavailable" });
  assert.match(formatSourceSnapshotFile(snapshot), /Git metadata\s+: tidak tersedia/);
});
