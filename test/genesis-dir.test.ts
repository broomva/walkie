import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * `resolveGenesisDir()` decides the cwd two probe scripts spawn Genesis with,
 * and getting it wrong is invisible in CI — which sets GENESIS_DIR itself — and
 * misattributed everywhere else, because Bun reports a missing cwd as
 * `posix_spawn 'bun'`.
 *
 * Spawned rather than imported: the failure path calls `process.exit(2)`, which
 * would take the test runner with it.
 */
const ROOT = resolve(import.meta.dir, "..");

function run(env: Record<string, string | undefined>) {
  const r = Bun.spawnSync(
    [
      "bun",
      "-e",
      'import {resolveGenesisDir} from "./scripts/genesis-dir"; console.log(resolveGenesisDir())',
    ],
    { cwd: ROOT, env: { ...process.env, ...env } as Record<string, string> },
  );
  return { code: r.exitCode, out: r.stdout.toString().trim(), err: r.stderr.toString() };
}

describe("resolveGenesisDir", () => {
  test("finds genesis with no GENESIS_DIR — including from a worktree", () => {
    // The defect: the default was `../../../genesis`, one level too high, so this
    // never worked outside CI. Resolution is anchored on `--git-common-dir`, so
    // it also holds from `.worktrees/<name>/`, where no fixed count of `..` can.
    const r = run({ GENESIS_DIR: undefined });
    expect(r.code).toBe(0);
    expect(r.out.endsWith("/genesis")).toBe(true);
  });

  test("an explicit GENESIS_DIR that does not exist FAILS — it is not quietly replaced", () => {
    // Falling back would make the variable a knob that does nothing when wrong,
    // and the operator would be reading a run that ignored them.
    const missing = join(tmpdir(), "walkie-no-such-genesis");
    const r = run({ GENESIS_DIR: missing });
    expect(r.code).toBe(2);
    expect(r.err).toContain(missing);
    expect(r.err).toContain("no fallback was tried");
  });

  test("the error names the path it looked for, not the executable", () => {
    // The whole cost of this defect was the message pointing at `bun`.
    const r = run({ GENESIS_DIR: join(tmpdir(), "walkie-no-such-genesis") });
    expect(r.err).toContain("no Genesis checkout found");
    expect(r.err).not.toMatch(/^ENOENT/m);
  });

  test("an explicit, existing GENESIS_DIR wins", () => {
    const dir = mkdtempSync(join(tmpdir(), "walkie-genesis-"));
    try {
      const r = run({ GENESIS_DIR: dir });
      expect(r.code).toBe(0);
      expect(r.out).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
