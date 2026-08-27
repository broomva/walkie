# ElevenLabs end-to-end probe

Proves the walkie loop against real vendors, with no public ingress:

```
conversation opens
  -> agent's FIRST act is get_pending          (client tool, executed by drive.ts)
  -> agent speaks the queued ask
  -> we answer
  -> agent calls answer_ask
  -> the answer is posted into a REAL Claude Code session, which wakes and acts
```

`./run.sh` — needs `ELEVENLABS_API_KEY`, `bun`, `tmux`.

Creates a throwaway agent and deletes it on exit. Cost of one run is around
110 characters of the monthly quota.

## Both polarities

`WALKIE_EXPECT_CLAUDE=0` skips the Claude Code legs. To prove the harness can
report failure rather than only success, point `.session.json`'s
`messagingSocketPath` at a path that does not exist: the two Claude legs must go
FAIL while the five conversation legs still PASS. A run that cannot fail is not
evidence.

## What it does not cover

WebRTC. This drives the conversation WebSocket in `text_only` mode, which
exercises the tool loop and the session leg but not audio transport or
push-to-talk buffer management.
