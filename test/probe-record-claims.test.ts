import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Claims BRO-2406 retracted must not come back as live text.
 *
 * The record fix landed twice at exactly the sites someone had enumerated, and
 * both times a further site was found afterwards by looking one row down. That
 * is the shape this guards: not "is the prose good", which no test can decide,
 * but "did a specific sentence we deleted reappear".
 *
 * Deliberately a DENYLIST of exact strings, not a pattern over scores. A regex
 * loose enough to catch any score claim is loose enough to match the retractions
 * quoting them, and tightening it becomes a prose linter that relocates the hole
 * rather than closing it. The cost is stated plainly: this catches
 * REINTRODUCTION of these claims, and cannot catch a NEW false claim worded
 * differently. That surface is left to review.
 *
 * A retraction has to quote what it retracts, so a hit is an offence only when
 * the surrounding line does not mark it as corrected. That exemption is a hole,
 * and its size is measured rather than asserted.
 *
 * The marker set is deliberately TWO dated/uppercase strings. It began with four,
 * including `"used to"` — ordinary English, which exempted **10 lines** against 4
 * for the dated marker, so `The probe used to be shaky, but the audio run
 * returned 9/10` passed: an accidental false claim, not a deliberate defeat.
 * Narrowing to markers nobody writes by accident cost nothing (no real retraction
 * in the tree used the other two).
 *
 * What remains is deliberate defeat only: a line reading
 * `CORRECTED: the probe is PROVEN — 10/10 and always was` still passes. That is
 * outside what a text check can prevent, and it is why this file is a backstop
 * against accidental reintroduction, not evidence that the record is true.
 */
const ROOT = resolve(import.meta.dir, "..");

/** Every claim BRO-2406 established was false, verbatim as it was written. */
const RETRACTED = [
  "PROVEN — 10/10",
  "returned 9/10",
  "closed the loop 10/10",
  "Five defects are open",
  "is invoked by no script",
  "because barge-in works",
];

/** A line carrying one of these is retracting, not asserting. */
const RETRACTION_MARKERS = ["Corrected 2026-09-01", "CORRECTED"];

function tracked(): string[] {
  const out = Bun.spawnSync(
    ["git", "ls-files", "--", "*.md", "*.html", "*.yaml", "*.yml", "*.ts", "*.sh"],
    { cwd: ROOT },
  ).stdout.toString();
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

describe("retracted claims stay retracted", () => {
  const files = tracked().filter((f) => !f.startsWith("test/probe-record-claims"));

  test("the scan sees a real file set", () => {
    // Without this the assertion below passes the moment git ls-files returns
    // nothing — the failure mode this whole ticket is about.
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain("AGENTS.md");
  });

  test("no retracted claim appears as a live assertion", () => {
    const offences: string[] = [];
    for (const f of files) {
      let body: string;
      try {
        body = readFileSync(`${ROOT}/${f}`, "utf8");
      } catch {
        continue;
      }
      body.split("\n").forEach((line, i) => {
        if (RETRACTION_MARKERS.some((m) => line.includes(m))) return;
        for (const claim of RETRACTED) {
          if (line.includes(claim)) offences.push(`${f}:${i + 1} — ${claim}`);
        }
      });
    }
    expect(offences).toEqual([]);
  });
});
