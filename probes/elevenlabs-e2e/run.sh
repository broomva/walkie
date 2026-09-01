#!/usr/bin/env bash
# End-to-end walkie loop against ElevenLabs. Creates a throwaway agent, drives a
# conversation over the conversation WebSocket, and delivers the answer into a
# real Claude Code session. Deletes the agent afterwards.
#
# Needs: ELEVENLABS_API_KEY, bun, tmux. No public ingress, no browser, no mic —
# client tools are executed by whoever drives the conversation, which is this.
set -euo pipefail
cd "$(dirname "$0")"

# D5: this script always ran drive.ts — the TEXT probe — while the record cited
# `./run.sh` as the reproduction for a result ("agent SPEAKS the ask", "10.4s of
# pcm_16000") that only drive-audio.ts can produce. Both probes print a score in
# the same format, so a text 10/10 was indistinguishable on the console from the
# audio run it was being read as. The transport is now chosen here, named in the
# log, and — for the audio path — pinned by a real assertion downstream
# (`agent audio actually came back` fails when no audio events arrive). The text
# path asserts nothing about transport, so this comment does not claim it does.
# --- mode-select-begin --- (executed verbatim by test/probe-run-modes.test.ts;
# the markers are load-bearing, and an inherited WALKIE_AUDIO must be CLEARED on
# the text path or the banner names one transport while create-agent builds the
# other — D5 restated through the environment.)
MODE=text
case "${1:-}" in
  --audio) MODE=audio; export WALKIE_AUDIO=1 ;;
  --text|"") export WALKIE_AUDIO=0 ;;
  *) echo "usage: run.sh [--audio|--text]" >&2; exit 2 ;;
esac
# --- mode-select-end ---
echo "== walkie e2e: ${MODE} transport =="
: "${ELEVENLABS_API_KEY:?set ELEVENLABS_API_KEY}"

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/session"
cat > "$WORK/session/settings.json" <<'JSON'
{ "crossSessionInbound": "accept",
  "permissions": { "allow": ["Write", "Read", "Bash(echo:*)"] } }
JSON

AID="$(bun run create-agent.ts | tail -1)"
case "$AID" in agent_*) ;; *) echo "agent create failed: $AID"; exit 1;; esac
echo "$AID" > .agent_id
cleanup_agent() { curl -s -X DELETE -H "xi-api-key: $ELEVENLABS_API_KEY" \
  "https://api.elevenlabs.io/v1/convai/agents/$AID" -o /dev/null; }
trap 'cleanup_agent; tmux kill-session -t walkie-e2e 2>/dev/null || true; rm -rf "$WORK"' EXIT

tmux kill-session -t walkie-e2e 2>/dev/null || true
tmux new-session -d -s walkie-e2e -c "$WORK/session" \
  "claude --name walkie-e2e-target --settings '$WORK/session/settings.json'"
# A session in a fresh directory blocks on the trust prompt and never registers
# until it is cleared. Any automated spawn path has to do this.
sleep 3; tmux send-keys -t walkie-e2e Enter
REC="$(./wait-for-session.sh walkie-e2e-target "${WALKIE_SESSION_WAIT_SECS:-90}")"
cp "$REC" .session.json
ln -sfn "$WORK/session" session

if [ "$MODE" = audio ]; then
  bun run drive-audio.ts
else
  bun run drive.ts
fi
