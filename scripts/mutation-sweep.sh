#!/usr/bin/env bash
# Mutation sweep over walkie's gates.
#
# The tests in test/ assert that the checkers read everything and still have
# rules. This script is what makes that claim checkable rather than asserted: it
# breaks the configuration in specific ways and requires the suite to notice.
#
# Three guards, each of which caught a real false result while this was written:
#
#   clean tree      restoring between mutants would otherwise destroy uncommitted
#                   work. It refuses rather than reverting over you.
#   anchor check    a mutation whose pattern no longer matches silently does
#                   nothing, and the mutant then "survives" for a reason that has
#                   nothing to do with the tests.
#   applied check   the file must actually differ after the edit, and be restored
#                   before the next one. An early version of this sweep reported
#                   SURVIVED intermittently because the suite started before the
#                   edit had settled; the bias was toward false survivors, which
#                   reads as "your tests are weak" and invites weakening a test
#                   that was fine.
#
# Usage: scripts/mutation-sweep.sh          (exits non-zero if any mutant survives)
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

if [ -n "$(git -c core.fsmonitor=false status --porcelain)" ]; then
  echo "REFUSING: working tree is not clean — this script reverts files between mutants."
  git -c core.fsmonitor=false status --porcelain
  exit 2
fi

# Every file any mutant touches must be listed here. An earlier version backed up
# only the two config files while also mutating a test file, which would have
# left that mutation in the tree.
SUBJECTS=(tsconfig.json biome.json .github/workflows/ci.yml scripts/assert-gates-succeeded.sh
          src/main.ts src/api.ts src/render.ts src/app.ts src/orb.ts designs/orb.glsl test/api.test.ts
          test/control-files.test.ts test/checker-coverage.test.ts test/workflow-gates.test.ts
          test/gates-predicate.test.ts test/no-local-paths.test.ts
          probes/elevenlabs-e2e/score.ts probes/elevenlabs-e2e/drive.ts
          probes/elevenlabs-e2e/drive-audio.ts probes/elevenlabs-e2e/run.sh
          probes/elevenlabs-e2e/wait-for-session.sh AGENTS.md)

# The baseline must be GREEN. A mutation sweep over a suite that is already red
# scores every mutant "killed" — for reasons that have nothing to do with the
# mutation. Without this, "0 survivors" means "the suite was red anyway", and the
# report is at its most reassuring exactly when it is worthless.
#
# This is not hypothetical. The first version of this script had no baseline
# check, and CI's positive-control run — where five gates were deliberately
# broken at once — reported "7 mutants, 0 survivors" and went GREEN.
echo "baseline — the suite must pass before anything is broken"
if ! baseline="$(bun test 2>&1)"; then
  echo "  REFUSING: the suite is already failing, so no mutant verdict would mean anything."
  printf '%s\n' "$baseline" | grep '(fail)' | head -10 | sed 's/^/    /'
  exit 2
fi
echo "  baseline green"
echo

BAK="$(mktemp -d)"
for f in "${SUBJECTS[@]}"; do mkdir -p "$BAK/$(dirname "$f")"; cp "$f" "$BAK/$f"; done
restore() { for f in "${SUBJECTS[@]}"; do cp "$BAK/$f" "$f"; done; }
trap 'restore; rm -rf "$BAK"' EXIT

survivors=0
total=0

# The sweep must assert its own arity, for the same reason the workflow's
# aggregate has to. Delete every `mutate` call and an unguarded sweep prints
# "0 mutants, 0 survivors" and exits 0 — the job whose entire purpose is proving
# the gates can fail would go green having measured nothing. Unlike the arity
# check this replaced in ci.yml, these two numbers are independent: `total` is
# incremented by calls that actually ran, EXPECTED_MUTANTS is a separate literal.
EXPECTED_MUTANTS=53

