#!/usr/bin/env bash
# Wait for a Claude Code session to appear in the registry, print its record path.
# Probes until the deadline, so a failing wait takes AT LEAST <budget> seconds —
# the point is that it no longer takes about one.
#
# Extracted from run.sh so its budget can be measured. The version in run.sh was
#
#     for _ in $(seq 1 90); do ... [ -n "$REC" ] && break; done
#
# with no sleep in the body: it read as a 90-second budget and spun 90 filesystem
# probes in about a second. On a loaded machine the session has not registered in
# that window, and the run died with "session never registered" — which points at
# the session registry rather than at a too-short wait. Neither shellcheck, tsc
# nor biome can see this; it is a semantic defect in an otherwise clean script.
#
# The budget is counted in SLEEPS, not against a wall-clock deadline. The first
# rewrite used `DEADLINE=$(( $(date +%s) + BUDGET ))`, which is correct in spirit
# and wrong in a way that mattered twice:
#
#   `date +%s` is second-granular, so a budget of N expires after N - frac(t0)
#   seconds. Measured over 40 randomly-phased runs of a 2s budget: min 1040ms,
#   median 2047ms, and 3/40 below 2000ms. A test asserting the stated budget was
#   honoured is therefore ~7.5% flaky, and it gated a required check.
#
#   It also made the `sleep` non-load-bearing: with a wall-clock deadline,
#   deleting the sleep only turns the wait into a busy-wait, so a mutation
#   removing it changes CPU and not duration.
#
# Counting sleeps fixes both. `sleep 1` sleeps at least one second, so BUDGET of
# them take at least BUDGET seconds regardless of the phase of the clock — and
# deleting the sleep makes the loop finish immediately, which a timing test sees.
set -euo pipefail

NAME="${1:?usage: wait-for-session.sh <session-name> [budget-seconds] [registry-dir]}"
BUDGET="${2:-90}"
DIR="${3:-$HOME/.claude/sessions}"

waited=0
while :; do
  # Probed BEFORE any sleep, so a budget of 0 still looks exactly once.
  REC="$(grep -l "$NAME" "$DIR"/*.json 2>/dev/null | head -1 || true)"
  if [ -n "$REC" ]; then echo "$REC"; exit 0; fi
  [ "$waited" -ge "$BUDGET" ] && break
  sleep 1
  waited=$((waited + 1))
done

echo "session '$NAME' never registered within ${BUDGET}s" >&2
exit 1
