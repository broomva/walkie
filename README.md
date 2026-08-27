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
`Needs you`, `Done`, `Standing`.

Three further systems were studied and taken from selectively. Each was read for
what it solves that Broomva does not specify, and rejected where it would
overwrite Broomva's identity.

| Source | Taken | Rejected, and why |
|---|---|---|
| [Apple](https://developer.apple.com/design/) | Grouped-inset lists, separators inset to the text, elevation only for genuinely floating chrome, size-specific tracking, feedback on press rather than release | Warm materials as a default surface treatment |
| [ElevenLabs](https://ui.elevenlabs.io/) | A stacked surface ladder, hairline borders in preference to shadows on in-flow surfaces, and the accent colour reserved **exclusively** for the audio object | The warm eggshell/taupe palette, which is their identity |
| [Wispr Flow](https://wisprflow.ai/post/designing-a-natural-and-useful-voice-interface) | The waveform **is** the capture control, not a decoration beside one; no streaming partials — wait, understand, then deliver | The cream ground and editorial serif display |

### The elevation rule, reconciled

ElevenLabs prefers hairline borders over shadows; Apple prefers materials and
layered shadows. They only conflict if applied at the same scope. Split by
whether a surface actually floats and all three systems agree, Broomva included:

- **In-flow content** — grouped containers on a tonal step, `1px` hairline, no
  shadow. Separation comes from the tonal ladder, not from depth.
- **Floating chrome** — the tab bar only. Translucent, a bright top edge rather
  than a full stroke, and a two-layer shadow: a tight contact shadow plus a wide
  soft lift.

That is Broomva's own "matte by default, earned elevation", stated in more
operable terms.

### Two audio objects

ElevenLabs reserves colour for the audio object. Walkie has two, and the split is
semantic rather than decorative:

- **Orb** — the agent's voice coming *out*. A mesh-gradient sphere on the blue
  axis, used while a readback plays.
- **Waveform capsule** — your voice going *in*. A pill whose entire content is
  the waveform, following Wispr: the control and the feedback are the same
  object.

They are the only saturated elements in the interface. Everything else is
blue-axis monochrome plus the semantic state dots, which pair a colour with an
ink label so colour never carries meaning alone.

### Typography

Tracking is size-specific and runs in opposite directions by tier — display
tightens, body loosens. Apple and ElevenLabs specify this independently, which is
why it is followed here rather than treated as taste: `-0.02em` at 28px,
`+0.01em` on 15–16px body, `+0.3` on 12px labels. Leading runs inversely: `1.18`
on display, `1.5–1.6` on body.

Application chrome stays on the system sans stack. Both reference products use an
editorial serif for display, and it was not adopted: Broomva reserves Cal Sans
for marketing and hero surfaces, and an in-app question is neither.

### Adapter decisions

Pencil stores colour as hex; Broomva's canonical source is OKLCH. The mapping was
computed once and is recorded in the file's `Token provenance` note rather than
eyeballed.

Every colour that carries text clears 4.5:1 and every dot clears the 3:1 non-text
floor, on both `paper` and `canvas`. Two failures were found and fixed at the
adapter boundary rather than shipped:

- **Resonant AI Blue is 3.97:1 on paper.** Kept for icons and fills, darkened to
  `oklch(0.54 0.12 260)` where it carries text.
- **Attention amber fails even the 3:1 non-text floor** at `oklch(0.76 0.15 85)`
  (2.17:1 on paper). Darkened to `oklch(0.62 0.15 85)` for state dots. Green and
  tidepool clear 3:1 but fail as text, which is why state labels are ink.

## Navigation: the orb is the app

The orb is not a per-screen element. It is central and persistent, it can be
pushed down to reveal the full context behind it, and it can be retrieved. Two
states carry the whole model:

- **Orb up** — the orb holds the centre, the current ask reads underneath it, and
  the wave capsule sits at the bottom. This is the default.
- **Orb down** — the orb collapses into a floating dock capsule at the bottom
  edge, naming what it is routed to, and the full context takes the screen.

**Channels stopped being a destination.** With one persistent voice object, a
list of channels to navigate into is the wrong metaphor. Channels are now a
routing filter at the top of every screen: they select which workspace the orb
answers for, in realtime. Selecting `seaslug` does not navigate anywhere, it
re-points the voice.

## Why the voice attaches to one agent, not to every session

Switching a realtime voice session between workspaces is expensive and fragile,
and it was the hard part of every architecture considered earlier.

The way out is to stop trying. **One persistent realtime channel connects the
phone to a single router agent on a root workspace.** That agent reaches every
other Claude Code session over agent-to-agent messaging, which is first-party and
already works — a peer session messaged this one mid-build while this document
was being written.

That dissolves the open question this prototype previously carried. Injection
stops being the problem:

| Previously considered | Status under the router model |
|---|---|
| Claude Code Channels | not needed for injection |
| `tmux send-keys` | not needed |
| `CLAUDE_CODE_MESSAGING_SOCKET` | not needed, and it was the fragile option |
| Genesis-owned sessions only | no longer a limitation |

The router is also the natural home for the triage the attention budget demands:
it is the one agent that sees every session's asks, so it decides what is worth a
squawk. Claude Code's own subagents and dynamic workflows give it the machinery
to fan out across sessions without the client knowing how many exist.

What this moves rather than removes: the router becomes the trust boundary. It
holds the voice channel and can reach every session, so the fail-closed allowlist
and the "delivery goes to the principal on file" rule apply at that one point
instead of at N.

## The realtime layer

Anthropic ships no realtime speech-to-speech API, so the voice layer comes from
elsewhere. Claude Code's own `/voice` is **dictation only** — push-to-talk speech
transcribed into the prompt input, local to the terminal, no voice out and no
duplex. That is the input half; talkback added the output half. Neither reaches a
phone, which is the gap walkie exists to close.

### Verified against the OpenAI Realtime docs

| Detail | Value |
|---|---|
| SDP exchange | `POST https://api.openai.com/v1/realtime/calls` |
| Encoding | multipart form fields named `sdp` and `session` — not file uploads |
| Auth (server) | `Authorization: Bearer $OPENAI_API_KEY` |
| Auth (browser) | `POST /v1/realtime/client_secrets` for ephemeral credentials |
| Events channel | a data channel named `oai-events` |
| Models | `gpt-realtime-2.1`, `gpt-realtime-translate`, `gpt-live-transcribe` |

ElevenLabs Agents is the equivalent on the other side: fine-tuned STT, a
swappable LLM ("bring your own custom model"), low-latency TTS, and a proprietary
turn-taking model handling interruptions, reachable from React, Swift, Kotlin and
React Native SDKs, plus SIP and Twilio for telephony.

### Three layers, and the voice model is not the brain

1. **Voice layer** — OpenAI Realtime over WebRTC, or ElevenLabs Agents. Owns mic
   capture, turn-taking, barge-in and speech. It holds no state and does no work.
2. **Router agent** — a Claude Code session on a root workspace. The brain,
   exposed to the voice layer as a small number of function tools.
3. **Worker sessions** — the real workspaces, reached by the router over
   agent-to-agent messaging.

The binding constraint is that a Claude Code turn runs 9s to 10min and a realtime
call will not hold for it. So the tools are asynchronous by construction:
`ask_workspace(workspace, question)` acknowledges and returns a ticket
immediately, and the voice agent says so. Anything the router already knows —
what is running, what is blocked, what changed — it answers inside the call.

### Which unifies the two delivery paths

The realtime data channel accepts `conversation.item.create`, so the server can
inject into a live conversation. That gives one rule instead of two:

- **Call open** — the answer is spoken into the existing session when it lands.
- **Call closed**, phone in a pocket — the answer arrives as the notification plus
  audio artifact already designed.

This corrects the earlier position in this document that WebRTC was deferrable.
That was right for streaming every readback and wrong for talking to the router:
a persistent agent answering instantly from state it already holds is exactly
what realtime is for. The deferral now applies only to ride-along narration of
long work, which stays on the artifact path.

## The client, and the one thing a web app cannot do

Verified against Apple, WebKit, MDN and Expo primary sources.

**Apple ships a framework for exactly this product.** [Push to Talk](https://developer.apple.com/documentation/pushtotalk)
(iOS 16+) is the only documented path where a push wakes a backgrounded or
terminated app and *the system* activates its audio session — for playback and
for the microphone. Apple's own guide: "This allows for recording audio even if
the app is in the background."

Two paths that look adjacent are wrong:

- **`audio` background mode alone** sustains a session that is already running; it
  does not get you woken with one.
- **PushKit/CallKit is a trap.** PushKit requires CallKit on the iOS 13+ SDK, the
  system *terminates* an app that fails to report a call, and App Store 2.5.4 is a
  purpose test ("background services for their intended purposes") that agent
  readbacks delivered over VoIP push would fail. PushToTalk is the sanctioned
  analogue.

### What a PWA cannot do

Not a maturity gap that a future Safari closes — there is no web-facing analogue
to `UIBackgroundModes`, and WebKit has stated the Push API "is not an invitation
for silent background runtime."

- Play a readback while backgrounded or locked. Silent push is forbidden *and*
  punished: Safari **revokes the push permission** for a site that does not present
  the notification. A service worker has no DOM and no audio surface.
- Capture microphone while backgrounded or locked.
- Wake from terminated. No analogue to `PKPushRegistry` or `PTChannelManager`.
- Run at all without a manual Home Screen install — iOS web push is install-gated
  and there is no install-prompt API.

### The decision

**v1 is an installed PWA, scoped honestly as notify-and-open** — push, banner, tap,
foreground page with working hold-to-talk and playback. Every piece is
documented-supported, needs no Apple account, and it validates the actual product
risk: whether an agent that talks to you helps. Do not spend the native budget
before that question is answered.

**The product is an Expo dev-client app on PushToTalk**, distributed through the
paid Developer Program and TestFlight. `react-native-webrtc` cannot run in Expo
Go, so a custom dev client is required regardless; `expo-av` is removed in SDK 55
and `expo-audio` replaces it.

### The landmine

PTT lets the readback reach you while the phone is pocketed. It does **not** let
you start talking that way: transmission can only begin from the foreground, or
from a Bluetooth PTT accessory or headset play-pause button that the system maps
to begin/end transmission. **"Hold to talk without taking the phone out" is a
headset-button feature, not a screen-button one.** That is a product decision, not
an implementation detail.

Two items are unresolved rather than guessed: whether
`com.apple.developer.push-to-talk` is grantable directly or needs an Apple
capability request is **not stated** in the docs, and Expo has no PushToTalk
module, so that is a custom native module and the largest unbudgeted item on the
native path.

## Correction: the router premise was false, and so was my exclusion

Two findings from adversarial review and an empirical feasibility test overturn
the architecture recorded above. Both are recorded here rather than quietly
edited, because the earlier text is what a reader would otherwise build.

### 1. Switching workspaces mid-call is trivial. The router was solving nothing.

The claim that motivated a persistent router — "switching a realtime voice
session between workspaces is hard" — is contradicted by the API it sits on.
[OpenAI Realtime client events](https://developers.openai.com/api/reference/resources/realtime/client-events),
verbatim:

> The client may send this event at any time to update any field except for
> `voice` and `model`.

`tools` and `instructions` are both updatable mid-session. Selecting a workspace
is **one `session.update` on the open data channel** that swaps in that
workspace's tool set. No second agent, no fan-out, no ticket indirection.

So the router does not survive as *"the thing that avoids switching voice
sessions"*. Something still has to reach the worker sessions — but it should be a
plain, restartable, observable service with its state in Postgres, not a
long-lived Claude Code session. Two further findings say the same thing from the
other direction: a single session **serializes every workspace behind one turn
chain** (an emergency "stop the deploy" queues behind a ten-minute turn), and
**compaction silently destroys the ticket-to-workspace binding**, producing
fluent, confident, wrong readbacks.

### 2. Cross-session messaging is documented and GA. Excluding it was my error.

This document previously excluded `CLAUDE_CODE_MESSAGING_SOCKET` as "undocumented
and will break silently on upgrade". That was wrong.
[Cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging)
is GA (v2.1.224+) and explicitly sanctions the use:

> Read this section ... **when you want a script or hook to post into a session**

It was proven end-to-end on this machine, not merely read: a session spawned in
tmux, left until `idle`, then messaged from a plain Python script that was not a
Claude Code child — the session woke and executed. Both polarities were run.

**The trap that run exposed**, and it matters more than the capability: when the
receiving session bypasses permission prompts, Claude Code **holds** each message
for approval and drops it after five minutes unless the sender can attest its own
permission class. An HTTP service cannot attest. The naive build therefore
silently swallows every message. The fix is a single setting on the receiver —
and *needing* that fix is itself the warning in finding 3.

There is also a purpose-built seam: [channels](https://code.claude.com/docs/en/channels)
publishes a contract for building your own, whose stdio MCP server can host an
HTTP listener directly, and which has a documented reply path. It is research
preview and its contract may change.

### 3. What survives review, and must be designed for

- **Permission laundering.** Voice utterance → service → a session with *different*
  permissions is the pattern the harness contract explicitly prohibits. Making
  fan-out work unattended pushes toward flattening permissions across every
  session, which converts one spoken word into unreviewed execution everywhere.
- **Injection with an audio exfiltration channel.** Worker output is derived from
  repo content — READMEs, changelogs, postinstall banners. If an ask is free text
  that a router actions, a crafted string reaches other workspaces and the result
  is *read aloud*. Asks must be structured data with bounded fields.
- **Voice approval has no evidence surface.** Every ask worth escalating was
  escalated because a human needed to *see* something — a diff, a failure, a blast
  radius. Voice replaces a reviewable, logged, textual approval with an ephemeral
  acoustic one, summarised by the same agent that wants the yes, and leaves no
  audit artifact. This degrades decision quality in proportion to how consequential
  the decision is.
- **Anyone within earshot is an authenticated principal**, and barge-in is designed
  to yield to any incoming voice.
- **Cost is re-billed context.** OpenAI's own guidance is that the entire
  conversation is sent to the model for each response, and caching is best-effort;
  injecting async answers into a live call permanently enlarges what is re-billed
  on every later turn.

## Voice vendor: OpenAI Realtime

Both vendors can do the job. The decision turns on two things, and not on the
one usually cited.

**Not the differentiator:** server-side injection into a live call. ElevenLabs
*does* have it — `wss://api.elevenlabs.io/v1/convai/conversations/{id}/monitor`
accepts a `contextual_update` command that injects context into an active
conversation. An earlier pass here concluded it did not exist, by enumerating
REST paths in `openapi.json` — a check structurally incapable of finding a
WebSocket endpoint. Worth recording as a research failure mode, not just a fact.

**The actual differentiators:**

| | OpenAI Realtime | ElevenLabs Agents |
|---|---|---|
| Server-side injection | standard API key, no plan gate | **enterprise-only** |
| Idle connection time | not billed | billed as wall-clock (95% off only for silences over 10s) |
| Session ceiling | fixed | `max_duration_seconds`, default 600s, configurable 60–7200s |

The enterprise gate is disqualifying on its own for a personal tool, and idle
billing is exactly wrong for a channel whose value is being *available*. One
point favours ElevenLabs — a configurable two-hour ceiling against OpenAI's fixed
cap — which matters only if a single call routinely runs that long, and under the
triage-not-authorization scoping it should not.

### Two things not to design on

- **`execution_mode: "async"`** exists on ElevenLabs webhook tools and is described
  as "best for long-running operations", but it appears **only** in API-reference
  schema dumps: no guide, no example, and no statement of whether or how an async
  tool's result ever reaches the model. The field is real; the behaviour is
  unproven. It would need an empirical test before anything depends on it.
- The webhook-tools **guide** documents neither `response_timeout_secs` nor
  `execution_mode` — both live only in the API reference. Anyone working from the
  guide concludes neither exists.

### One technique worth keeping

To hold a stream open while a backend thinks, return an initial chunk ending in an
ellipsis **followed by a space**. The trailing space is load-bearing. That is a
cheap mitigation for the latency cascade between speech recognition, a slow tool,
and speech synthesis.

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
