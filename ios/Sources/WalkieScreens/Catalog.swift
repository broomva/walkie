import SwiftUI
import WalkieDesign
import WalkieModel

/// Every screen in this slice, in journey order. Drive previews and a future
/// screenshot-diff harness from this rather than a hand-kept list.
public enum WalkieCatalog: String, CaseIterable, Identifiable, Sendable {
    case home, ask, voiceStage, thread, switcher
    case welcome, scopeExplainer, notifications, microphoneDenied, addWorkspace, ready
    case settings, turnTaking, voice, notificationSettings, appearance, diagnostics
    case workspaces, workspaceDetail, orchestratorScope, history

    public var id: String { rawValue }

    /// Matches the export slug: docs/design/screens/<slug>-dark.png
    public var slug: String {
        switch self {
        case .home: "home"
        case .ask: "ask-low-stakes"
        case .voiceStage: "voice-session-idle"
        case .thread: "thread-seaslug"
        case .switcher: "switcher"
        case .welcome: "welcome"
        case .scopeExplainer: "scope-explainer"
        case .notifications: "notifications"
        case .microphoneDenied: "microphone-denied"
        case .addWorkspace: "add-workspace"
        case .ready: "ready"
        case .settings: "settings"
        case .turnTaking: "settings-turn-taking"
        case .voice: "settings-voice"
        case .notificationSettings: "settings-notifications"
        case .appearance: "settings-appearance"
        case .diagnostics: "settings-diagnostics"
        case .workspaces: "workspaces"
        case .workspaceDetail: "workspace-seaslug"
        case .orchestratorScope: "orchestrator-scope"
        case .history: "history"
        }
    }

    @MainActor @ViewBuilder public var screen: some View {
        switch self {
        case .home: HomeScreen(store: .shared)
        case .ask:
            AskScreen(
                store: .shared,
                ask: ApiAsk(
                    id: "mock-1",
                    threadId: "seaslug",
                    question: "Which sessions should walkie attach to?",
                    header: "seaslug",
                    options: [
                        ApiAskOption(label: "Genesis sessions only", description: "Injection is native. Ships in days. Talks to agents you would have to start differently."),
                        ApiAskOption(label: "Attach to sessions you already run", description: "Reaches today's work. Rides the documented inbox socket.")
                    ],
                    createdAt: "now",
                    status: "pending"
                )
            )
        case .voiceStage: VoiceScreen(store: .shared)
        case .thread:
            ThreadScreen(
                store: .shared,
                thread: ApiThread(
                    threadId: "seaslug",
                    phase: "running",
                    title: "Reading the worktree diff",
                    workspaceName: "seaslug"
                )
            )
        case .switcher: SwitcherSheet(store: .shared)
        case .welcome: WelcomeScreen()
        case .scopeExplainer: ScopeExplainerScreen()
        case .notifications: NotificationsScreen()
        case .microphoneDenied: MicrophoneDeniedScreen()
        case .addWorkspace: AddWorkspaceScreen()
        case .ready: ReadyScreen()
        case .settings: SettingsScreen()
        case .turnTaking: TurnTakingScreen()
        case .voice: VoiceSettingsScreen()
        case .notificationSettings: NotificationSettingsScreen()
        case .appearance: AppearanceScreen()
        case .diagnostics: DiagnosticsScreen()
        case .workspaces: WorkspacesScreen()
        case .workspaceDetail: WorkspaceDetailScreen()
        case .orchestratorScope: OrchestratorScopeScreen()
        case .history: HistoryScreen()
        }
    }
}

#if DEBUG
#Preview("Catalog · dark") {
    ScrollView(.horizontal) {
        HStack(spacing: 24) {
            ForEach(WalkieCatalog.allCases) { c in
                c.screen.frame(width: 390, height: 844).walkiePalette(.dark)
                    .clipShape(RoundedRectangle(cornerRadius: 28))
            }
        }
        .padding(24)
    }
    .background(Color.black)
}

#Preview("Catalog · light") {
    ScrollView(.horizontal) {
        HStack(spacing: 24) {
            ForEach(WalkieCatalog.allCases) { c in
                c.screen.frame(width: 390, height: 844).walkiePalette(.light)
                    .clipShape(RoundedRectangle(cornerRadius: 28))
            }
        }
        .padding(24)
    }
    .background(Color.white)
}
#endif
