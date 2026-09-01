import { describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * `resolveGenesisDir()` decides the cwd two probe scripts spawn Genesis with.
 * Getting it wrong is invisible in CI — which sets GENESIS_DIR itself — and
 * misattributed everywhere else, because Bun reports a missing cwd as
 * `posix_spawn 'bun'`.
 *
 * HERMETIC, and that is the point twice over. The first version of this file
 * asserted that resolution succeeds with GENESIS_DIR unset — which is true on a
 * machine where genesis sits beside walkie and false in CI, where the `test` job
 * checks out walkie alone. It passed locally and failed on the runner: a test
 * asserting the author's directory layout rather than the code's behaviour, in a
 * file written to stop exactly that. So the layout is now BUILT, not assumed.
 *
 * Spawned rather than imported: the failure path calls `process.exit(2)`.
 */
const ROOT = resolve(import.meta.dir, "..");
const EVAL =
  'import {resolveGenesisDir} from "./scripts/genesis-dir"; console.log(resolveGenesisDir())';

function runIn(cwd: string, env: Record<string, string | undefined> = {}) {
  const r = Bun.spawnSync(["bun", "-e", EVAL], {
    cwd,
    env: { ...process.env, ...env } as Record<string, string>,
  });
  return { code: r.exitCode, out: r.stdout.toString().trim(), err: r.stderr.toString() };
}

/** A throwaway `<tmp>/apps/{walkie,genesis}`, with walkie a real git repo.
 *
 *  realpath'd: on macOS `/var` is a symlink to `/private/var`, and git resolves
 *  it, so an un-normalised comparison fails on a correct result. */
function fakeWorkspace(withGenesis: boolean) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "walkie-ws-")));
  const walkie = join(base, "apps", "walkie");
  mkdirSync(join(walkie, "scripts"), { recursive: true });
  cpSync(`${ROOT}/scripts/genesis-dir.ts`, join(walkie, "scripts", "genesis-dir.ts"));
  Bun.spawnSync(["git", "init", "-q", walkie]);
  if (withGenesis) mkdirSync(join(base, "apps", "genesis"), { recursive: true });
  return { base, walkie, genesis: join(base, "apps", "genesis") };
}

describe("resolveGenesisDir", () => {
  test("with no GENESIS_DIR it finds the SIBLING of the repo root", () => {
    // The defect: the default was `../../../genesis`, one level too high, so it
    // pointed above `apps/` and nothing was there.
    const ws = fakeWorkspace(true);
    try {
      const r = runIn(ws.walkie, { GENESIS_DIR: undefined });
      expect(r.code).toBe(0);
      expect(r.out).toBe(ws.genesis);
    } finally {
      rmSync(ws.base, { recursive: true, force: true });
    }
  });

  test("resolution holds from a WORKTREE, where counting `..` cannot work", () => {
    // A worktree lives wherever the harness puts it, so the resolver anchors on
    // `--git-common-dir`. Exercised against the real repo: this file's own
    // checkout may be a worktree, and the path it reports must still be the
    // sibling of the MAIN checkout.
    const common = Bun.spawnSync(
      ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        cwd: ROOT,
      },
    );
    expect(common.exitCode).toBe(0);
    const mainRoot = dirname(common.stdout.toString().trim());
    const expected = join(dirname(mainRoot), "genesis");

    const r = runIn(ROOT, { GENESIS_DIR: undefined });
    // Either it resolved to that sibling, or genesis is not checked out here and
    // it said so — naming that exact path. Both prove the arithmetic; neither
    // depends on genesis being present, which is what broke the first version.
    if (r.code === 0) expect(r.out).toBe(expected);
    else expect(r.err).toContain(expected);
  });

  test("an explicit GENESIS_DIR that does not exist FAILS — it is not quietly replaced", () => {
    // Falling back would make the variable a knob that does nothing when wrong,
    // and the operator would be reading a run that ignored them.
    const ws = fakeWorkspace(true);
    const missing = join(ws.base, "no-such-genesis");
    try {
      const r = runIn(ws.walkie, { GENESIS_DIR: missing });
      expect(r.code).toBe(2);
      expect(r.err).toContain(missing);
      expect(r.err).toContain("no fallback was tried");
    } finally {
      rmSync(ws.base, { recursive: true, force: true });
    }
  });

  test("the error names the path it looked for, not the executable", () => {
    // The entire cost of this defect was a message pointing at `bun`.
    const ws = fakeWorkspace(false);
    try {
      const r = runIn(ws.walkie, { GENESIS_DIR: undefined });
      expect(r.code).toBe(2);
      expect(r.err).toContain("no Genesis checkout found");
      expect(r.err).toContain(ws.genesis);
      expect(r.err).not.toMatch(/^ENOENT/m);
    } finally {
      rmSync(ws.base, { recursive: true, force: true });
    }
  });

  test("a GENESIS_DIR pointing at a FILE is refused, not returned", () => {
    // `existsSync` is true for a regular file, so an existence check alone would
    // hand a file to Bun.spawn as its cwd — reproducing the exact
    // ENOENT-against-the-executable message this module exists to prevent,
    // through the check meant to stop it.
    const ws = fakeWorkspace(true);
    const file = join(ws.base, "not-a-directory");
    writeFileSync(file, "");
    try {
      const r = runIn(ws.walkie, { GENESIS_DIR: file });
      expect(r.code).toBe(2);
      expect(r.err).toContain(file);
    } finally {
      rmSync(ws.base, { recursive: true, force: true });
    }
  });

  test("an explicit, existing GENESIS_DIR wins", () => {
    const ws = fakeWorkspace(true);
    const other = realpathSync(mkdtempSync(join(tmpdir(), "walkie-genesis-")));
    try {
      const r = runIn(ws.walkie, { GENESIS_DIR: other });
      expect(r.code).toBe(0);
      expect(r.out).toBe(other);
    } finally {
      rmSync(ws.base, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });
});
