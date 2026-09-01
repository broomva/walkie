import { describe, expect, test } from "bun:test";
/**
 * The checkers must be looking at everything they are believed to be looking at.
 *
 * A gate is not weakened by being made to fail — it is weakened by being made to
 * look at less. `tsconfig.include` narrowed, or `biome.files.ignore` widened, and
 * the pipeline stays green over a shrinking program. Nothing else here would
 * notice: tsc exits 0 on a one-file program as happily as on four.
 *
 * Two earlier versions of this file are worth knowing about, because both looked
 * fine and neither worked.
 *
 *   The first asserted `filesInProgram > 0`. That passes when `include` is
 *   narrowed from three directories to one — the drift actually worth catching —
 *   and is redundant when the program is empty, since tsc errors TS18003 on its
 *   own.
 *
 *   The second compared biome's whole-tree file COUNT against git's. Those two
 *   numbers are computed under different ignore models: git honours .gitignore,
 *   biome honours .gitignore PLUS its own `files.ignore`. Adding an ordinary
 *   `env.d.ts` reddened the suite for no reason, and a count can match by
 *   coincidence while the sets differ. Brittle AND bypassable is worse than
 *   absent: it teaches people to edit the assertion.
 *
 * What is left compares sets, per file, against what the checker itself reports.
 */
import { resolve } from "node:path";

// NOT `new URL("..", import.meta.url).pathname` — that percent-encodes, so every
// spawn below dies with ENOENT on a checkout path containing a space. Resolved
// rather than left as `<dir>/..`, or the prefix match on tsc's normalised
// absolute paths never hits.
const ROOT = resolve(import.meta.dir, "..");

function run(cmd: string[], cwd = ROOT): string {
  return Bun.spawnSync(cmd, { cwd }).stdout.toString();
}

/**
 * Present and not ignored by git, filtered to an extension set.
 *
 * `-z` and a NUL split, not newlines: without it git C-quotes any path with a
 * non-ASCII or unusual byte — `naïve.ts` comes back as `"na\303\257ve.ts"`,
 * which no longer ends in `.ts`, so the file drops out of BOTH assertions below
 * and a genuine type error inside it is invisible to every gate. A fail-open in
 * a coverage check, and the whole point of a coverage check is that it cannot
 * fail open.
 */
function tracked(extensions: readonly string[]): string[] {
  return run(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"])
    .split("\0")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && extensions.some((e) => l.endsWith(e)))
    .sort();
}

// EXPLICIT TIMEOUTS on every test that spawns a compiler.
//
// Measured: `tsc --noEmit --listFiles` takes 0.78s warm on a dev box and >5s on
// a cold, loaded CI runner — a 6x swing that straddles bun's 5000ms default. The
// job failed twice on this branch, and the second failure is the one that named
// the cause, because the instrument guard added alongside it reported
// `spawn ran:false`: the TEST timed out while `Bun.spawnSync` was still
// blocking, so `exitCode` was null. The first failure, before the guard, had
// presented as "the file you just added is outside the program" — an accusation
// against the newest file rather than a report about the clock.
//
// A checker that has to start a compiler is not a 5-second unit test. 60s is far
// above the observed worst case and still fails a genuine hang.
const SPAWNS_A_COMPILER = 60_000;

