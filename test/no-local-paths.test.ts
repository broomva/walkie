/**
 * No committed file may carry a local filesystem path.
 *
 * This repository is public, and it broke this rule before the rule existed.
 * Three committed documents — including all three supersession stamps, whose
 * entire job is naming the document that replaces them — pointed at the record
 * through:
 *
 *     ../../../../orca/workspaces/broomva/goldeye/docs/specs/...
 *
 * `goldeye` was a session worktree. By the time anyone read it, it was gone. So
 * every pointer to the record resolved for nobody, on any machine, while looking
 * entirely plausible. It also published the local directory layout.
 *
 * AGENTS.md states the rule. This is what makes it checkable — because a rule in
 * a conventions file that nothing enforces is the failure this repo's whole
 * merge gate exists to prevent, and writing one would have been hypocrisy at
 * best.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

/** Shapes that only ever resolve on one machine. */
const LOCAL_PATH = /(?:\/Users\/[a-z]|\/home\/[a-z]|~\/broomva|orca\/workspaces)/i;

/**
 * Files exempt from the rule, each for a stated reason. Explicit, because an
 * exemption is a decision someone writes down — deriving one from a pattern is
 * how the next path slips in unnoticed.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  ".control/leverage-metrics.jsonl": "machine-generated telemetry, absolute paths by design",
  ".control/leverage-state.json": "machine-generated telemetry, absolute paths by design",
  "test/no-local-paths.test.ts": "this file quotes the offending shapes in order to detect them",
  "AGENTS.md": "states the rule, and cites the path that motivated it",
  "docs/design/walkie-screens.html":
    "design mockup — the workspace paths are rendered UI content, the thing being designed, not links",
};

/** Text files git is tracking. Binary blobs (.pen, .png) are not scanned. */
const TEXT = [".md", ".html", ".json", ".jsonl", ".yaml", ".yml", ".ts", ".sh", ".glsl", ".swift"];

const tracked = Bun.spawnSync(
  ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  {
    cwd: ROOT,
  },
)
  .stdout.toString()
  .split("\0")
  .map((l) => l.trim())
  .filter((l) => l.length > 0 && TEXT.some((e) => l.endsWith(e)))
  .sort();

describe("no committed file carries a local filesystem path", () => {
  test("there are files to scan", () => {
    expect(tracked.length).toBeGreaterThan(0);
  });

  test("every exemption still names a file that exists", () => {
    // An exemption outliving its file is a hole nobody closed.
    expect(Object.keys(EXEMPT).filter((f) => !tracked.includes(f))).toEqual([]);
  });

  const subjects = tracked.filter((f) => !(f in EXEMPT));

  test.each(subjects)("%s", (file) => {
    const hits = readFileSync(resolve(ROOT, file), "utf8")
      .split("\n")
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => LOCAL_PATH.test(line))
      .map(([n, line]) => `${file}:${n}: ${line.trim().slice(0, 100)}`);
    expect(hits).toEqual([]);
  });
});

describe("the detector can still detect", () => {
  // Both polarities. Without these, a regex that stopped matching anything
  // would leave every assertion above passing over nothing.
  test.each([
    "/Users/someone/broomva/apps/walkie/x.ts",
    "~/broomva/docs/specs/a.html",
    "../../../../orca/workspaces/broomva/goldeye/docs/specs/a.html",
    "/home/runner/work/walkie/walkie",
  ])("rejects %s", (p) => {
    expect(LOCAL_PATH.test(p)).toBe(true);
  });

  test.each([
    "docs/specs/2026-08-30-walkie-target-architecture.html in broomva/workspace",
    "./scripts/mutation-sweep.sh",
    "probes/elevenlabs-e2e/run.sh",
  ])("accepts %s", (p) => {
    expect(LOCAL_PATH.test(p)).toBe(false);
  });
});
