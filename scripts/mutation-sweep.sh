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
          test/control-files.test.ts test/checker-coverage.test.ts test/workflow-gates.test.ts
          test/gates-predicate.test.ts)

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
EXPECTED_MUTANTS=10

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

echo "coverage — the checkers must read everything"
mutate "tsconfig.include narrowed to test/ only" tsconfig.json \
  '"include": ["probes/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"]' \
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