describe("tsc reads every tracked TypeScript file", () => {
  test(
    "no tracked .ts file is outside the program",
    () => {
      const expected = tracked([".ts"]);
      expect(expected.length).toBeGreaterThan(0); // the walk itself must find something

      // THE INSTRUMENT IS CHECKED BEFORE ITS ANSWER IS TRUSTED. A spawn that failed
      // to launch, or a listing truncated under load, yields an empty or short file
      // set — which presents as "every tracked file is outside the program", i.e.
      // as the loudest possible version of the very defect this test hunts. Absence
      // is the resting state of this measurement, so it must not also be its error
      // signal.
      //
      // Not hypothetical: CI run 33475165397 failed here and an immediate rerun of
      // the IDENTICAL commit passed. Without this guard the next occurrence reads
      // as "the file you just added is not covered by tsc", sending the next person
      // to look at tsconfig for a bug that is not there.
      const proc = Bun.spawnSync([`${ROOT}/node_modules/.bin/tsc`, "--noEmit", "--listFiles"], {
        cwd: ROOT,
      });
      const listing = proc.stdout.toString();
      // Three separate ways the instrument can be broken, checked separately
      // because they fail differently:
      //   1. the spawn never ran (bad path, missing binary) — exitCode is null;
      //   2. the process died on a signal rather than exiting;
      //   3. the output is short. A first-line sentinel catches only TOTAL
      //      emptiness — `lib.es5.d.ts` is line 1 of ~750, so any truncation after
      //      it passes the sentinel and then fails the coverage assertion exactly
      //      as if a file were uncovered. The line floor is what covers truncation.
      expect(`spawn ran:${proc.exitCode !== null}`).toBe("spawn ran:true");
      expect(`no signal:${proc.signalCode ?? "none"}`).toBe("no signal:none");
      expect(listing).toContain("/typescript/lib/lib.es5.d.ts");
      const lines = listing.split("\n").filter((l) => l.trim().length > 0).length;
      // tsc reads its own lib/*.d.ts before any project file; ~750 here, and a
      // real listing cannot plausibly be under 100.
      expect(`listing lines >= 100:${lines >= 100} (${lines})`).toBe(
        `listing lines >= 100:true (${lines})`,
      );

      const inProgram = new Set(
        listing
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith(`${ROOT}/`))
          .map((l) => l.slice(ROOT.length + 1))
          .filter((l) => !l.startsWith("node_modules/")),
      );

      expect(expected.filter((f) => !inProgram.has(f))).toEqual([]);
    },
    SPAWNS_A_COMPILER,
  );
});

describe("biome reads every tracked TypeScript file", () => {
  // Per file, against biome's own accounting. Naming a file biome is configured
  // to ignore makes it report zero files seen; naming one it will check makes it
  // report one. Measured: `biome ci --reporter=json <ignored>` gives
  // `unchanged: 0`, `<checked>` gives `unchanged: 1`.
  //
  // So widening `files.ignore` to hide a directory turns this red, and an
  // ordinary .d.ts does not, because .d.ts is excluded on both sides for the
  // same declared reason.
  // biome.json's ignore list, PINNED rather than read. Deriving the skip set
  // from biome.json would let a widened `files.ignore` skip its own new entries
  // — the config would silently excuse itself. Pinning it and asserting equality
  // means widening the config turns this red until someone updates both.
  //
  // Round 1 fixed this mismatch at the whole-tree count. Round 2 found the same
  // root cause relocated to the subject set: the filter mirrored ONE of four
  // entries, so committing an ordinary fixture into `test/fixtures/` — a
  // directory biome.json explicitly anticipates — reddened the required check
  // for no reason. An invariant spelled once per entry is forgotten once per
  // entry; spell it once.
  const BIOME_IGNORE = ["**/*.d.ts", "**/fixtures/**", "dist/**", "node_modules/**"];

  test("the pinned ignore list still matches biome.json", () => {
    const cfg = JSON.parse(run(["cat", `${ROOT}/biome.json`]));
    expect(cfg.files.ignore).toEqual(BIOME_IGNORE);
  });

  const globs = BIOME_IGNORE.map((g) => new Bun.Glob(g));
  const subjects = tracked([".ts"]).filter((f) => !globs.some((g) => g.match(f)));

  test("there is something to check", () => {
    expect(subjects.length).toBeGreaterThan(0);
  });

  test.each(subjects)("biome sees %s", (file) => {
    const out = run([`${ROOT}/node_modules/.bin/biome`, "ci", "--reporter=json", file]);
    const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    const seen = json.summary.changed + json.summary.unchanged + json.summary.skipped;
    expect(seen).toBeGreaterThan(0);
  });
});

