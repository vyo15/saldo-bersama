import assert from "node:assert/strict";
import test from "node:test";
import { assertCanonicalMainPush, parsePrePushUpdates } from "../../scripts/pre-push-verify.mjs";

const update = ({
  localRef = "refs/heads/main",
  localSha = "1111111111111111111111111111111111111111",
  remoteRef = "refs/heads/main",
  remoteSha = "2222222222222222222222222222222222222222",
} = {}) => ({ localRef, localSha, remoteRef, remoteSha });

test("pre-push guard menerima git push origin main hanya bila ref yang dikirim sama dengan HEAD terverifikasi", () => {
  const updates = [update()];
  const result = assertCanonicalMainPush({
    updates,
    currentBranch: "main",
    headSha: updates[0].localSha,
    workingTree: "",
    isFastForward: true,
  });
  assert.equal(result.remoteRef, "refs/heads/main");
});

test("pre-push guard menolak kasus branch aktif berbeda dari ref main yang dikirim", () => {
  const updates = [update()];
  assert.throws(
    () => assertCanonicalMainPush({
      updates,
      currentBranch: "fix/v13-quality-gate",
      headSha: updates[0].localSha,
      workingTree: "",
      isFastForward: true,
    }),
    (error) => error?.code === "PRE_PUSH_BRANCH_MISMATCH",
  );
});

test("pre-push guard menolak SHA berbeda, working tree dirty, branch selain main, dan force push", () => {
  const updates = [update()];
  assert.throws(
    () => assertCanonicalMainPush({ updates, currentBranch: "main", headSha: "3333333333333333333333333333333333333333", workingTree: "", isFastForward: true }),
    (error) => error?.code === "PRE_PUSH_SHA_MISMATCH",
  );
  assert.throws(
    () => assertCanonicalMainPush({ updates, currentBranch: "main", headSha: updates[0].localSha, workingTree: " M README.md", isFastForward: true }),
    (error) => error?.code === "PRE_PUSH_DIRTY_WORKTREE",
  );
  assert.throws(
    () => assertCanonicalMainPush({ updates: [update({ localRef: "refs/heads/fix/test", remoteRef: "refs/heads/fix/test" })], currentBranch: "fix/test", headSha: updates[0].localSha, workingTree: "", isFastForward: true }),
    (error) => error?.code === "PRE_PUSH_MAIN_REQUIRED",
  );
  assert.throws(
    () => assertCanonicalMainPush({ updates, currentBranch: "main", headSha: updates[0].localSha, workingTree: "", isFastForward: false }),
    (error) => error?.code === "PRE_PUSH_NON_FAST_FORWARD",
  );
});

test("pre-push parser membaca payload Git empat kolom secara fail-closed", () => {
  const parsed = parsePrePushUpdates("refs/heads/main 1111111111111111111111111111111111111111 refs/heads/main 2222222222222222222222222222222222222222\n");
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].localRef, "refs/heads/main");
  assert.throws(() => parsePrePushUpdates("invalid payload"), (error) => error?.code === "PRE_PUSH_INPUT_INVALID");
});
