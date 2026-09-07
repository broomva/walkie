# Walkie — iOS scaffold

A SwiftPM package covering the **onboarding, settings and instance-configuration**
slice: 16 of the 50 designed screens. Builds and tests on macOS as well as iOS,
so `swift build` is a real gate rather than a formality.

```
swift build
swift test        # 7 tests, including the Genesis phase mapping
```

## What is here

| Target | Contents |
|---|---|
| `WalkieDesign` | Palette (both themes), metrics, theme environment, seven components, `OrbView` |
| `WalkieModel` | The Genesis contract — `RunPhase`, `Workspace`, `Session`, endpoints, `Ask` |
| `WalkieScreens` | The 16 screens plus `WalkieCatalog` |

## Screens

`WalkieCatalog` lists all 16 in journey order and carries the export slug for
each, so a screen and its reference image never drift apart:

```swift
WalkieCatalog.turnTaking.slug   // "settings-turn-taking"
WalkieCatalog.turnTaking.screen // the SwiftUI view
```

Reference images: `../docs/design/screens/<slug>-dark.png` and
`../docs/design/screens-light/<slug>-light.png`.

## Theming

A `Color` cannot read the environment, so the palette is **resolved** and
injected rather than dynamic. Apply `.walkieTheme()` once at the root; force a
palette with `.walkiePalette(.light)` in previews. The catalog previews render
all 16 in both themes side by side.

## The orb

`OrbView` is the scaffold renderer: a CPU-drawn Fibonacci lattice with the right
point count, depth falloff and size rule. The shipping one is a Metal port of
`../docs/design/shaders/orb.glsl` behind a SwiftUI `Shader`, adding the two
voices, the Undertow/Understop weather, and the internal bleed.

Two bugs are already fixed in the GLSL and **must not return on the port**:

- output is **premultiplied** — `vec4(rgb, a)` after an over-composite chain,
  never `rgb * a` a second time;
- dot radius is a **fraction of the sphere**, never absolute pixels.

`WalkieOrbSize` carries the one rule that survives both themes: below ~88pt the
orb keeps a body and drops the weather, because a bodiless lattice at dock scale
is dust.

## Grounded against Genesis

`WalkieModel/Genesis.swift` is read out of `apps/genesis`, not assumed.

- `RunPhase` is Genesis' — `idle · running · awaiting · blocked · done`. Do not
  add cases. `WorkState.from(_:)` is deliberately optional: `idle` maps to
  nothing, because it is a thread that never ran rather than walkie's `queued`.
- `awaiting` is entered when the agent calls `AskUserQuestion`; the reducer
  captures `pendingQuestion` off that tool call. An `Ask`'s options **are** the
  tool's options — build against the schema, not a parsed message.
- Transport is a **WebSocket** at `/ws?thread=<id>`, not SSE.
- Branches are `genesis/<key>`. `noWorktree` is a sticky per-session posture.
- `confined` is the real spawn-hardening flag: false means the session inherits
  the operator's MCP servers, which path confinement does not reach.

`WalkieOnly` enumerates what Genesis does **not** have and walkie must build:
the gate and approve verb, the reachability allowlist, standing routines, the
ask log, containment proof, and the orchestrator plane. Screens showing those
are specifications, not integrations.

## Deliberate absences

- **No orchestrator settings page.** It is an agent, not a preference. Its scope
  screen exists because reachability is a security surface; what it should *do*
  is something you tell it.
- **`ToggleRow(locked:)`** renders a rule, not a choice. "Nothing consequential"
  is fixed at every setting and must not become editable.
- **No progress anywhere.** No percentages, bars or fill levels.

## Known gaps

- Type scale follows the canvas (11/13/15/17), not the design system
  (12/14/16/18/22/24/28). Unresolved — see the handoff.
- Reduce-motion is a visible setting but not yet wired to the orb.
- Rows are static; none are wired to navigation or state.
- SF Symbols stand in for the canvas's Lucide icons; a few are approximations.

Full context: `../docs/handoffs/2026-08-29-walkie-design-to-build.md`
