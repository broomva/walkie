import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Where the Genesis checkout lives, for the scripts that spawn it.
 *
 * This existed twice, and both copies were wrong the same way:
 *
 *     process.env.GENESIS_DIR ?? join(import.meta.dir, "../../../genesis")
 *
 * From `apps/walkie/scripts/`, three levels up is the workspace root, so the
 * default resolved to `<workspace>/genesis` — which does not exist. Genesis is a
 * sibling of walkie, at `<workspace>/apps/genesis`, one level further in.
 *
 * CI never noticed, because `.github/workflows/ci.yml` sets `GENESIS_DIR` to a
 * sibling checkout it creates itself. So the `probe` job has been green
 * throughout while `bun run probe:browser` on a developer's machine has never
 * run. A gate green in the only place it runs is not known to run.
 *
 * The failure was also misattributed, which cost more than the failure did:
 * `Bun.spawn` reports a non-existent **cwd** as
 * `ENOENT: no such file or directory, posix_spawn 'bun'`, naming the executable.
 * That sends the reader after PATH and bun's env handling — both fine — instead
 * of at the directory. Hence the explicit check below.
 *
 * Resolution is anchored on `--git-common-dir`, NOT on a path relative to this
 * file, because a worktree lives wherever the harness puts it: from
 * `apps/walkie/.worktrees/<name>/scripts/`, any fixed number of `..` is wrong.
 * That is the same reasoning the linear-routing gate uses (BRO-2089) — resolve
 * the repository, do not pattern-match the cwd.
 */
export function resolveGenesisDir(): string {
  const attempted: string[] = [];

  // An explicit GENESIS_DIR is honoured or REFUSED — never quietly replaced by a
  // fallback. Silently searching elsewhere would make the variable a knob that
  // does nothing when it is wrong, which is the failure mode this file exists to
  // stop being: the operator would be looking at a run that ignored them.
  const fromEnv = process.env.GENESIS_DIR?.trim();
  if (fromEnv) {
    const dir = resolve(fromEnv);
    if (existsSync(dir)) return dir;
    fail([`${dir}   (from GENESIS_DIR — set explicitly, so no fallback was tried)`]);
  }

  // The main checkout, even from a worktree: `--git-common-dir` points at the
  // real `.git`, whose parent is the repo root. Genesis is its sibling.
  const common = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: import.meta.dir,
  });
  if (common.exitCode === 0) {
    const root = dirname(common.stdout.toString().trim());
    const dir = join(dirname(root), "genesis");
    if (existsSync(dir)) return dir;
    attempted.push(`${dir}   (sibling of the walkie checkout)`);
  }

  // Last resort, for a checkout with no git (a tarball, a container copy).
  const relative = resolve(import.meta.dir, "../../genesis");
  if (existsSync(relative)) return relative;
  attempted.push(`${relative}   (relative to this script)`);

  fail(attempted);
}

function fail(attempted: readonly string[]): never {
  console.error(
    [
      "no Genesis checkout found. Looked in:",
      ...attempted.map((a) => `  ${a}`),
      "",
      "Set GENESIS_DIR to the genesis checkout. This script spawns Genesis with",
      'that directory as its cwd, and Bun reports a missing cwd as "posix_spawn',
      "'bun'\" — which names the wrong thing, so the check is here rather than in",
      "the spawn.",
    ].join("\n"),
  );
  process.exit(2);
}