# mutate <label> <file> <anchor> <replacement> <expected-failing-test-substring>
mutate() {
  local label="$1" file="$2" anchor="$3" replacement="$4" want="$5"
  total=$((total + 1))

  # A file the backup does not cover would be left mutated.
  local covered=0 f
  for f in "${SUBJECTS[@]}"; do [ "$f" = "$file" ] && covered=1; done
  if [ "$covered" -ne 1 ]; then
    echo "  ERROR     $label — $file is not in SUBJECTS, so it would not be restored"
    survivors=$((survivors + 1))
    return
  fi

  # The `want` string is used with `grep`, so it is a REGEX too. `[0,1]` in a test
  # name became a character class and matched nothing — the mutant was reported
  # SURVIVED while the suite was correctly red. Keep `want` free of regex
  # metacharacters, or the harness lies in the safe-looking direction.
  #
  # Counted in python, not grep: grep is line-based (so a multi-line anchor can
  # never match) and treats the anchor as a regex (so `[`, `*` and `]` in a JSON
  # snippet blow up or match the wrong thing). Both bugs were live here, and
  # both presented as "anchor matched 0 times" rather than as a wrong verdict —
  # which is the whole reason this check runs before the mutation.
  local n
  n="$(python3 -c 'import sys;print(open(sys.argv[1]).read().count(sys.argv[2]))' "$file" "$anchor")"
  if [ "$n" -ne 1 ]; then
    echo "  ERROR     $label — anchor occurs $n times in $file, expected exactly 1"
    survivors=$((survivors + 1))
    return
  fi

  local before after
  before="$(cat "$file")"
  python3 - "$file" "$anchor" "$replacement" <<'PY'
import sys, pathlib
path, anchor, replacement = sys.argv[1], sys.argv[2], sys.argv[3]
p = pathlib.Path(path)
p.write_text(p.read_text().replace(anchor, replacement))
PY
  after="$(cat "$file")"
  if [ "$before" = "$after" ]; then
    echo "  ERROR     $label — the edit did not change $file"
    survivors=$((survivors + 1))
    restore
    return
  fi

  local out code
  out="$(bun test 2>&1)"; code=$?
  restore

  if [ "$code" -eq 0 ]; then
    echo "  SURVIVED  $label"
    survivors=$((survivors + 1))
  # Matched against the FAILING lines only. Grepping the whole suite output lets
  # a mutant be scored killed on the strength of a test that PASSED — bun prints
  # source context around a failure, so an unrelated red run can carry the name
  # of the very assertion this mutant was supposed to break.
  elif printf '%s' "$out" | grep '(fail)' | grep -q -- "$want"; then
    echo "  killed    $label"
  else
    echo "  SURVIVED  $label — suite went red, but not via \"$want\""
    printf '%s' "$out" | grep '(fail)' | head -3 | sed 's/^/              /'
    survivors=$((survivors + 1))
  fi
}

echo "the orb's theme wire, which P20 round 2 found never reached the product"
mutate "the orb ignores the document's theme at construction" src/orb.ts \
  '  let theme = ORB_THEMES[opts.theme ?? docTheme()];' \
  '  let theme = ORB_THEMES.dark;' \
  "ALREADY in light mode gets a light orb"
mutate "an explicit theme option stops winning over the document" src/orb.ts \
  '  let theme = ORB_THEMES[opts.theme ?? docTheme()];' \
  '  let theme = ORB_THEMES[docTheme()];' \
  "explicit theme option WINS"
mutate "u_shade stops being a theme property (the light orb goes formless)" src/orb.ts \
  '    gl.uniform1f(L.shade, theme.shade);' \
  '    gl.uniform1f(L.shade, 0);' \
  "ALREADY in light mode"
mutate "the orb is driven by a FAILED threads read" src/app.ts \
  '      if (threadsSettled.status === "fulfilled") {' \
  '      if (true) {' \
  "does not tell the orb"

echo "the orb's wiring and range, which P20 round 1 found unguarded"
mutate "the threads->orb wire is cut (the orb ships inert)" src/app.ts \
  '      orb?.setState(orbStateFromPhases(threads.map((t) => t.phase)));' \
  '      /* wire cut */' \
  "THE WIRE EXISTS"
mutate "the orb is told a constant instead of the threads" src/app.ts \
  '      orb?.setState(orbStateFromPhases(threads.map((t) => t.phase)));' \
  '      orb?.setState({ working: true, paused: false });' \
  "tracks a CHANGE of state"
mutate "a shader uniform is renamed and the client silently no-ops" designs/orb.glsl \
  'uniform float u_work;' \
  'uniform float u_running;' \
  "every name createOrb asks for is declared"
mutate "a backwards frame drives the ease out of range" src/orb.ts \
  'const dt = last === undefined ? 16 : Math.max(0, Math.min(nowMs - last, 250));' \
  'const dt = last === undefined ? 16 : Math.min(nowMs - last, 250);' \
  "when frame() goes backwards"

