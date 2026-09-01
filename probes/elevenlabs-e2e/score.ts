// The probe's score, reconciled against a DECLARED check set.
//
// Why this module exists. Both drivers used to print
// `${results.length - bad.length}/${results.length}` and exit on `bad.length`
// alone. `results` is populated only by branches that actually fire, so the
// denominator was whatever ran: a run that skipped a branch printed N/N and
// exited 0. A missing check was indistinguishable from a passing one — the
// failure presented as absence.
//
// A concretely reachable instance, in drive-audio.ts: the check "agent spoke
// the queued ask aloud" lives in the `!sawAnswer` branch of `agent_response`,
// while `finish(0)` is reached from the sibling `sawAnswer` branch. If an
// `agent_response` carrying the ask arrives after `answer_ask` has landed, that
// check never runs and the probe reports a clean sweep. Ordering held by
// conversational convention, not by anything in the code.
//
// The fix is not a bigger try/catch: it is to state the check set up front and
// treat any divergence from it — missing, unexpected, or duplicated — as red.

export type Check = { name: string; ok: boolean; detail: string };

// Every check a complete audio run must produce, declared up front. The score is
// reconciled against this in finish(); see score.ts for why a floating
// denominator made a skipped check indistinguishable from a passing one.
export const AUDIO_REQUIRED = [
  "conversation opened with an id",
  "first tool call drains the queue (audio path)",
  "agent spoke the queued ask aloud",
  "spoken answer reached the tool with the right ticket",
  "the spoken answer survived speech to text to tool",
  "answer posted into the Claude Code session",
  "ASR heard the first utterance",
  "ASR heard the workspace answer",
  "agent audio actually came back",
  "barge-in: an interruption event was observed",
  "the Claude Code session woke from a spoken answer",
];
// Fault paths. They only push on failure, so a clean run must not require them.
export const AUDIO_OPTIONAL = ["completed within 180s", "conversation socket connects"];

/** The text probe's declared happy path. */
export const TEXT_REQUIRED = [
  "conversation started",
  "the agent's FIRST tool call drains the queue",
  "agent spoke the queued ask",
  "agent called answer_ask carrying the ticket",
  "the answer survived the round trip",
  "answer posted into the Claude Code session socket",
  "agent confirmed after delivering the answer",
  "the Claude Code session woke and wrote the artifact",
];
/** Required only when WALKIE_EXPECT_CLAUDE is on — there is no session otherwise. */
export const CLAUDE_ONLY = [
  "answer posted into the Claude Code session socket",
  "the Claude Code session woke and wrote the artifact",
];
export const TEXT_OPTIONAL = ["completed within 120s", "conversation socket connects"];

export type Reconciliation = {
  /** Declared required, never ran. The defect this module exists for. */
  missing: string[];
  /** Ran, but declared neither required nor optional — the list has rotted. */
  unexpected: string[];
  /** Ran more than once, which would otherwise inflate the numerator. */
  duplicated: string[];
  /** Ran and reported FAIL. */
  failed: Check[];
  passed: number;
  total: number;
  ok: boolean;
};

/**
 * @param results   what actually ran, in order
 * @param required  every check a complete run must produce
 * @param optional  checks that may legitimately be absent — the fault paths
 *                  (timeout, socket error), which only push on failure
 */
export function reconcile(
  results: readonly Check[],
  required: readonly string[],
  optional: readonly string[] = [],
): Reconciliation {
  // An empty declared set makes every divergence list empty, so `ok` would be
  // true and the report would read `0/0 checks passed` — a vacuous pass inside
  // the module written to forbid vacuous passes. There is no legitimate caller
  // with nothing to require.
  if (required.length === 0) {
    throw new Error("reconcile: the required set is empty — a 0/0 pass proves nothing");
  }

  const seen = new Map<string, number>();
  for (const r of results) seen.set(r.name, (seen.get(r.name) ?? 0) + 1);

  const known = new Set([...required, ...optional]);
  const missing = required.filter((n) => !seen.has(n));
  const unexpected = [...seen.keys()].filter((n) => !known.has(n));
  const duplicated = [...seen.entries()].filter(([, n]) => n > 1).map(([n]) => n);

  const failed = results.filter((r) => !r.ok);
  const optionalRan = optional.filter((n) => seen.has(n)).length;
  const total = required.length + optionalRan;
  // DISTINCT names. Counting rows lets a duplicated check inflate the numerator
  // past the denominator — `12/11 checks passed` — in the one module whose whole
  // job is that the number means something. Duplicates are red either way, but a
  // red must not also be arithmetically impossible.
  const passed = new Set(results.filter((r) => r.ok && known.has(r.name)).map((r) => r.name)).size;

  return {
    missing,
    unexpected,
    duplicated,
    failed,
    passed,
    total,
    ok:
      missing.length === 0 &&
      unexpected.length === 0 &&
      duplicated.length === 0 &&
      failed.length === 0,
  };
}

/** Human-readable verdict. Every divergence is named, never just counted. */
export function report(r: Reconciliation): string {
  const lines = [`\n${r.passed}/${r.total} checks passed`];
  for (const n of r.missing) lines.push(`  MISSING   ${n} — declared required, never ran`);
  for (const n of r.unexpected) lines.push(`  UNDECLARED ${n} — add it to the declared set`);
  for (const n of r.duplicated) lines.push(`  DUPLICATE ${n} — ran more than once`);
  // Named, not just counted. The per-check FAIL line is printed when the check
  // runs, which can be minutes and hundreds of lines earlier; a verdict that
  // says only "10/11" sends the reader back to scroll for the one that broke.
  for (const f of r.failed) lines.push(`  FAIL      ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  return lines.join("\n");
}
