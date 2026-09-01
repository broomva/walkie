import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AUDIO_OPTIONAL,
  AUDIO_REQUIRED,
  CLAUDE_ONLY,
  TEXT_OPTIONAL,
  TEXT_REQUIRED,
} from "../probes/elevenlabs-e2e/score";

/**
 * The declared check set must be the set the driver actually produces.
 *
 * `reconcile()` turns a missing check into a red — but only against a list that
 * is still true. Rename a check in drive-audio.ts and leave score.ts alone and
 * the gate inverts: the old name reads as permanently MISSING and the new one as
 * UNDECLARED, so the run is red for a reason that has nothing to do with the
 * agent. Two copies of a list is how that happens, so there is one copy and this
 * test holds the driver to it.
 *
 * Source-matched rather than executed, deliberately: drive-audio.ts opens a
 * WebSocket and exits without ELEVENLABS_API_KEY at import time, so it cannot be
 * imported. That is also why the names are string literals — keep them that way.
 */
const ROOT = resolve(import.meta.dir, "..");
const read = (f: string) => readFileSync(`${ROOT}/probes/elevenlabs-e2e/${f}`, "utf8");

/** Every `check("name", …)` in the driver, including the multi-line calls. */
function declaredInSource(source: string): string[] {
  return [...source.matchAll(/\bcheck\(\s*"([^"]+)"/g)].map((m) => m[1] as string);
}

const PROBES = [
  {
    driver: "drive-audio.ts",
    required: AUDIO_REQUIRED,
    optional: AUDIO_OPTIONAL,
    witness: "agent audio actually came back",
  },
  {
    driver: "drive.ts",
    required: TEXT_REQUIRED,
    optional: TEXT_OPTIONAL,
    witness: "the agent's FIRST tool call drains the queue",
  },
];

describe.each(PROBES)("$driver declared check set", ({ driver, required, optional, witness }) => {
  const inSource = declaredInSource(read(driver));

  test("the extractor sees EVERY check call, not just the ones it can parse", () => {
    // Two jobs. It guards against the regex silently matching nothing, which
    // would make every assertion below vacuously true — and it closes the
    // extractor's one-directional blind spot: the name tests catch a check being
    // RENAMED out of the declared set, but an ADDED check whose name is not a
    // double-quoted literal is neither MISSING nor UNDECLARED, so it is invisible
    // to them. Comparing call-site count against parsed-name count makes it loud.
    // Comments stripped first: a `check(` written inside a comment is not a call
    // site, and counting it made this test red for a source edit that changed
    // nothing. Residual and stated rather than hidden: a `check(` inside a STRING
    // literal is still counted, which no driver does today.
    const code = read(driver)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    const callSites = (code.match(/\bcheck\(/g) ?? []).length;
    expect(callSites).toBeGreaterThanOrEqual(required.length);
    expect(inSource.length).toBe(callSites);
    expect(inSource).toContain(witness);
  });

  test("every declared check exists in the driver", () => {
    const missing = [...required, ...optional].filter((n) => !inSource.includes(n));
    expect(missing).toEqual([]);
  });

  test("every check in the driver is declared", () => {
    const known = new Set<string>([...required, ...optional]);
    expect(inSource.filter((n) => !known.has(n))).toEqual([]);
  });

  test("no check asserts a literal — a predicate that cannot FAIL is the defect", () => {
    // D3's second half. `check("…", true, …)` is a branch-presence indicator, not
    // an assertion: it can be absent, never fail. The name-matching tests above
    // are blind to it — `check("barge-in…", true)` and
    // `check("barge-in…", sawInterruption)` are the same string to them, so
    // reverting D1 or D3 left every test in the repo green. This reads the
    // PREDICATE.
    //
    // A literal `false` is a different thing and is allowed on the fault paths
    // only: `check("completed within 180s", false, "timed out")` runs only when
    // the failure has already happened, and its job is to record it. That is why
    // those names are OPTIONAL. A literal `false` on a REQUIRED check would be a
    // check that can never PASS, which is equally meaningless, so it is caught.
    const offenders = [
      ...read(driver).matchAll(/\bcheck\(\s*(?:"([^"]+)"|`([^`]+)`)\s*,\s*(true|false)\s*[,)]/g),
    ]
      .map((m) => ({ name: (m[1] ?? m[2]) as string, literal: m[3] as string }))
      .filter((o) => o.literal === "true" || !(optional as readonly string[]).includes(o.name))
      .map((o) => `${o.name} -> ${o.literal}`);
    expect(offenders).toEqual([]);
  });

  test("the terminal branch is latched, so finish() cannot be re-entered", () => {
    // `finish()` polls for up to 30-40s and the event listener is async, so the
    // event loop stays free the whole time. A second agent_response re-entering
    // the terminal branch pushes every assertion in it a second time, and
    // reconcile then calls the DUPLICATE red — a run where every leg passed
    // reports failure. The sibling branches were already latched (spokeAsk /
    // spokeAnswer); this one was not.
    //
    // SOURCE-MATCHED, and that is a real limitation: the drivers open a
    // WebSocket at import, so they cannot be exercised in-process. This catches
    // the guard being deleted, not every way re-entry could be reintroduced.
    const src = read(driver);
    expect(src).toContain("finishing = true");
    expect(src).toMatch(/&&\s*!finishing\)/);
    // TWO latches, and they are not interchangeable. The branch latch above is
    // set BEFORE finish() is called, so finish() cannot reuse it — it needs its
    // own. Without it the socket `error` handler is a second entry point into a
    // function that polls for 30-40s with the socket still open, so an abnormal
    // termination in that window duplicates every check finish() pushes.
    expect(src).toContain("if (finished) return;");
    expect(src).toContain("finished = true;");
  });

  test("no check name is declared twice", () => {
    const all = [...required, ...optional];
    expect(new Set(all).size).toBe(all.length);
  });
});

test("every conditionally-required check is also in the text probe's required set", () => {
  // CLAUDE_ONLY subtracts from TEXT_REQUIRED at runtime. A name in one and not
  // the other silently subtracts nothing, which is the quiet version of the
  // defect this whole module exists to make loud.
  expect(CLAUDE_ONLY.filter((n) => !TEXT_REQUIRED.includes(n))).toEqual([]);
});

test("the README's stated leg count matches the declared set", () => {
  // The previous count ("five conversation legs") went stale the moment a check
  // was added, and nothing noticed — a number in prose that no test reads is the
  // same class of defect as a check that cannot fail.
  const readme = readFileSync(`${ROOT}/probes/elevenlabs-e2e/README.md`, "utf8");
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const conversationLegs = TEXT_REQUIRED.filter((n) => !CLAUDE_ONLY.includes(n)).length;
  expect(readme).toContain(`${words[conversationLegs]} conversation legs`);
  expect(readme).toContain(`${words[CLAUDE_ONLY.length]} Claude legs`);
});