echo "the orb — one shader, a condition not a quantity, never progress (BRO-2388)"
mutate "the orb reports a QUANTITY instead of a condition" src/orb.ts \
  '    working: phases.includes("running"),' \
  '    working: (phases.filter((p) => p === "running").length / Math.max(phases.length, 1)) as unknown as boolean,' \
  "same orb"
mutate "a completion fraction is fed to u_work" src/orb.ts \
  '    gl.uniform1f(L.work, work);' \
  '    gl.uniform1f(L.work, 0.42);' \
  "u_work SETTLES AT 1"
mutate "the light theme becomes a copy of dark" src/orb.ts \
  '    sphere: hex("#E8ECF2"),' \
  '    sphere: hex("#0C101A"),' \
  "two themes actually differ"
mutate "a fourth size preset ships unannounced" src/orb.ts \
  'export const ORB_SIZES = { sm: 40, md: 96, lg: 240 } as const;' \
  'export const ORB_SIZES = { sm: 40, md: 96, lg: 240, xl: 400 } as const;' \
  "exactly three size presets"
mutate "no-WebGL throws instead of degrading" src/orb.ts \
  '  if (!ctx) return null;' \
  '  if (!ctx) throw new Error("no webgl");' \
  "degrades to null"

echo "the guards P20 round 2 found ungated"
mutate "contextInFlight never resets (the panel renders once, then freezes)" src/app.ts \
  '      contextInFlight = false;' \
  '      /* not reset */' \
  "contextInFlight RESETS"
mutate "the stale ask list is blanked on an outage" src/app.ts \
  'renderAsks(root, { ...last, offline: why }, onAnswer);' \
  'renderAsks(root, { asks: [], offline: why }, onAnswer);' \
  "stale list is KEPT"
mutate "the render stops being an atomic swap" src/app.ts \
  '      const next = document.createDocumentFragment();' \
  '      host.replaceChildren();
      const next = host as unknown as DocumentFragment;' \
  "THROW while rendering leaves the previous context"
mutate "a fifth view ships without joining the constraints table" src/render.ts \
  'export function threadsView(' \
  'export function sessionsView(): HTMLElement {
  return el("section", "SessionsView", "42%");
}

