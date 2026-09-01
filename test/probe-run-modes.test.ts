import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * The shell halves of BRO-2406 (D4 and D5), tested by RUNNING them.
 *
 * These two defects survived a 19-mutant sweep because every gate in the repo
 * read TypeScript. Deleting the `sleep` from the wait loop, or making `--audio`
 * dispatch to the text probe, left all tests green — so the fixes were prose.
 *
 * `run.sh` as a whole cannot be executed here: it needs ELEVENLABS_API_KEY, live
 * quota, tmux and macOS `say`. So the mode block is extracted between markers and
 * executed VERBATIM — the shipped lines, not a re-implementation of them. If the
 * markers are removed the extraction fails loudly rather than silently passing.
 */
const ROOT = resolve(import.meta.dir, "..");
const PROBE = `${ROOT}/probes/elevenlabs-e2e`;

function modeBlock(): string {
  const src = readFileSync(`${PROBE}/run.sh`, "utf8");
  const m = src.match(/# --- mode-select-begin ---[\s\S]*?# --- mode-select-end ---/);
  if (!m) throw new Error("run.sh lost its mode-select markers — this test cannot verify anything");
  return m[0];
}

/** Run the real block with the given argv and ambient env; report what it chose. */
function selectMode(arg: string, env: Record<string, string> = {}) {
  const script = `set -euo pipefail\n${modeBlock()}\necho "MODE=$MODE WALKIE_AUDIO=${"${WALKIE_AUDIO:-unset}"}"`;
  const r = Bun.spawnSync(["bash", "-c", script, "run.sh", arg], {
    env: { ...process.env, ...env } as Record<string, string>,
  });
  return { out: r.stdout.toString().trim(), code: r.exitCode, err: r.stderr.toString() };
}

describe("run.sh mode selection (D5)", () => {
  test("the extractor finds the block — it can report a presence", () => {
    expect(modeBlock()).toContain("--audio");
  });

  test("--audio selects the audio probe", () => {
    expect(selectMode("--audio").out).toBe("MODE=audio WALKIE_AUDIO=1");
  });

  test("no argument is the text probe", () => {
    expect(selectMode("").out).toBe("MODE=text WALKIE_AUDIO=0");
  });

  // The regression the once-over missed: --audio exports WALKIE_AUDIO=1, and
  // create-agent.ts reads it from the AMBIENT environment. A text run that does
  // not clear it prints "text transport" and then builds text_only:false.
  test("an inherited WALKIE_AUDIO=1 does not survive the text path", () => {
    expect(selectMode("--text", { WALKIE_AUDIO: "1" }).out).toBe("MODE=text WALKIE_AUDIO=0");
    expect(selectMode("", { WALKIE_AUDIO: "1" }).out).toBe("MODE=text WALKIE_AUDIO=0");
  });

  test("an unknown flag is refused, not silently treated as text", () => {
    const r = selectMode("--audioo");
    expect(r.code).toBe(2);
    expect(r.err).toContain("usage");
  });

  test("the dispatch actually runs the driver the mode names", () => {
    const src = readFileSync(`${PROBE}/run.sh`, "utf8");
    const tail = src.slice(src.indexOf("# --- mode-select-end ---"));
    expect(tail).toMatch(/if \[ "\$MODE" = audio \]; then\s+bun run drive-audio\.ts/);
    expect(tail).toMatch(/else\s+bun run drive\.ts/);
  });
});

describe("wait-for-session.sh budget (D4)", () => {
  test("a failing wait takes AT LEAST its budget, not one second", () => {
    const dir = mkdtempSync(join(tmpdir(), "walkie-wait-"));
    try {
      const started = Bun.nanoseconds();
      const r = Bun.spawnSync([`${PROBE}/wait-for-session.sh`, "no-such-session", "2", dir]);
      const elapsedMs = (Bun.nanoseconds() - started) / 1e6;
      expect(r.exitCode).toBe(1);
      expect(r.stderr.toString()).toContain("never registered");
      // The defect: `for _ in $(seq 1 90)` with no sleep spun 90 filesystem
      // probes in about a second while reading as a 90-second budget.
      expect(elapsedMs).toBeGreaterThanOrEqual(2000);
      expect(elapsedMs).toBeLessThan(8000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);

  test("it returns the record as soon as one appears", async () => {
    const dir = mkdtempSync(join(tmpdir(), "walkie-wait-"));
    try {
      // AWAITED. `Bun.write` returns a promise and `Bun.spawnSync` runs
      // immediately, so unawaited the waiter could scan the directory before the
      // fixture existed — a test that passes on timing rather than on behaviour.
      await Bun.write(join(dir, "s.json"), '{"name":"walkie-e2e-target"}');
      const r = Bun.spawnSync([`${PROBE}/wait-for-session.sh`, "walkie-e2e-target", "5", dir]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout.toString().trim()).toBe(join(dir, "s.json"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);
});
