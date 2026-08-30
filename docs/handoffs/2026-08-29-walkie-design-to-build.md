# walkie — design to build

> **Amended 2026-08-30 (BRO-2382).** The design is intact and still the reference. **The build order below
> is superseded** — the declared architecture ships the server first and a **PWA** as client v1, with
> SwiftUI at step 5; see
> `~/broomva/orca/workspaces/broomva/goldeye/docs/specs/2026-08-30-walkie-target-architecture.html`.
> Three corrections to this file:
> **(a)** the commit table below is one arc stale — head is `dee74ab`, not `75dbd50`; the tree is clean;
> **(b)** the open question *"PushToTalk vs plain audio session"* is **decided** — plain audio session plus
> a hold-to-talk gesture, PTT deferred as an additive later mode, wake-from-terminated knowingly out of v1;
> **(c)** of the things listed as *"ours to build"*, the **orchestrator plane is deferred** to maloca's
> escalate branch, and the **ask log is confirmed genuinely absent** from Genesis — `pendingQuestion` is
> unpersisted projection state, and `queue.jsonl` is a caller *intake* queue with a different schema.
> The six invariants under *Do not re-decide* all stand, with invariant 1 refined: irreversible verbs are
> **unexpressible**, and containment-proof is the gate inside the reversible set.

**Arc:** the interface is finished and grounded against Genesis; the Swift client is not started.
**Date:** 2026-08-29 · **Ticket:** BRO-2362 · **Branch:** merged to `main`

## TL;DR

Fifty screens, both themes, one component set, three shaders, two spec documents and a
wiring board read out of the Genesis source. Everything needed to start the client exists.

Read in this order: **the amendment**, **this file**, then the screens.
The six rules under *Do not re-decide* are the ones that took the longest to settle.

## State of the world

| | |
|---|---|
| Commits | `75dbd50` interface · `f6c2133` onboarding/settings/instances · `3591735` Genesis grounding |
| Working tree | clean |
| Committed | 50 screen exports (PNG + HTML), `WalkieTokens.swift`, 5 shaders, this handoff, the amendment |
| **Canvas source** | **`designs/walkie.pen` is the 27 Aug file — the app never wrote this session out. See below.** |

### The one thing to check first

The authoring app held the whole session in memory and did not save. `designs/walkie.pen`
on disk predates all of it. **This does not block building** — the design is fully preserved
as PNGs and as `docs/design/walkie-screens.html` / `walkie-boards.html`, which are
self-contained and readable in a browser.

It does block *editing* the canvas. If the pen app still has the document open, save it and
commit; if it doesn't, the HTML and PNG exports are the reference and the canvas would have
to be rebuilt to change anything. Verify with:

```
grep -c "Orchestrator · scope" designs/walkie.pen   # 0 = stale, >0 = saved
```

## Where everything is

| Artefact | Path |
|---|---|
| Screens, as images | `docs/design/screens/*.png` (50, slug-named, dark, 2×) + `INDEX.md` |
| Screens, as markup | `docs/design/walkie-screens.html` (self-contained) |
| Reasoning boards | `docs/design/walkie-boards.html` (17 boards) |
| Design tokens | `docs/design/tokens/WalkieTokens.swift` (generated, parses clean) |
| Shaders | `docs/design/shaders/{orb,undertow,understop}.glsl` |
| Architecture, decided | `docs/specs/2026-08-27-walkie-architecture.html` |
| Architecture, amended | `docs/specs/2026-08-29-walkie-architecture-amendment.html` |
| Canvas source | `designs/walkie.pen` (stale — see above) |

## Grounded against Genesis

Read out of `apps/genesis`, not assumed. This is the section that stops a builder calling
things that do not exist.

- **The phase machine is Genesis'.** `RunPhase = "idle" | "running" | "awaiting" | "blocked" | "done"`
  (`packages/projection/src/reducer.ts`). Running / Needs you / Stuck / Done map to
  running / **awaiting** / **blocked** / done. **Queued and Standing have no Genesis phase** —
  `idle` is a thread that never ran, which is a different claim. Do not invent one.