export function threadsView(' \
  "TABLE covers every exported"

echo "the app loop's cost decisions, and the surface-wide constraints (P20 round 1)"
mutate "the context poll drops to the ask cadence" src/app.ts \
  'export const CONTEXT_POLL_MS = 60_000;' \
  'export const CONTEXT_POLL_MS = 4_000;' \
  "context is armed at CONTEXT_POLL_MS"
mutate "the context reentrancy guard is removed" src/app.ts \
  'if (!host || contextInFlight || stopped) return;' \
  'if (!host || stopped) return;' \
  "second refresh while one is in flight is DROPPED"
mutate "checks are fetched for EVERY workspace (the BRO-2418 amplification)" src/app.ts \
  'id ? fetchChecks(cfg, id).catch(() => null) : Promise.resolve(null),' \
  'id ? Promise.all(wsResult.workspaces.map((w) => fetchChecks(cfg, w.id).catch(() => null))).then((x) => x[0] ?? null) : Promise.resolve(null),' \
  "DEFAULT workspace ONLY"
mutate "a run url is trusted without validating its scheme" src/render.ts \
  'if (u.protocol === "https:" || u.protocol === "http:") safe = u.href;' \
  'safe = run.url;' \
  "javascript: url produces NO LINK"
mutate "a percentage appears in a view other than threads" src/render.ts \
  'const bits = [w.id];' \
  'const bits = [w.id, "42%"];' \
  "NEVER DRAWS PROGRESS"

echo "the read views — the constraints the design calls non-negotiable (BRO-2388 slice 3)"
mutate "a workspace renders a path where the API gives an id" src/render.ts \
  'const bits = [w.id];' \
  'const bits = [`~/${w.id}`];' \
  "NO ROOTPATH IS RENDERED"

mutate "an unknown lifecycle stage is coerced to a known one" src/render.ts \
  'const known = (LIFECYCLE as readonly string[]).includes(t.phase);' \
  'const known = true;' \
  "UNKNOWN phase renders verbatim"

mutate "a binary file reports +0 instead of binary" src/render.ts \
  'file.added === null || file.deleted === null ? "binary"' \
  'false ? "binary"' \
  "binary file reports BINARY"

mutate "an in-flight run is toned as a failure" src/render.ts \
  'run.conclusion === "success" ? "good" : run.conclusion === null ? undefined : "warn";' \
  'run.conclusion === "success" ? "good" : "warn";' \
  "RUNNING run (conclusion null) is not rendered as a failure"

mutate "an absent isGitRepo is reported as false" src/render.ts \
  'if (w.isGitRepo === true) bits.push("git");
      else if (w.isGitRepo === false) bits.push("no git");' \
  'bits.push(w.isGitRepo ? "git" : "no git");' \
  "ABSENT isGitRepo is not reported as false"

mutate "truncation stops being disclosed" src/render.ts \
  '(status.truncated ? "+ (truncated)" : "")' \
  '""' \
  "truncation is disclosed"

echo "the read verbs — the two invariants that are security decisions (BRO-2388)"
# Retargeted: walkie#13 made this call paged, so the literal path became a
# template and both of this file's api.ts anchors went stale. #11's sweep still
# passed because its LAST CI run predates that merge — a green check covering an
# older base, which is the thing this repo has been bitten by before.
mutate "a read verb points at the OWNER-GATED twin instead of the mirror" src/api.ts \
  '      `/walkie/threads?limit=${THREAD_PAGE}&offset=${page * THREAD_PAGE}`,' \
  '      `/threads?limit=${THREAD_PAGE}&offset=${page * THREAD_PAGE}`,' \
  "each read hits a /walkie/ path"

mutate "the secret moves from the header into the query string" src/api.ts \
  'const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), [HEADER]: cfg.secret },' \
  'const res = await fetch(`${cfg.baseUrl}${path}${path.includes("?") ? "&" : "?"}token=${cfg.secret}`, {
    ...init,
    headers: { ...(init?.headers ?? {}) },' \
  "ever puts the secret in the URL"

mutate "the workspace id stops being URL-encoded (now ONE site, wsPath)" src/api.ts \
  '`/walkie/workspaces/${encodeURIComponent(workspaceId)}${suffix}`' \
  '`/walkie/workspaces/${workspaceId}${suffix}`' \
  "hostile workspace id cannot escape"

mutate "the secret leaks into the query string ENCODED, not raw" src/api.ts \
  'const res = await fetch(`${cfg.baseUrl}${path}`, {' \
  'const res = await fetch(`${cfg.baseUrl}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(cfg.secret)}`, {' \
  "ever puts the secret in the URL"

mutate "a READS key points at another verb (the list goes quietly partial)" test/api.test.ts \
  'fetchChecks: () => fetchChecks(cfg, "ws-default"),' \
  'fetchChecks: () => fetchThreads(cfg),' \
  "every verb produces a DISTINCT url"

mutate "a network verb ships under a name no fetch-prefix filter would see" src/api.ts \
  'export async function fetchChecks(' \
  'export async function getThreadsList(cfg: Config): Promise<unknown> {
  return await call(cfg, `/threads?token=${cfg.secret}`);
}

