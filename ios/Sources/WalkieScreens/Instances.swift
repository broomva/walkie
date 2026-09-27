import SwiftUI
import WalkieDesign
import WalkieModel

// Instances · 4 screens. Reference: docs/design/screens/{workspaces,
// workspace-seaslug,orchestrator-scope,history}-dark.png

public struct WorkspacesScreen: View {
    @Environment(\.walkie) private var t
    public init() {}
    public var body: some View {
        Screen(crumb: "settings") {
            ScreenTitle("Workspaces", "What the host can see, and what voice may do with each.")
            SectionGroup("Reachable") {
                DotRow(dot: t.glowBlue, title: "seaslug", meta: "running · triage, read, originate")
                RowSeparator()
                DotRow(dot: t.glowBlue, title: "genesis", meta: "running · triage, read, originate")
                RowSeparator()
                DotRow(dot: t.textFaint, title: "maestro", meta: "idle · triage, read only")
            }
            SectionGroup("On the host, not reachable") {
                DotRow(dot: t.edgeVisible, title: "broomva.tech", meta: "~/projects/broomva.tech · not added")
                RowSeparator()
                DotRow(dot: t.edgeVisible, title: "chatOS", meta: "~/projects/chatOS · not added")
            }
            SectionGroup {
                HStack(spacing: 10) {
                    Image(systemName: "plus").font(.system(size: 15)).foregroundStyle(t.blueText)
                    Text("Add a workspace").font(.system(size: 15, weight: .medium)).foregroundStyle(t.blueText)
                    Spacer()
                }
                .padding(.horizontal, WalkieSpace.s4).padding(.vertical, 14)
            }
            Footnote("The allowlist starts empty and widens one workspace at a time. Removing one takes effect on the next call, not the current one.")
        }
    }
}

struct DotRow: View {
    @Environment(\.walkie) private var t
    let dot: Color, title: String, meta: String
    var body: some View {
        HStack(spacing: WalkieSpace.s3) {
            Circle().fill(dot).frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(WalkieText.rowTitle).foregroundStyle(t.textPrimary)
                Text(meta).font(WalkieText.monoSmall).foregroundStyle(t.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: WalkieSpace.s2)
            Image(systemName: "chevron.right").font(.system(size: 13)).foregroundStyle(t.textFaint)
        }
        .padding(.horizontal, WalkieSpace.s4).padding(.vertical, 13)
    }
}

/// The top block is Genesis' own record; the two below are walkie's, layered on.
/// `confined` is the one that matters most — false means the session inherits
/// the operator's MCP servers, which no amount of path confinement reaches.
public struct WorkspaceDetailScreen: View {
    @Environment(\.walkie) private var t
    private let workspace: Workspace
    public init(workspace: Workspace = .seaslugSample) { self.workspace = workspace }
    public var body: some View {
        Screen(crumb: "workspaces") {
            ScreenTitle(workspace.name)
            SectionGroup("Genesis workspace") {
                KeyValueRow("rootPath", workspace.rootPath)
                RowSeparator()
                KeyValueRow("engine", "claude -p --resume · sticky per thread")
                RowSeparator()
                KeyValueRow("worktree", (workspace.noWorktree ?? false) ? "root · no worktree" : "per-session · genesis/mut-8821")
                RowSeparator()
                KeyValueRow("phase", "running · 12s", tint: .good)
                RowSeparator()
                KeyValueRow("confined", (workspace.confined ?? false)
                            ? "true · MCP servers dropped"
                            : "false · inherits the operator's MCP servers and skills",
                            tint: (workspace.confined ?? false) ? .good : .warn)
                RowSeparator()
                KeyValueRow("home", workspace.home ?? "unset · operator ~/.claude")
            }
            SectionGroup("What walkie's voice layer may do") {
                ToggleRow(title: "Triage and read", meta: "State, turns, receipts, and its asks.", on: true)
                RowSeparator()
                ToggleRow(title: "Originate work", meta: "Start a run in its own worktree, never on main.", on: true)
                RowSeparator()
                ToggleRow(title: "Approve contained runs",
                          meta: "Only where the host proves no merge, no push, no delete, and a one-command revert.",
                          on: true)
            }
            SectionGroup("walkie gate") {
                KeyValueRow("policy", "review · clean runs wait at awaiting")
                RowSeparator()
                KeyValueRow("auto-done", "never", tint: .warn)
            }
            Footnote("The top block is Genesis' own workspace record. The two below are walkie's, layered on top: Genesis has no concept of voice reachability or of a gate, so those are ours to define and ours to enforce.")
            SectionGroup {
                HStack(spacing: 10) {
                    Image(systemName: "minus.circle").font(.system(size: 15)).foregroundStyle(t.textMuted)
                    Text("Stop reaching this workspace").font(.system(size: 15)).foregroundStyle(t.textSecondary)
                    Spacer()
                }
                .padding(.horizontal, WalkieSpace.s4).padding(.vertical, 14)
            }
        }
    }
}