/**
 * Coverage says which files a checker reads. It says nothing about whether the
 * checker still has rules. `linter.enabled: false` leaves every file count
 * identical and every diagnostic gone — a mutation the coverage assertions above
 * genuinely survive, which is how this block came to exist.
 *
 * Asserting that biome.json says `enabled: true` would not fix it: reading our
 * own config back is the config agreeing with itself. So the checkers are RUN,
 * over the repo's real config, against code that must be rejected and code that
 * must be accepted.
 *
 * The negative control is not decoration. The first version ran biome through
 * `--stdin-file-path`, which exits 1 unconditionally in stdin mode ("The
 * contents aren't fixed") — so the rejection test passed carrying no signal at
 * all, and only the acceptance test failing exposed it. A planted defect proves
 * the instrument runs; it takes both polarities to show it can tell the cases
 * apart.
 */
describe("the checkers still have rules", () => {
  function write(path: string, source: string): void {
    Bun.spawnSync(["sh", "-c", `cat > "${path}"`], { stdin: new TextEncoder().encode(source) });
  }

  /** A scratch git repo carrying THIS repo's biome.json, so the real rule set applies. */
  function biomeExit(source: string): number {
    const dir = Bun.spawnSync(["mktemp", "-d"]).stdout.toString().trim();
    try {
      // biome runs with vcs.useIgnoreFile and hard-fails outside a git repo.
      Bun.spawnSync(["git", "init", "-q", dir]);
      Bun.spawnSync(["cp", `${ROOT}/biome.json`, `${dir}/biome.json`]);
      write(`${dir}/subject.ts`, source);
      // NOT `bunx biome`: outside a directory whose node_modules holds
      // @biomejs/biome, bunx resolves npm's unrelated `biome` package (0.3.3),
      // which exits 0 on everything. Measured, not guessed.
      return Bun.spawnSync([`${ROOT}/node_modules/.bin/biome`, "ci", "subject.ts"], { cwd: dir })
        .exitCode;
    } finally {
      Bun.spawnSync(["rm", "-rf", dir]);
    }
  }

  test(
    "biome rejects code violating a rule this repo enables",
    () => {
      // `"x" + a + "y"` is lint/style/useTemplate, part of `recommended`.
      expect(biomeExit('const a = 1;\nconst b = "x" + a + "y";\nconsole.log(b);\n')).not.toBe(0);
    },
    SPAWNS_A_COMPILER,
  );

  test(
    "biome accepts the same code with the violation removed",
    () => {
      expect(biomeExit("const a = 1;\nconst b = `x${a}y`;\nconsole.log(b);\n")).toBe(0);
    },
    SPAWNS_A_COMPILER,
  );

  /**
   * Written outside the repo so it cannot perturb the sets above, but
   * `extends`-ing the repo's own tsconfig so the assertion is about THIS repo's
   * strictness and not about tsc's. The first version passed `--strict` on the
   * command line and survived flipping `"strict": false` in tsconfig.json — it
   * proved tsc obeys `--strict`, which was never in question.
   */
  function tscExit(source: string): number {
    const dir = Bun.spawnSync(["mktemp", "-d"]).stdout.toString().trim();
    try {
      write(
        `${dir}/tsconfig.json`,
        JSON.stringify({
          extends: `${ROOT}/tsconfig.json`,
          // A scratch dir has no node_modules to resolve `types: ["bun"]` from.
          compilerOptions: { typeRoots: [`${ROOT}/node_modules/@types`] },
          include: ["subject.ts"],
        }),
      );
      write(`${dir}/subject.ts`, source);
      return Bun.spawnSync(
        [`${ROOT}/node_modules/.bin/tsc`, "--noEmit", "-p", `${dir}/tsconfig.json`],
        { cwd: ROOT },
      ).exitCode;
    } finally {
      Bun.spawnSync(["rm", "-rf", dir]);
    }
  }

  test(
    "tsc rejects code violating the strictness this repo sets",
    () => {
      // Implicit any on a parameter — an error only because `strict` is on.
      expect(tscExit("export function f(x) {\n  return x;\n}\n")).not.toBe(0);
    },
    SPAWNS_A_COMPILER,
  );

  test(
    "tsc accepts the same code once the parameter is typed",
    () => {
      expect(tscExit("export function f(x: number): number {\n  return x;\n}\n")).toBe(0);
    },
    SPAWNS_A_COMPILER,
  );
});
