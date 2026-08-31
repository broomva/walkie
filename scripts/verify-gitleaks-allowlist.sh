#!/usr/bin/env bash
# Proves .gitleaksignore exempts Pencil's per-document fileToken and nothing else.
#
# Both polarities, because a one-sided check passes just as happily against an
# exemption that swallows the whole file — which is not hypothetical here. Two
# earlier config-based attempts did exactly that, and this script is what caught
# them:
#
#   * a global allowlist `paths` entry made gitleaks skip the .pen before
#     scanning it at all (the tell: "scanned ~0 bytes");
#   * `regexTarget = "line"` suppressed every finding in the repository.
#
#   negative control  the repo as committed          -> must be CLEAN
#   positive control  same repo, a key planted in the
#                     very file that carries the
#                     exemption                       -> must still FIRE
#
# The planted key is generated at runtime into a temp dir and never written into
# the repository.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -f "$REPO/designs/walkie.pen" ] || { echo "missing designs/walkie.pen"; exit 1; }
[ -f "$REPO/.gitleaksignore" ]    || { echo "missing .gitleaksignore"; exit 1; }
command -v gitleaks >/dev/null    || { echo "gitleaks not installed"; exit 1; }

# Scan a directory the way the pre-commit hook scans the repo. Returns 0 when
# clean, non-zero when something is reported.
#
# `cd` first and scan `.`: a fingerprint is path-relative, so an absolute
# --source produces an absolute fingerprint that can never match a repo-relative
# line in .gitleaksignore. Scanning from inside the copy is what makes this
# control comparable to the pre-commit hook.
# `--report-format json` because plain output says only "leaks found: 1" and names
# nothing. Which file leaked is the whole diagnostic; the secret itself stays
# redacted.
scan() {
  ( cd "$1" && gitleaks detect --no-git --redact --source . \
      --report-format json --report-path "$2" >/dev/null 2>&1 )
}

work="$TMP/repo"
mkdir -p "$work"
# Everything but .git, so .gitleaksignore travels with the copy.
tar -cf - -C "$REPO" --exclude .git . | tar -xf - -C "$work"

fail=0

if scan "$work" "$TMP/neg.json"; then
  echo "PASS  negative control: the fileToken alone is not reported"
else
  echo "FAIL  negative control: the repo as committed is NOT clean"
  echo
  echo "      This is stated as a REPO problem, not an allowlist problem, because it"
  echo "      is usually a real leak. The allowlist is only the cause when every"
  echo "      finding below is the walkie.pen fileToken; anything else is a"
  echo "      credential that has been committed, and .gitleaksignore is a red"
  echo "      herring. Findings, redacted:"
  echo
  python3 - "$TMP/neg.json" <<'PY'
import json, sys
try:
    findings = json.load(open(sys.argv[1]))
except Exception as e:
    print(f"      (could not read the gitleaks report: {e})")
    raise SystemExit
for f in findings[:40]:
    print(f"      {f.get('File')}:{f.get('StartLine')}  rule={f.get('RuleID')}  secret={f.get('Secret')}")
print(f"      ({len(findings)} finding(s))")
PY
  fail=1
fi

# A private-key block, because the planted secret has to be one the ruleset
# actually fires on. An `AKIA` + 16-char string was tried first and is NOT
# reported by gitleaks' defaults even in a plain .txt, so it made this control
# pass vacuously: "no findings" looked like a working exemption when it was a
# fixture the detector could never see.
#
# openssl rather than `tr </dev/urandom | head`, because head closes the pipe,
# tr takes SIGPIPE, and pipefail turns that into exit 141 before the control
# ever runs.
BODY="$(openssl rand -base64 60 | tr -d '\n')"
printf '\n-----BEGIN RSA PRIVATE KEY-----\n%s\n-----END RSA PRIVATE KEY-----\n' "$BODY" \
  >>"$work/designs/walkie.pen"

if scan "$work" "$TMP/pos.json"; then
  echo "FAIL  positive control: a planted key in the exempted .pen was NOT reported"
  echo "      the exemption covers the file, not the fileToken"
  fail=1
else
  echo "PASS  positive control: a planted key in the exempted .pen is still reported"
fi

exit "$fail"
