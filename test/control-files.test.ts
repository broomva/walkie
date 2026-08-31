import { describe, expect, test } from "bun:test";
/**
 * Every machine-read file under .control/ must parse.
 *
 * This exists because of a live failure, not a hypothetical one:
 * `.control/asks/architecture.yaml` sat machine-unreadable for three commits
 * because a note contained `full history: the only` — a colon-space ends a YAML
 * plain scalar. It was broken by the very commit that claimed to close an ask
 * inside it, and nothing noticed, because nothing read it.
 *
 * Two properties matter more than "the files parse", and both are asserted below:
 *
 *   1. Every file under .control/ must be ACCOUNTED FOR, not merely matched. A
 *      pattern that matches nothing parses nothing and reports success — it
 *      passes hardest exactly when it has stopped looking. Worse, an extension
 *      quietly dropped from the list makes that file vanish from the suite with
 *      no test going red. So the walk is inverted: anything found and not
 *      recognised is a failure until a human either adds a parser or names it
 *      in UNPARSED.
 *   2. The parsers must be able to REJECT. A lenient parser turns this whole
 *      file into a formality, so each parser is fed the real malformation and
 *      must throw. If someone swaps `Bun.YAML` for something forgiving, that is
 *      the assertion that goes red.
 *
 * Extensions cover `.jsonl` deliberately: `.control/leverage-metrics.jsonl` is a
 * control file, and a `*.json` glob does not match it.
 */
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const CONTROL = join(ROOT, ".control");
const EXTENSIONS = [".yaml", ".yml", ".json", ".jsonl"];

/**
 * Files under .control/ that are deliberately not machine-parsed here. Empty on
 * purpose: an entry is a decision someone has to write down, not a default.
 */
const UNPARSED: readonly string[] = [];

function parseYaml(source: string): unknown {
  return Bun.YAML.parse(source);
}

function parseJson(source: string): unknown {
  return JSON.parse(source);
}

/** One JSON value per non-blank line. Blank lines are permitted; garbage is not. */
function parseJsonl(source: string): unknown[] {
  return source
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function parserFor(path: string): (source: string) => unknown {
  if (path.endsWith(".jsonl")) return parseJsonl;
  if (path.endsWith(".json")) return parseJson;
  return parseYaml;
}

// Enumerated through git, not the filesystem. A recursive readdir picks up
// anything the OS drops in — macOS writes .DS_Store into directories unprompted,
// and the repo root already carries one — which reddens the suite over a file
// `git status` reports as clean, i.e. a failure with no diff to point at.
const everything = Bun.spawnSync(
  ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", ".control"],
  { cwd: ROOT },
)
  .stdout.toString()
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.length > 0)
  .map((rel) => join(ROOT, rel))
  .sort();

const controlFiles = everything.filter((path) => EXTENSIONS.some((ext) => path.endsWith(ext)));
const unrecognised = everything.filter(
  (path) =>
    !EXTENSIONS.some((ext) => path.endsWith(ext)) && !UNPARSED.includes(relative(ROOT, path)),
);

describe(".control/ files parse", () => {
  test("discovery found at least one control file", () => {
    // Zero files found means the walk broke or the directory moved, NOT that
    // every control file is healthy.
    expect(controlFiles.length).toBeGreaterThan(0);
  });

  test("every file under .control/ is accounted for", () => {
    // Drop an extension from EXTENSIONS and its files stop being tested — with
    // nothing going red, because a test that no longer exists cannot fail. This
    // is the assertion that notices.
    expect(unrecognised.map((p) => relative(ROOT, p))).toEqual([]);
  });

  test.each(controlFiles.map((p) => [relative(ROOT, p), p] as const))(
    "%s parses",
    (_name, path) => {
      const source = readFileSync(path, "utf8");
      expect(() => parserFor(path)(source)).not.toThrow();
    },
  );
});

describe("the parsers can still reject", () => {
  // Each input below is the shape that actually broke, or its direct analogue.
  // A parser that accepts one of these makes the block above vacuous.

  test("YAML rejects a colon-space inside a plain scalar", () => {
    expect(() => parseYaml("note: full history: the only\n")).toThrow();
  });

  test("YAML rejects a bad indent", () => {
    expect(() => parseYaml("a:\n  b: 1\n   c: 2\n")).toThrow();
  });

  test("JSON rejects a trailing comma", () => {
    expect(() => parseJson('{"a": 1,}')).toThrow();
  });

  test("JSONL rejects a line that is not a JSON value", () => {
    expect(() => parseJsonl('{"a":1}\nnot json\n')).toThrow();
  });

  test("JSONL does not silently accept a whole-file JSON array", () => {
    // The classic .jsonl/.json mixup: pretty-printed JSON spread over lines.
    expect(() => parseJsonl('[\n  {"a":1}\n]\n')).toThrow();
  });
});
