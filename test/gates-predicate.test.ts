/**
 * The predicate behind the one required status check.
 *
 * `gates` is the only context branch protection names, so it is the single point
 * where "CI is green" becomes "this may merge". The P20 round-2 review replaced
 * the whole step with `run: echo "all gates succeeded"` and neither `bun test`
 * nor the mutation sweep noticed: 25 tests passed, 8 mutants, 0 survivors, both
 * exit 0. The job that gates merges could be reduced to a no-op with every check
 * in the repo still reporting success.
 *
 * That is why the logic moved out of ci.yml into a script. Inline, it could not
 * be given inputs. Here it can, and `skipped` — the value that matters most,
 * because GitHub counts a skipped required check as PASSING — gets an assertion
 * of its own.
 */
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SCRIPT = resolve(ROOT, "scripts/assert-gates-succeeded.sh");

function assertGates(needs: string): number {
  return Bun.spawnSync([SCRIPT], { cwd: ROOT, env: { ...process.env, NEEDS: needs } }).exitCode;
}

const ok = (n: number) =>
  JSON.stringify(
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`j${i}`, { result: "success" }])),
  );

describe("the aggregate accepts only an all-success run", () => {
  test("every dependency succeeded", () => {
    expect(assertGates(ok(5))).toBe(0);
  });

  // One case per value GitHub can put in `needs.<job>.result`. `success` is the
  // only one that may pass; the rest are enumerated rather than covered by a
  // single `failure` case, because the interesting one is not `failure`.
  for (const result of ["failure", "cancelled", "skipped"]) {
    test(`a dependency reporting "${result}" fails the aggregate`, () => {
      expect(assertGates(`{"lint":{"result":"success"},"test":{"result":"${result}"}}`)).not.toBe(
        0,
      );
    });
  }

  test("a skipped dependency is not a pass", () => {
    // Spelled out separately because it is the one that reads as green to
    // GitHub. Weakening the predicate from `!= "success"` to `== "failure"` —
    // a one-token change — reopens exactly this hole and nothing else here
    // would catch it.
    expect(assertGates('{"lint":{"result":"skipped"}}')).not.toBe(0);
  });

  test("an aggregate with no dependencies is not a pass", () => {
    // Gating on nothing is a misconfiguration, not a success.
    expect(assertGates("{}")).not.toBe(0);
  });

  test("an unparseable needs context is not a pass", () => {
    expect(assertGates("not json")).not.toBe(0);
  });
});