export async function fetchChecks(' \
  "EVERY callable the module exports"

mutate "GitStatus.files stops defaulting when the body omits it" src/api.ts \
  'return { ...body, files: body.files ?? [] };' \
  'return body;' \
  "absent collection reads as empty"

mutate "an absent collection stops defaulting to empty" src/api.ts \
  '    const batch = body.threads ?? [];' \
  '    const batch = body.threads as readonly Thread[];' \
  "absent collection reads as empty"

echo "coverage — the checkers must read everything"
mutate "tsconfig.include narrowed to test/ only" tsconfig.json \
  '"include": ["src/**/*.ts", "probes/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"]' \
  '"include": ["test/**/*.ts"]' \
  "outside the program"

mutate "probes/ hidden from biome via files.ignore" biome.json \
  '"node_modules/**"]' \
  '"node_modules/**", "probes/**"]' \
  "biome sees"

echo "rules — the checkers must still object to things"
mutate "biome linter disabled" biome.json \
  '"enabled": true,
    "rules"' \
  '"enabled": false,
    "rules"' \
  "rejects code violating"

mutate "biome recommended rules off" biome.json \
  '"recommended": true' \
  '"recommended": false' \
  "rejects code violating"

mutate "tsconfig strict off" tsconfig.json \
  '"strict": true' \
  '"strict": false' \
  "rejects code violating the strictness"

echo "the client build gate (BRO-2388)"
# THE BUILD GATE IS A GATE, so it gets a mutant like every other one. Mutating the
# SOURCE rather than the workflow: the question is whether a client that no longer
# bundles can reach main, and only a real bundling failure answers it. `build`
# being wired into gates.needs is covered by the job/needs mutant below.
mutate "the client stops bundling" src/main.ts \
  'import { createApp } from "./app";' \
  'import { createApp } from "./this-module-does-not-exist";' \
  "bundles for a browser"

echo "the required check — it must cover every job"
mutate "a job added to ci.yml but left out of gates.needs" .github/workflows/ci.yml \
  '  # The single required status check.' \
  '  audit:
    name: audit
    runs-on: ubuntu-latest
    steps:
      - run: echo "a gate nobody requires"

  # The single required status check.' \
  "is in \`gates.needs\`"

mutate "the aggregate's result check gutted out of ci.yml" .github/workflows/ci.yml \
  './scripts/assert-gates-succeeded.sh' \
  'echo "all gates succeeded"' \
  "actually evaluates"

mutate "the aggregate predicate weakened to only catch outright failure" scripts/assert-gates-succeeded.sh \
  'select(.value.result != "success")' \
  'select(.value.result == "failure")' \
  "skipped"

echo "public repo — no local filesystem paths"
mutate "the local-path detector defanged" test/no-local-paths.test.ts \
  'const LOCAL_PATH = /(?:\/Users\/[a-z]|\/home\/[a-z]|~\/broomva|orca\/workspaces)/i;' \
  'const LOCAL_PATH = /\bTHIS_PATTERN_MATCHES_NOTHING\b/i;' \
  "rejects"

echo "control files — the parsers must still reject"
mutate "Bun.YAML swapped for a lenient stub" test/control-files.test.ts \
  'return Bun.YAML.parse(source);' \
  'return { lenient: source };' \
  "colon-space"

mutate ".jsonl dropped from the extension list" test/control-files.test.ts \
  '".yaml", ".yml", ".json", ".jsonl"' \
  '".yaml", ".yml", ".json"' \
  "accounted for"

echo
# --- BRO-2406: the probe's own gates ---------------------------------------
#
# The probe had five defects whose common shape was "a check that cannot fail".
# Fixing them added guards, and a guard whose failure is never demonstrated is
# that same defect one level up — so each guard gets a mutant HERE, in the gate
# CI actually runs, rather than only in a shell transcript.

mutate "the score's denominator floats again (a skipped check reads as a pass)" \
  probes/elevenlabs-e2e/score.ts \
  "const total = required.length + optionalRan;" \
  "const total = results.length;" \
  "smaller denominator"

mutate "reconcile stops reporting a declared check that never ran" \
  probes/elevenlabs-e2e/score.ts \
  "const missing = required.filter((n) => !seen.has(n));" \
  "const missing: string[] = [];" \
  "smaller denominator"

mutate "a check predicate reverts to a literal that can never FAIL" \
  probes/elevenlabs-e2e/drive-audio.ts \
  "    sawInterruption," \
  "    true," \
  "asserts a literal"

mutate "run.sh --audio quietly runs the TEXT probe" \
  probes/elevenlabs-e2e/run.sh \
  "  bun run drive-audio.ts" \
  "  bun run drive.ts" \
  "the dispatch actually runs"

mutate "the session wait stops sleeping, so its stated budget expires at once" \
  probes/elevenlabs-e2e/wait-for-session.sh \
  "  sleep 1" \
  "  :" \
  "AT LEAST its budget"

# The mutant for the retracted probe claim lives with the pieces it needs: it
# mutates AGENTS.md and is killed by test/probe-record-claims.test.ts, and BOTH
# stay in #11 because that test polices the AGENTS.md edit. Splitting them apart
# would leave a mutant here with no kill-test and a gate there with no mutant.

if [ "$total" -ne "$EXPECTED_MUTANTS" ]; then
  echo "$total mutants ran, expected $EXPECTED_MUTANTS — a mutant was added or removed"
  exit 1
fi

# The tree must be exactly as it was found. `restore` is never checked for
# success, so a $BAK that went unwritable mid-run would silently leave a mutation
# in place and every later verdict would be about the wrong file.
restore

if [ -n "$(git -c core.fsmonitor=false status --porcelain)" ]; then
  echo "the tree was not restored cleanly:"
  git -c core.fsmonitor=false status --porcelain
  exit 1
fi

if [ "$survivors" -eq 0 ]; then
  echo "$total mutants, 0 survivors"
else
  echo "$total mutants, $survivors SURVIVED"
fi
exit "$((survivors > 0))"