public extension Workspace {
    static let seaslugSample = Workspace(
        id: "ws_seaslug", name: "seaslug", rootPath: "~/projects/seaslug",
        isGitRepo: true, noWorktree: false, confined: false, home: nil
    )
}

/// Scope, not instructions. There is deliberately no page for what the
/// orchestrator should do — that is something you tell it.
public struct OrchestratorScopeScreen: View {
    public init() {}
    public var body: some View {
        Screen(crumb: "settings") {
            ScreenTitle("What the orchestrator governs",
                        "Which sessions it may read and dispatch to. Not what it should do — that is something you tell it.")
            SectionGroup("Governs") {
                ToggleRow(title: "seaslug", meta: "read state · propose dispatches", on: true)
                RowSeparator()
                ToggleRow(title: "genesis", meta: "read state · propose dispatches", on: true)
                RowSeparator()
                ToggleRow(title: "maestro", meta: "read state · propose dispatches", on: true)
            }
            SectionGroup("Always true") {
                ToggleRow(title: "Dispatches are typed",
                          meta: "A dispatch is a POST /message on a thread walkie chose, never a sentence a worker wrote.",
                          on: false, locked: true)
                RowSeparator()
                ToggleRow(title: "You confirm every dispatch",
                          meta: "It proposes on screen. Nothing leaves the thread until you send it.",
                          on: false, locked: true)
            }
            Footnote("There is no page for its instructions, its personality or its schedule. It is a session you can open — say what you want and read the wake log to see what it did. A settings page for an agent is a settings page for something that should have been told.")
        }
    }
}

/// Reads the append-only log, not the conversation — which is why a readback
/// can be confidently wrong about a session and this list cannot.
public struct HistoryScreen: View {
    @Environment(\.walkie) private var t
    public init() {}
    public var body: some View {
        Screen(crumb: "settings") {
            ScreenTitle("History", "Every run and every ask, oldest at the bottom. This is the record; the thread is a projection of it.")
            SectionGroup("Today") {
                DotRow(dot: t.green, title: "Nineteen mutants killed", meta: "seaslug · 4m 08s · approved by voice 10:42")
                RowSeparator()
                DotRow(dot: t.blueText, title: "Attach to which sessions?", meta: "seaslug · answered 10:41 · option 1")
                RowSeparator()
                DotRow(dot: t.green, title: "Index rebuilt", meta: "maestro · 11m 22s · dispatched from the thread")
                RowSeparator()
                DotRow(dot: t.amber, title: "Ready to merge into main", meta: "seaslug · sent back 09:58")
            }
            SectionGroup("Yesterday") {
                HStack {
                    Text("11 more runs · 3 asks").font(.system(size: 14)).foregroundStyle(t.textMuted)
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 13)).foregroundStyle(t.textFaint)
                }
                .padding(.horizontal, WalkieSpace.s4).padding(.vertical, 13)
            }
            Footnote("Nothing here is generated from the conversation. Every row is an entry in the append-only log, which is why a readback can be wrong about a session and this list cannot.")
        }
    }
}
