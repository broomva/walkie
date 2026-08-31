import { describe, expect, test } from "bun:test";
/**
 * Every job in the CI workflow must be a dependency of the one required check.
 *
 * `gates` is the single context branch protection names. That is deliberate — a
 * required-check LIST drifts, because adding a gate and marking it required are
 * two separate acts and only the first is in the diff. Naming one aggregate
 * moves the drift into a file where it can be tested.
 *
 * The first attempt at testing it did not work, and failed in the exact way this
 * repo exists to catch. It lived in the workflow itself:
 *
 *     n="$(echo "$NEEDS" | jq 'length')"
 *     if [ "$n" -ne "$EXPECTED" ]; then ... fi     # EXPECTED: "5"
 *
 * `toJSON(needs)` can only ever contain the keys listed in `needs:`. So the
 * count is the length of the `needs:` list, compared against a literal set to
 * the length of the `needs:` list. Add a sixth job and leave it out of `needs:`
 * — the thing the check was written for, and documented three times as doing —
 * and the object still has five keys, the literal still says five, and it passes.
 * It compared the list against itself.
 *
 * The fix is to compare two lists that are genuinely independent: the `jobs:`
 * keys, and `gates.needs`. Both live in the same file, but neither is derived
 * from the other, so adding a job without wiring it in makes them disagree.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const WORKFLOW = resolve(ROOT, ".github/workflows/ci.yml");

// Bun.YAML rather than an npm dependency: it is in the runtime this repo already
// pins, and test/control-files.test.ts proves it can still reject malformed input.
const workflow = Bun.YAML.parse(readFileSync(WORKFLOW, "utf8")) as {
  jobs: Record<string, { needs?: string[]; if?: string; steps?: { run?: string }[] }>;
};

const AGGREGATE = "gates";

describe("the required check covers every job", () => {
  test("the workflow parses and defines jobs", () => {
    expect(Object.keys(workflow.jobs ?? {}).length).toBeGreaterThan(1);
  });

  test(`every job other than \`${AGGREGATE}\` is in \`${AGGREGATE}.needs\``, () => {
    const all = Object.keys(workflow.jobs).filter((j) => j !== AGGREGATE);
    const needs = workflow.jobs[AGGREGATE]?.needs ?? [];
    expect([...all].sort()).toEqual([...needs].sort());
  });

  test(`\`${AGGREGATE}\` actually evaluates its dependencies' results`, () => {
    // Round 2 replaced the whole step with `echo "all gates succeeded"` and
    // nothing noticed. The predicate now lives in a script so it can be tested
    // (test/gates-predicate.test.ts); this asserts the job still CALLS it, so
    // gutting the step is caught here rather than nowhere.
    const steps = workflow.jobs[AGGREGATE]?.steps ?? [];
    const runs = steps.map((st) => st.run ?? "").join("\n");
    expect(runs).toContain("scripts/assert-gates-succeeded.sh");
  });

  test(`\`${AGGREGATE}\` runs even when a dependency fails`, () => {
    // Without this, the job is SKIPPED when a dependency fails — and GitHub
    // counts a skipped required check as PASSING, so the aggregate would go
    // green precisely when a gate had failed.
    expect(workflow.jobs[AGGREGATE]?.if).toContain("!cancelled()");
  });
});
