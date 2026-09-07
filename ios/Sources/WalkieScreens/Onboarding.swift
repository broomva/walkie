import SwiftUI
import WalkieDesign

// Onboarding · 6 screens. Reference: docs/design/screens/{welcome,scope-explainer,
// notifications,microphone-denied,add-workspace,ready}-dark.png

public struct WelcomeScreen: View {
    @Environment(\.walkie) private var t
    public init() {}
    public var body: some View {
        StageScreen {
            OrbView(.hero, diameter: 168)
            StageTitle("walkie", size: 30)
            StageBody("Hear what your agents need. Answer by voice. Keep the decisions that matter on a screen.")
            VStack(alignment: .leading, spacing: WalkieSpace.s3) {
                bullet("ear", "Triage and status, answered in under two seconds")
                bullet("mic", "Low-stakes answers, said out loud")
                bullet("display", "Anything consequential opens on a screen, with the evidence")
            }
            .padding(.top, WalkieSpace.s2)
            PillButton("Get started", primary: true)
        }
    }
    private func bullet(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon).font(.system(size: 14)).foregroundStyle(t.textFaint).frame(width: 16)
            Text(text).font(.system(size: 14)).foregroundStyle(t.textSecondary)
                .fixedSize(horizontal: false, vertical: true).multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
    }
}

/// States the scope BEFORE the user relies on it. Anyone in earshot is a
/// principal, which is why the third row is a permanent no rather than a default.
public struct ScopeExplainerScreen: View {
    public init() {}
    public var body: some View {
        StageScreen {
            OrbView(.hero, diameter: 132)
            StageTitle("What voice will and will not do")
            StageBody("Worth knowing before you rely on it. This is a scoping decision, not a limitation waiting to be lifted.")
            SectionGroup {
                scopeRow("checkmark", true, "Ask what is blocked", "answered from the store, in under two seconds")
                RowSeparator()
                scopeRow("checkmark", true, "Choose between named options", "where the wrong choice costs one commit")
                RowSeparator()
                scopeRow("xmark", false, "Merge, force-push, drop a migration", "these leave the call and open on a screen")
            }
            StageHint("Anyone within earshot can speak to walkie. That is why nothing consequential is authorisable by voice at any setting.")
            PillButton("Understood", primary: true)
        }
    }
    @ViewBuilder private func scopeRow(_ icon: String, _ good: Bool, _ title: String, _ meta: String) -> some View {
        ScopeRow(icon: icon, good: good, title: title, meta: meta)
    }
}

private struct ScopeRow: View {
    @Environment(\.walkie) private var t
    let icon: String, good: Bool, title: String, meta: String
    var body: some View {
        HStack(alignment: .top, spacing: WalkieSpace.s3) {
            Image(systemName: icon).font(.system(size: 14, weight: .medium))
                .foregroundStyle(good ? t.green : t.textFaint).frame(width: 16)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(WalkieText.body).foregroundStyle(t.textPrimary)
                Text(meta).font(.system(size: 12)).foregroundStyle(t.textMuted)
            }
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .multilineTextAlignment(.leading)
        .padding(.horizontal, WalkieSpace.s4).padding(.vertical, 13)
    }
}

public struct NotificationsScreen: View {
    public init() {}
    public var body: some View {
        StageScreen {
            OrbView(.hero, diameter: 168)
            StageTitle("How walkie reaches you")
            StageBody("An ask waits in the log until you acknowledge it. A push is how you find out it is there when the app is closed.")
            HStack(spacing: WalkieSpace.s2) {
                PillButton("Allow notifications", primary: true)
                PillButton("Later")
            }
            StageHint("asks never expire · a push is a view over the log, not the ask itself", mono: true)
        }
    }
}

public struct MicrophoneDeniedScreen: View {
    public init() {}
    public var body: some View {
        StageScreen {
            OrbView(.hero, diameter: 168)
            StageTitle("The microphone is off")
            StageBody("walkie still works — the bench, the threads and every ask are readable, and you can answer by typing. Only the voice half is gone.")
            HStack(spacing: WalkieSpace.s2) {
                PillButton("Open Settings", primary: true)
                PillButton("Carry on")
            }
            StageHint("nothing about the work depends on the mic · only the way you reach it", mono: true)
        }
    }
}

public struct AddWorkspaceScreen: View {
    public init() {}
    public var body: some View {
        Screen(crumb: "first workspace") {
            ScreenTitle("Make one reachable",
                        "The host can see your sessions. Nothing is reachable by voice until you say which.")
            SectionGroup("Found on the host") {
                NavRow(icon: "folder", title: "seaslug", meta: "~/broomva/apps/seaslug · claude code · idle", mono: true, chevron: false)
                RowSeparator()
                NavRow(icon: "folder", title: "genesis", meta: "~/broomva/core/genesis · claude code · running", mono: true, chevron: false)
                RowSeparator()
                NavRow(icon: "folder", title: "maestro", meta: "~/broomva/apps/maestro · claude code · idle", mono: true, chevron: false)
            }
            SectionGroup("What voice may do with it") {
                ToggleRow(title: "Triage and read", meta: "Ask what is blocked, read back turns, hear its asks.", on: true)
                RowSeparator()
                ToggleRow(title: "Originate work", meta: "Start something in its own worktree. Never touches main.", on: true)
                RowSeparator()
                ToggleRow(title: "Nothing consequential",
                          meta: "Merge, force-push, delete and migrations always open on a screen. Not a setting.",
                          on: false, locked: true)
            }
            Footnote("You can widen this later. The third row is fixed at every setting — it is the reason a stranger's yes reaches nothing that matters.")
        }
    }
}

public struct ReadyScreen: View {
    @Environment(\.walkie) private var t
    public init() {}
    public var body: some View {
        StageScreen {
            OrbView(.hero, diameter: 168, volume: 0.2)
            StageTitle("seaslug is listening")
            StageBody("Hold anywhere and ask it something. If nothing is happening yet, ask what it is working on — the answer comes from the store, so it is instant.")
            VStack(spacing: WalkieSpace.s2) {
                example("“What is blocked?”")
                example("“Read me the last turn on seaslug.”")
                example("“Is anything waiting on me?”")
            }
            StageHint("hold to talk · release to send", mono: true)
        }
    }
    private func example(_ q: String) -> some View {
        Text(q).font(.system(size: 14)).foregroundStyle(t.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14).padding(.vertical, 11)
            .background(t.surface, in: RoundedRectangle(cornerRadius: WalkieRadius.card))
            .overlay(RoundedRectangle(cornerRadius: WalkieRadius.card).stroke(t.edge, lineWidth: 1))
    }
}