- **`awaiting` is entered by `AskUserQuestion`**, and the reducer captures `pendingQuestion`
  off that tool call. A walkie ask *is* that tool invocation; its named options are the
  tool's options. Build the ask screens against the tool schema, not a parsed message.
- **Transport is a WebSocket** at `/ws?thread=<id>` (`createBunWebSocket`), not SSE.
- **Branches are `genesis/<key>`** for a worktree session, or the repo's current branch at
  the root. `noWorktree` is a sticky per-session posture, not a constant.
- **`confined`** is the real spawn-hardening flag: true drops every inherited MCP server,
  false carries the operator's Gmail/Drive/Calendar connectors. MCP runs outside the
  filesystem sandbox, so nothing about path confinement reaches it.

**Endpoints that exist:** `GET/POST /workspaces`, `DELETE /workspaces/:id`,
`/workspaces/available`, `/workspaces/browse`, `/workspaces/refresh`,
`/workspaces/:id/{files,file,git/status,git/diff,git/commit,checks}`, `GET /threads`,
`GET /threads/:id`, `POST /message`, `POST /control`, `GET /health`, `GET /ws`.
`POST /control` actions: `reset · interrupt · status · archive · unarchive · rename`.

**What Genesis does NOT have, and is therefore ours to build:** the gate and the approve
verb, the voice-reachability allowlist, standing routines, the append-only per-user ask log,
containment proof for voice approval, and the orchestrator plane. walkie's *Interrupt* maps
to `control:interrupt`; *Send back* is a `POST /message`; *Approve* has no counterpart.
Screens showing any of these are **specifications, not integrations**.

Full endpoint list and type signatures: the `Wiring · what Genesis actually provides` board.

## Build order

> **Superseded** — see the amendment note at the top. The current order is: (1) walkie routes on Genesis
> · (2) PWA · (3) conversational agent · (4) dispatch + hold · (5) SwiftUI + APNs. The client sequence
> below remains correct *as the client's own internal order* once step 2 or step 5 begins.

Milestone 1 in the architecture doc (host agent, one workspace, no voice) does not need the
client at all. The client can start in parallel:

1. **Tokens and the component set** — `c/StatusBar`, `c/AddressBar`, `c/Dock`, plus
   `ChannelLine`, `TurnLine`, `ThreadTurn`, `OptionLine`, `LifecycleRail`. Every screen is
   these seven plus text.
2. **The orb** — port `orb.glsl` to MSL behind a SwiftUI `Shader`. One file, thirteen
   uniforms, three size presets. Do not build a second orb for any state.
3. **Home, Voice, Thread** — the spine, `HOME ⇄ VOICE ⇄ THREAD`.
4. **Pair, Microphone, Connecting, Off tailnet, Host offline** — where real integration starts.
5. **The ask loop** — low-stakes → answered → undo, then Look → approved / sent back.
6. **Ambient layer** — Live Activity, Dynamic Island, widgets. Last; needs a working session.

## Screen inventory

50 screens. Filenames are the slug plus `-dark`; see `docs/design/screens/INDEX.md`.

- **Onboarding** — welcome · scope-explainer · pair · microphone · microphone-denied ·
  notifications · add-workspace · ready
- **Entry** — connecting · host-offline · off-tailnet · empty
- **Bench** — home · home-all-quiet · switcher · standing · routine
- **Voice** — orchestrator · store-answered · escalated · session-idle · you-talking ·
  walkie-talking · barge-in · degraded · re-established
- **Work** — session-seaslug · look-contained · look-needs-a-screen · look-approved ·
  look-sent-back · ask-low-stakes · ask-consequential · ask-answered · receipts
- **Threads & system** — thread-orchestrator · thread-seaslug · dispatch-sent · push · access
- **Settings** — settings · turn-taking · voice · notifications · appearance · diagnostics
- **Instances** — workspaces · workspace-seaslug · orchestrator-scope · history

## The orb, concretely

One shader, three size presets, two themes. The uniforms are the runtime, not styling:

- `u_in` ← `getInputVolume()` — lifts the **whole** lattice (undirected: your speech
  arrives from outside the sphere).
- `u_out` ← `getOutputVolume()` — lifts **only the band it travels through** (directed).
- `u_work` / `u_paused` — Undertow and Understop. Identical motion, different palette.
  These never react to sound.
