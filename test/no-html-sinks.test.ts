// `src/render.ts` opens with "there is no innerHTML in this file, and a test
// asserts that". P20 found no such test: the sentence was load-bearing for the
// whole XSS argument and enforced by nothing. This is it.
//
// Source-level rather than behavioural, on purpose. The behavioural tests can
// only cover the sinks someone thought of; this covers the ones nobody did.
// Both directions are wanted, and only one of them scales.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

const trackedSources = Bun.spawnSync(
  ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard", "src"],
  { cwd: ROOT },
)
  .stdout.toString()
  .split("\0")
  .map((l) => l.trim())
  .filter((l) => l.endsWith(".ts"))
  .sort();

/** Every DOM API that PARSES a string as markup. `textContent` is not here: it
 *  is the whole point — it assigns text and cannot produce an element. */
const SINKS = ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "srcdoc"];

describe("no markup-parsing sink exists in src/", () => {
  test("the walk found source files — an empty set would pass every check below", () => {
    expect(trackedSources.length).toBeGreaterThan(0);
  });

  for (const sink of SINKS) {
    test(`no src file uses ${sink}`, () => {
      const offenders = trackedSources.filter((f) =>
        readFileSync(resolve(ROOT, f), "utf8")
          .split("\n")
          // A mention inside a comment is the file EXPLAINING the rule, which is
          // the opposite of breaking it.
          .filter((l) => {
            const t = l.trimStart();
            return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
          })
          .some((l) => l.includes(sink)),
      );
      expect(offenders).toEqual([]);
    });
  }
});

/**
 * THE DETECTOR MUST BE ABLE TO DETECT. The sibling `no-local-paths.test.ts`
 * establishes this both-polarity pattern and this file shipped without it —
 * while carrying a comment-stripping filter, which is precisely the part that
 * can silently over-filter and turn the whole check green.
 */
describe("the sink detector still discriminates", () => {
  const hasSink = (source: string, sink: string) =>
    source
      .split("\n")
      .filter((l) => {
        const t = l.trimStart();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .some((l) => l.includes(sink));

  for (const sink of SINKS) {
    test(`it flags ${sink} in code`, () => {
      expect(hasSink(`node.${sink} = value;`, sink)).toBe(true);
    });
    test(`it does NOT flag ${sink} inside a comment`, () => {
      expect(hasSink(`// never use ${sink} here`, sink)).toBe(false);
    });
  }
});
