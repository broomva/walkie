import { describe, expect, test } from "bun:test";
/**
 * The checkers must be looking at everything they are believed to be looking at.
 *
 * A gate is not weakened by being made to fail — it is weakened by being made to
 * look at less. `tsconfig.include` narrowed, or `biome.files.ignore` widened, and
 * the pipeline stays green over a shrinking program. Nothing else in this repo
 * would notice: `tsc` exits 0 on a one-file program just as happily as on four.
 *
 * I know this shape catches something real because the first guard I wrote here
 * did not. It asserted `filesInProgram > 0`, which passes when `include` is
 * narrowed from three directories to one — precisely the drift worth catching —
 * and is redundant when the program is fully empty, because tsc already errors
 * TS18003 on its own.
 *
 * So both assertions below compare against the tracked file set rather than
 * against a threshold: what git says the repo contains has to equal what the
 * checker says it read.
 */
import { writeFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const POSITIVE_CONTROL_TYPE: number = "not a number";
console.log(POSITIVE_CONTROL_TYPE);

function run(cmd: string[]): string {
  const p = Bun.spawnSync(cmd, { cwd: ROOT });
  return p.stdout.toString();
}

/**
 * Files git would show as present-and-not-ignored, filtered to an extension set.
 * `--cached --others --exclude-standard` is deliberate: biome runs with
 * `vcs.useIgnoreFile`, so it reads untracked files too, and comparing its count
 * against tracked-only would drift by exactly the number of new files in the
 * tree. In CI the two sets coincide, because a checkout has no untracked files.
 */
function tracked(extensions: readonly string[]): string[] {
  return run(["git", "ls-files", "--cached", "--others", "--exclude-standard"])
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && extensions.some((e) => l.endsWith(e)))
    .sort();
}

describe("tsc reads every tracked TypeScript file", () => {
  test("no tracked .ts file is outside the program", () => {
    const expected = tracked([".ts"]);
    expect(expected.length).toBeGreaterThan(0); // the walk itself must find something

    const inProgram = new Set(
      run(["bunx", "tsc", "--noEmit", "--listFiles"])
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith(`${ROOT}/`))
        .map((l) => l.slice(ROOT.length + 1))
        .filter((l) => !l.startsWith("node_modules/")),
    );

    const missing = expected.filter((f) => !inProgram.has(f));
    expect(missing).toEqual([]);
  });
});

describe("biome reads every tracked file it understands", () => {
  // Biome reports a count, not a list, so this compares counts. Narrowing
  // `files.ignore` to hide a directory moves the count and fails here.
  test("biome's file count equals the tracked file count", () => {
    // `bun.lock` is JSONC and biome does not claim it; everything else with one
    // of these extensions is fair game.
    const expected = tracked([
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".json",
      ".jsonc",
    ]).filter((f) => f !== "bun.lock");
    expect(expected.length).toBeGreaterThan(0);

    const out = run(["bunx", "biome", "ci", "--reporter=json", "."]);
    const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    const seen: number = json.summary.changed + json.summary.unchanged + json.summary.skipped;

    expect({ seen, expected: expected.length, files: expected }).toMatchObject({
      seen: expected.length,
    });
  });
});

/**
 * Coverage says which files a checker reads. It says nothing about whether the
 * checker still has rules. `linter.enabled: false` in biome.json leaves every
 * file count identical and every diagnostic gone — a mutation the coverage
 * assertions above genuinely survive, which is how this block came to exist.
 *
 * Asserting that biome.json says `enabled: true` would not fix it: reading our
 * own config back is the config agreeing with itself. So the checkers are RUN,
 * over the repo's real config, against code that must be rejected and code that
 * must be accepted.
 *
 * The negative control is not decoration. The first version of this ran biome
 * through `--stdin-file-path`, which exits 1 unconditionally in stdin mode
 * ("The contents aren't fixed") — so the rejection test passed while carrying
 * no signal at all. Only the acceptance test failing exposed it. A planted
 * defect proves the instrument runs; it takes both polarities to show the
 * instrument can tell the two cases apart.
 */
describe("the checkers still have rules", () => {
  /** A scratch git repo carrying THIS repo's biome.json, so the real rule set applies. */
  function biomeExit(source: string): number {
    const dir = Bun.spawnSync(["mktemp", "-d"]).stdout.toString().trim();
    try {
      // biome runs with vcs.useIgnoreFile, and hard-fails outside a git repo.
      Bun.spawnSync(["git", "init", "-q", dir]);
      Bun.spawnSync(["cp", `${ROOT}/biome.json`, `${dir}/biome.json`]);
      writeFileSync(`${dir}/subject.ts`, source);
      // NOT `bunx biome`: outside a directory whose node_modules holds
      // @biomejs/biome, bunx resolves npm's unrelated `biome` package (0.3.3),
      // which exits 0 on everything. Measured, not guessed.
      return Bun.spawnSync([`${ROOT}/node_modules/.bin/biome`, "ci", "subject.ts"], { cwd: dir })
        .exitCode;
    } finally {
      Bun.spawnSync(["rm", "-rf", dir]);
    }
  }

  test("biome rejects code violating a rule this repo enables", () => {
    // `"x" + a + "y"` is lint/style/useTemplate, part of `recommended`.
    expect(biomeExit('const a = 1;\nconst b = "x" + a + "y";\nconsole.log(b);\n')).not.toBe(0);
  });

  test("biome accepts the same code with the violation removed", () => {
    expect(biomeExit("const a = 1;\nconst b = `x${a}y`;\nconsole.log(b);\n")).toBe(0);
  });

  /**
   * Written outside the repo so it cannot perturb the coverage counts above, but
   * `extends`-ing the repo's own tsconfig so the assertion is about THIS repo's
   * strictness and not about tsc's.
   *
   * The first version passed `--strict` on the command line. That version
   * survived flipping `"strict": false` in tsconfig.json — it proved tsc obeys
   * `--strict`, which was never in question, and said nothing about what the
   * repo asks for. `typeRoots` is pinned back at the repo because a scratch
   * directory has no node_modules to resolve `types: ["bun"]` from.
   */
  function tscExit(source: string): number {
    const dir = Bun.spawnSync(["mktemp", "-d"]).stdout.toString().trim();
    try {
      writeFileSync(
        `${dir}/tsconfig.json`,
        JSON.stringify({
          extends: `${ROOT}/tsconfig.json`,
          compilerOptions: { typeRoots: [`${ROOT}/node_modules/@types`] },
          include: ["subject.ts"],
        }),
      );
      writeFileSync(`${dir}/subject.ts`, source);
      return Bun.spawnSync(
        [`${ROOT}/node_modules/.bin/tsc`, "--noEmit", "-p", `${dir}/tsconfig.json`],
        { cwd: ROOT },
      ).exitCode;
    } finally {
      Bun.spawnSync(["rm", "-rf", dir]);
    }
  }

  test("tsc rejects code violating the strictness this repo sets", () => {
    // Implicit any on a parameter — an error only because `strict` is on.
    expect(tscExit("export function f(x) {\n  return x;\n}\n")).not.toBe(0);
  });

  test("tsc accepts the same code once the parameter is typed", () => {
    expect(tscExit("export function f(x: number): number {\n  return x;\n}\n")).toBe(0);
  });
});