- `u_bleed` — weather inside the sphere as well as around it. On above 88pt, off below.
- `u_body` / `u_shade` / `u_sphere` / `u_ink` / `u_agent` — theme-driven; see the tokens file.

**Size presets** (`WalkieOrbSize`): dock `0.66` no weather and body forced in both themes —
a bodiless lattice at 44pt is dust. Inline `0.46`. Hero `0.26`, where the sphere holds ~50pt
and the *weather* scales.

**Porting notes.** The math is mechanical; `gl_FragCoord`, `texture2D` and `@sdf` are the
only things needing translation. Two bugs are fixed in the source and must not return:
output is **premultiplied** (`vec4(rgb, a)` after an over-composite chain, never `rgb * a`
again), and dot radius is a **fraction of the sphere**, never absolute pixels. A 520-point
loop hung the canvas renderer; 260 is tested and Metal will take more if measured.

## Do not re-decide

Load-bearing and argued to a conclusion. Changing one is a product decision.

1. **Nothing consequential is authorisable by voice.** Force-push, merge, dropping a
   migration, deleting. A run may be approved by voice *only* where the host proves
   containment — no merge, no push, no delete, revertible in one command — computed from the
   diff and target by the service. Never asserted by the model, never inferred from a
   summary written by the agent that wants the yes.
2. **An ask is structured data.** Already true in the engine: it is an `AskUserQuestion`
   invocation with a schema. The service must remain structurally unable to originate a
   workspace call from a worker-supplied string.
3. **The orchestrator is never on the critical path.** *What is blocked*, *read me the last
   turn* and every ask answer come from the store in under two seconds regardless of what
   the orchestrator is doing. If it ever answers those, serialization and compaction kill
   the design exactly as the original document said.
4. **Colour belongs to work; size and brightness to voice.** Running is blue, paused is
   cyan, and they never share a hue.
5. **Never draw progress.** No percentages, no fill levels, no bars. The lifecycle rail is
   five named stages. A half-full sphere was built and rejected for this reason.
6. **The thread is the audit artifact.** Every spoken exchange writes to it — that is what
   makes voice acceptable for thinking rather than only triage. It is a projection of the
   store, never the record.

## Open — decide before the screen ships

- **Reduced motion.** Not written. Undertow needs a frozen mid-breath branch; Understop is
  nearly there. A shader does not stop for free the way a keyframe does.
- **Type scale.** The canvas runs 11/13/15/17; the design system specifies
  12/14/16/18/22/24/28. Flagged repeatedly and deliberately not swept — it moves every screen.
- **Pair-failed** has no screen. Thread and receipts **empty states** have none.
- **No account concept.** Possibly correct (the tailnet is the identity) but undecided.
- ~~**PushToTalk vs plain audio session.**~~ **Closed 2026-08-30** — plain audio session with a
  hold-to-talk gesture, preserving full duplex and barge-in. Apple's PushToTalk framework is *not*
  adopted in v1 (it would be a one-way door: half-duplex plus its own system UI), so wake-from-terminated
  is knowingly out of v1 and PTT stays available as an additive later mode. The entitlement question is
  deferred with it; the only direct answer found remains a DTS forum reply, not documentation.

## Known limitations of this handoff

- **Exports are dark theme only.** The canvas renders one theme at a time and there is no
  per-theme export. Light versions need a re-export after switching the mode axis.
- **Two boards do not render** in the authoring environment — `iOS · Dynamic Island` and
  `iOS · Widgets`. Their data is correct; the renderer applies a spurious +50px offset to
  their children. Use the `The ambient layer` board and the lock-screen composition as the
  reference for those surfaces.
- **The ambient layer is designed, not specified.** Live Activity update budgets were not
  verified against current iOS limits.

## Pickup state for a fresh session

The design is finished and argued; there is no client code beyond the generated token file.
The reasoning behind every screen is in `walkie-boards.html` — when a screen looks arbitrary,
the board explains it. A fresh agent that changes one of the six invariants without reading
the corresponding board is almost certainly re-making a mistake this arc already corrected.

Start by reading the amendment, then `Wiring · what Genesis actually provides`. Those two
tell you what is decided and what actually exists.
