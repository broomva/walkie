import SwiftUI
import WalkieDesign

// Settings · 6 screens. Reference: docs/design/screens/settings*-dark.png

public struct SettingsScreen: View {
    public init() {}
    public var body: some View {
        Screen(crumb: "walkie") {
            ScreenTitle("Settings")
            SectionGroup("Voice") {
                NavRow(icon: "mic", title: "Turn-taking", meta: "Hold to talk")
                RowSeparator()
                NavRow(icon: "waveform", title: "Voice and readback", meta: "marin · full detail")
            }
            SectionGroup("Work") {
                NavRow(icon: "folder", title: "Workspaces", meta: "3 reachable")
                RowSeparator()
                NavRow(icon: "shield", title: "What voice can reach", meta: "the allowlist")
                RowSeparator()
                NavRow(icon: "clock.arrow.circlepath", title: "History", meta: "every run and every ask")
            }
            SectionGroup("App") {
                NavRow(icon: "bell", title: "Notifications", meta: "asks only · quiet 22:00–07:00")
                RowSeparator()
                NavRow(icon: "circle.lefthalf.filled", title: "Appearance", meta: "follow system")
                RowSeparator()
                NavRow(icon: "waveform.path.ecg", title: "Diagnostics", meta: "host, tailnet, session age")
            }
            Footnote("There is no page for the orchestrator. It is an agent, not a preference — what it should do is something you tell it, and the wake log shows what it did.")
        }
    }
}

/// The decided fork, exposed rather than buried. Hold to talk is the default
/// because earshot is the authentication boundary and a closed mic is a much
/// smaller one. Open mic stays available because wiring WebRTC against a plain
/// audio session kept full duplex — it is a preference, not a one-way door.
public struct TurnTakingScreen: View {
    public init() {}
    public var body: some View {
        Screen(crumb: "settings") {
            ScreenTitle("Turn-taking",
                        "How walkie knows you are done speaking. Both work; they trade privacy against hands-free.")
            SectionGroup("Mode") {
                PickerRow(title: "Hold to talk",
                          meta: "The mic opens when your thumb goes down and shuts when it lifts. Cut in by pressing.",
                          selected: true)
                RowSeparator()
                PickerRow(title: "Open mic",
                          meta: "walkie listens continuously and decides when you stopped. Cut in by speaking.")
            }
            SectionGroup("While open mic is on") {
                ToggleRow(title: "Show the indicator always",
                          meta: "A live mark in the chrome whenever the mic is open, not only while you speak.", on: true)
                RowSeparator()
                ToggleRow(title: "Mute on lock",
                          meta: "Close the mic when the phone locks, even mid-session.", on: true)
            }
            Footnote("Hold to talk is the default because earshot is the authentication boundary, and a closed mic is a much smaller one. Open mic is worth it when your hands are on a keyboard — which is exactly when you would turn it on deliberately.")
        }
    }
}

public struct VoiceSettingsScreen: View {
    public init() {}
    public var body: some View {
        Screen(crumb: "settings") {
            ScreenTitle("Voice and readback")
            SectionGroup("Voice") {
                PickerRow(title: "marin", meta: "the one walkie speaks with", selected: true)
                RowSeparator()
                PickerRow(title: "cedar", meta: "warmer, slightly slower")
            }
            SectionGroup("How much it reads back") {
                PickerRow(title: "Full detail",
                          meta: "The whole turn, as written. Long, and never summarised by the agent that wrote it.",
                          selected: true)
                RowSeparator()
                PickerRow(title: "Headline only",
                          meta: "What changed and what it asks. Receipts stay on the screen.")
            }
            SectionGroup("Speed") {
                NavRow(title: "Playback", value: "1.0×", chevron: false)
            }
            Footnote("Full detail is the default on purpose: a summary of a turn is produced by the same agent whose work you are judging, which is the objection that scoped voice down in the first place.")
        }
    }
}

public struct NotificationSettingsScreen: View {
    public init() {}
    public var body: some View {
        Screen(crumb: "settings") {
            ScreenTitle("Notifications",
                        "A push is a view over the ask log. Turning one off changes how you find out, never whether the ask exists.")
            SectionGroup("Push me for") {
                ToggleRow(title: "Asks", meta: "Something is waiting on a decision only you can make.", on: true)
                RowSeparator()
                ToggleRow(title: "Stuck runs", meta: "A session cannot progress without a change you have to make.", on: true)
                RowSeparator()
                ToggleRow(title: "Finished runs", meta: "Done, with receipts. Most people want this off.", on: false)
                RowSeparator()
                ToggleRow(title: "Standing routine results", meta: "Only when a routine surfaces something.", on: true)
            }
            SectionGroup("Quiet hours") {
                ToggleRow(title: "22:00 – 07:00",
                          meta: "Asks still arrive and still wait. The phone just does not ring.", on: true)
            }
            Footnote("Nothing here can drop an ask. The log is append-only and every view over it is individually ackable, so a missed push is a missed notification and not a missed decision.")
        }
    }
}

public struct AppearanceScreen: View {
    public init() {}
    public var body: some View {
        Screen(crumb: "settings") {
            ScreenTitle("Appearance")
            SectionGroup("Theme") {
                PickerRow(title: "Follow system", selected: true)
                RowSeparator()
                PickerRow(title: "Light")
                RowSeparator()
                PickerRow(title: "Dark")
            }
            SectionGroup("Motion") {
                ToggleRow(title: "Reduce motion",
                          meta: "The Undertow holds at its mid-breath frame and the lattice stops turning. The signal survives; the movement stops.")
                RowSeparator()
                ToggleRow(title: "Follow the system setting",
                          meta: "Use the OS Reduce Motion setting rather than this switch.", on: true)
            }
            SectionGroup("The orb") {
                PickerRow(title: "Full", meta: "260 points, weather inside and out.", selected: true)
                RowSeparator()
                PickerRow(title: "Simplified",
                          meta: "Fewer points and no internal weather. Kinder on battery over long calls.")
            }
            Footnote("Every haloed row is a live GPU surface. On a bench of eight running sessions that is a battery decision rather than an aesthetic one, which is why Simplified exists.")
        }
    }
}

public struct DiagnosticsScreen: View {
    public init() {}
    public var body: some View {
        Screen(crumb: "settings") {
            ScreenTitle("Diagnostics")
            SectionGroup("Link") {
                KeyValueRow("tailnet", "connected · 3 peers", tint: .good)
                RowSeparator()
                KeyValueRow("host", "genesis api · responding", tint: .good)
                RowSeparator()
                KeyValueRow("latency", "host 14ms · openai 82ms")
            }
            SectionGroup("This call") {
                KeyValueRow("session", "opened 10:29 · 41 min elapsed")
                RowSeparator()
                KeyValueRow("cap", "re-establishes at 58 min", tint: .warn)
                RowSeparator()
                KeyValueRow("transport", "webrtc · ice connected")
                RowSeparator()
                KeyValueRow("turn-taking", "turn_detection null · hold to talk")
            }
            SectionGroup("Store") {
                KeyValueRow("asks", "1 open · 47 acked")
                RowSeparator()
                KeyValueRow("last sync", "4s ago")
                RowSeparator()
                KeyValueRow("bindings", "3 workspaces")
            }
            Footnote("The 60-minute cap has no event and no warning. The elapsed clock above is the only one there is, which is why walkie re-establishes before it rather than reacting to it.")
        }
    }
}
