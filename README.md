# walkie

A phone client for agentic workspaces. Design prototype only — no runtime yet.

`designs/walkie.pen` is the source (open with Pen). `designs/walkie-screens.html`
is an export for reading in a browser or a pull request, where a `.pen` is opaque.

Ticket: BRO-2357. Builds on the talkback readback shipped in BRO-2343.

## What it is

talkback renders an agent turn as audio **on the workstation**. Genesis ships
**text** to a phone. Nobody ships the audio, and nobody carries push-to-talk back
into a live session. walkie is that missing leg.

## The unit is an ask, not a turn

The obvious build — stream every readback to the phone — is both unaffordable and
unlistenable:

- ElevenLabs Creator is 130,958 characters a month. A 1,500-character turn is
  ~1.1% of it, so roughly **87 full readbacks**. Across six parallel agents that
  is fourteen each, and then you are on the fallback voice.
- The attention budget runs out well before the quota does. Nobody listens to six
  agents narrating.

So the scarce resource is your ear, and the app's core competence is **triage**.
The unit of delivery is a decision that needs you; the transcript is something you
pull, not something pushed at you.

That is also the surface the handback contract (BRO-2179) measured and could not
deliver to: 31 of 100 long arcs end on a blocker, none of those 31 contain an
imperative ask, and none of the 100 ever pushed a notification.

## Screens

| Frame | Job |
|---|---|
| `Screen · Channels` | Needs you pinned above Live above Quiet. Per-channel state, signal strength, unheard count. |
| `Screen · Ask` | One decision. The question, options with their consequences, the safest marked, what was already decided, and hold-to-answer. |
| `Screen · Log` | The pull surface. Now playing, turn feed with receipts, hold to talk into that workspace. |
| `Screen · Tuning` | Detail level, overlap policy, voice ladder, output device, budget expressed as readbacks remaining. |

`Tuning` maps one-to-one onto the talkback semantics already shipped: `full` /
`brief` / `marker`, `interrupt` / `queue`, the `elevenlabs → omnivoice → say`
ladder, and per-session output device.

## Transport, as encoded in the design

Audio is produced at turn end as a **file** — talkback already writes an mp3 and a
ledger row — so there is no live media to carry.

| Leg | Mechanism |
|---|---|
| server → client events | SSE. Native reconnect, survives Tailscale Funnel, no signalling. |
| server → client audio | Plain HTTP GET of the mp3. |
| client → server | HTTPS POST of a push-to-talk blob. |

**WebRTC is deferred deliberately.** It earns its place only for ride-along —
hearing an agent mid-turn and interrupting it by speaking. The practical argument
is stronger than the architectural one: the app's value is when the phone is in a
pocket, and iOS tears down a background WebRTC session without VoIP-push or a held
audio session, while notification → fetch mp3 → `AVAudioSession` survives a locked
screen.

## Design system

Broomva foundation plus the agentic-work extension, adapted for native mobile. The
canonical six work states are used exactly: `Queued`, `Running`, `Stuck`,
`Needs you`, `Done`, `Standing`. `Needs you` is a filled tidepool chip and
`Running` is a tidepool dot, so structure separates them and colour never carries
meaning alone.

### Adapter decisions

Pencil stores colour as hex; Broomva's canonical source is OKLCH. The mapping was
computed once and is recorded in the file's `Token provenance` note rather than
eyeballed.

One real accessibility failure came out of the audit: **Resonant AI Blue
(`oklch(0.60 0.12 260)`, `#5480C7`) is 3.97:1 on paper**, below the 4.5:1 floor for
text. It is unchanged for icons and fills, where the non-text floor is 3:1, and
darkened to `oklch(0.54 0.12 260)` = `#436EB4` only where it carries text on light
surfaces. Dark theme is unaffected. Every other pair clears AA — the full sweep
covers primary, secondary, muted, accent, and functional colours against both
themes' surfaces.

## The decision this prototype does not settle

Whether walkie attaches to **sessions you do not own** — the Claude Code sessions
Orca starts, where the work actually happens — or serves **Genesis-owned sessions
only**, where injection is native.

The client is the same either way. The server is not:

| Path | Reaches | Cost |
|---|---|---|
| Claude Code Channels | sessions launched with it | first-party and supported |
| `tmux send-keys` | any session in a pane | crude, universal, survives version churn |
| `CLAUDE_CODE_MESSAGING_SOCKET` | every running session | undocumented; will break silently on upgrade |
| Genesis | Genesis sessions only | native, but not where the work is |

Orca is `com.stablyai.orca` — third party and closed, so its client cannot be
extended. Its hook shim does POST every Claude Code hook payload to a local port,
and our own hooks see the same events, so the **observer** half is already proven
by talkback's Stop hook. The **injector** half is the open question.

## Security posture

This is not a chat app. It is a remote shell with a voice interface — voice in,
bash on a workstation out. The doctrine already exists in
`apps/genesis/apps/api/src/voice.ts` and should be reused rather than re-derived: a
spoofable identifier is a routing hint and never an authorization claim, and
results are delivered to the principal on file rather than to whoever is on the
line, so a spoofer causes a detection instead of a breach.
