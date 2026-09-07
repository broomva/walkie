import SwiftUI
import WalkieDesign

/// Every screen in this slice, in journey order. Drive previews and a future
/// screenshot-diff harness from this rather than a hand-kept list.
public enum WalkieCatalog: String, CaseIterable, Identifiable, Sendable {
    case welcome, scopeExplainer, notifications, microphoneDenied, addWorkspace, ready
    case settings, turnTaking, voice, notificationSettings, appearance, diagnostics
    case workspaces, workspaceDetail, orchestratorScope, history

    public var id: String { rawValue }

    /// Matches the export slug: docs/design/screens/<slug>-dark.png
    public var slug: String {
        switch self {
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
