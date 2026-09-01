import { describe, expect, test } from "bun:test";
import {
  type Check,
  AUDIO_OPTIONAL as OPTIONAL,
  AUDIO_REQUIRED as REQUIRED,
  reconcile,
  report,
} from "../probes/elevenlabs-e2e/score";

const ok = (name: string): Check => ({ name, ok: true, detail: "" });

describe("probe score reconciliation", () => {
  test("a complete run passes and counts every declared check", () => {
    const r = reconcile(REQUIRED.map(ok), REQUIRED, OPTIONAL);
    expect(r.ok).toBe(true);
    expect(r.passed).toBe(REQUIRED.length);
    expect(r.total).toBe(REQUIRED.length);
    expect(r.missing).toEqual([]);
  });

  // THE NEGATIVE CONTROL FOR D3, and the reason this module exists.
  //
  // Reproduces the reachable ordering hazard: `agent_response` carrying the ask
  // arrives after `answer_ask` has set sawAnswer, so the "agent spoke the queued
  // ask aloud" check never runs. Every check that DID run passed.
  test("a skipped branch is red, not a smaller denominator", () => {
    const skipped = "agent spoke the queued ask aloud";
    const ran = REQUIRED.filter((n) => n !== skipped).map(ok);

    // What the old code computed: `${results.length - bad.length}/${results.length}`
    // with `process.exit(bad.length ? 1 : code)`. Asserted here so this test
    // proves it DISCRIMINATES — the same input that reconcile calls red, the
    // superseded formula called a clean pass.
    const bad = ran.filter((r) => !r.ok);
    expect(`${ran.length - bad.length}/${ran.length}`).toBe(
      `${REQUIRED.length - 1}/${REQUIRED.length - 1}`,
    );
    expect(bad.length === 0).toBe(true); // old exit code: 0

    const r = reconcile(ran, REQUIRED, OPTIONAL);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual([skipped]);
    expect(r.passed).toBe(REQUIRED.length - 1);
    expect(r.total).toBe(REQUIRED.length); // the denominator no longer floats
    expect(report(r)).toContain("MISSING");
  });

  test("a check nobody declared is red, so the declared set cannot rot", () => {
    const r = reconcile([...REQUIRED.map(ok), ok("a check someone added")], REQUIRED, OPTIONAL);
    expect(r.ok).toBe(false);
    expect(r.unexpected).toEqual(["a check someone added"]);
  });

  test("a duplicated check is red, so the numerator cannot be inflated", () => {
    const r = reconcile([...REQUIRED.map(ok), ok(REQUIRED[0] as string)], REQUIRED, OPTIONAL);
    expect(r.ok).toBe(false);
    expect(r.duplicated).toEqual([REQUIRED[0] as string]);
  });

  test("an absent fault-path check is fine; one that fired is counted", () => {
    const clean = reconcile(REQUIRED.map(ok), REQUIRED, OPTIONAL);
    expect(clean.total).toBe(REQUIRED.length);

    const timedOut = reconcile(
      [...REQUIRED.map(ok), { name: "completed within 180s", ok: false, detail: "timed out" }],
      REQUIRED,
      OPTIONAL,
    );
    expect(timedOut.ok).toBe(false);
    expect(timedOut.total).toBe(REQUIRED.length + 1);
  });

  test("the numerator cannot exceed the denominator", () => {
    // Counting rows rather than distinct names let a duplicate print 12/11.
    const r = reconcile([...REQUIRED.map(ok), ok(REQUIRED[0] as string)], REQUIRED, OPTIONAL);
    expect(r.passed).toBeLessThanOrEqual(r.total);
    expect(r.passed).toBe(REQUIRED.length);
  });

  test("the report names what failed, not just how many", () => {
    const ran = REQUIRED.map((n) =>
      n === "agent audio actually came back" ? { name: n, ok: false, detail: "0 events" } : ok(n),
    );
    const out = report(reconcile(ran, REQUIRED, OPTIONAL));
    expect(out).toContain("FAIL");
    expect(out).toContain("agent audio actually came back");
    expect(out).toContain("0 events");
  });

  test("an empty declared set is refused, not scored 0/0", () => {
    // Every divergence list is empty when nothing is required, so `ok` would be
    // true and the report would read "0/0 checks passed" — a vacuous pass inside
    // the module written to forbid vacuous passes.
    expect(() => reconcile([], [], [])).toThrow(/required set is empty/);
    expect(() => reconcile(REQUIRED.map(ok), [], OPTIONAL)).toThrow();
  });

  test("a MIXED duplicate does not count as passed", () => {
    // One execution of a check ok, another not. Distinctness alone put the name
    // in `passed` because SOME execution passed, so the report could print
    // "11/11 checks passed" and "FAIL" together — a number contradicting its own
    // verdict, in the module whose whole job is that the number means something.
    const dup = REQUIRED[0] as string;
    const r = reconcile(
      [...REQUIRED.map(ok), { name: dup, ok: false, detail: "second run failed" }],
      REQUIRED,
      OPTIONAL,
    );
    expect(r.ok).toBe(false);
    expect(r.duplicated).toContain(dup);
    // the load-bearing one: the name must NOT be credited
    expect(r.passed).toBe(REQUIRED.length - 1);
    expect(r.passed).toBeLessThan(r.total);
  });

  test("a genuine FAIL is still red", () => {
    const ran = REQUIRED.map((n) =>
      n === "ASR heard the workspace answer" ? { name: n, ok: false, detail: "(none)" } : ok(n),
    );
    const r = reconcile(ran, REQUIRED, OPTIONAL);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual([]);
    expect(r.failed.map((f) => f.name)).toEqual(["ASR heard the workspace answer"]);
  });
});
