#!/usr/bin/env bash
# Regenerate .gitleaksignore for the Pencil fileToken.
#
# A .pen rewrites wholesale on every save, so the fileToken's line number moves
# and a line-pinned fingerprint goes stale. That is the fail-closed half of the
# design working: the finding comes back and has to be looked at. This script is
# the "look at it" step, automated safely.
#
# Safe because it VERIFIES BEFORE IT WRITES: every finding it is about to ignore
# must have `fileToken` in its matched text. Anything else aborts with a non-zero
# exit and writes nothing, so a real secret in a .pen can never be silently
# swept into the ignore file.
#
# Config-based allowlists were tried first and all three shapes failed: a `paths`
# entry skips the file before scanning it, `regexTarget = "line"` suppressed every
# finding in the repo, and neither `match` nor the default secret target matched
# the fileToken at all in gitleaks 8.30.
set -euo pipefail

cd "$(dirname "$0")/.."
command -v gitleaks >/dev/null || { echo "gitleaks not installed"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Scan with the current ignore moved aside, so every finding is visible.
[ -f .gitleaksignore ] && mv .gitleaksignore "$TMP/prev"
gitleaks detect --no-git --source . --report-format json --report-path "$TMP/r.json" >/dev/null 2>&1 || true
[ -f "$TMP/prev" ] && mv "$TMP/prev" .gitleaksignore

python3 - "$TMP/r.json" <<'PY'
import json, sys, pathlib
findings = json.load(open(sys.argv[1]))
bad = [f for f in findings if "fileToken" not in f.get("Match", "")]
if bad:
    print("REFUSING to write .gitleaksignore. Findings that are NOT a Pencil fileToken:")
    for f in bad:
        print(f"  {f['RuleID']}  {f['File']}:{f['StartLine']}")
    print("Investigate these. If one is a real secret it must be removed, not ignored.")
    sys.exit(1)

header = '''# Pencil writes a per-document `fileToken` UUID into every .pen. It is generated
# locally by the editor (`createFileToken()` in Pen's document manager) and
# identifies the document; it is not a credential, but its entropy trips
# gitleaks' generic-api-key rule.
#
# A .pen rewrites wholesale on save, so this fingerprint's line number drifts and
# the finding returns — by design, it fails CLOSED. Regenerate with
# scripts/refresh-pen-ignore.sh, which refuses to write unless every finding it
# would ignore has `fileToken` in its matched text.
#
# Both polarities are asserted by scripts/verify-gitleaks-allowlist.sh.
'''
lines = sorted({f["Fingerprint"] for f in findings})
pathlib.Path(".gitleaksignore").write_text(header + "\n".join(lines) + "\n")
print(f"wrote .gitleaksignore with {len(lines)} fileToken fingerprint(s):")
for l in lines:
    print(f"  {l}")
PY
