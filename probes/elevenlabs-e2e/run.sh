#!/usr/bin/env bash
# End-to-end walkie loop against ElevenLabs. Creates a throwaway agent, drives a
# conversation over the conversation WebSocket, and delivers the answer into a
# real Claude Code session. Deletes the agent afterwards.
#
# Needs: ELEVENLABS_API_KEY, bun, tmux. No public ingress, no browser, no mic —
# client tools are executed by whoever drives the conversation, which is this.
set -euo pipefail
cd "$(dirname "$0")"
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
for _ in $(seq 1 90); do
  REC="$(grep -l walkie-e2e-target "$HOME"/.claude/sessions/*.json 2>/dev/null | head -1 || true)"
  [ -n "${REC:-}" ] && break
done
[ -n "${REC:-}" ] || { echo "session never registered"; exit 1; }
cp "$REC" .session.json
ln -sfn "$WORK/session" session

bun run drive.ts
