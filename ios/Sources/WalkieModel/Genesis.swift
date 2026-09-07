// Genesis contract, read out of apps/genesis rather than assumed.
// Source: packages/projection/src/reducer.ts, packages/core/src/types.ts,
// apps/api/src/server.ts. See the canvas board "Wiring · what Genesis
// actually provides" and docs/handoffs/2026-08-29-walkie-design-to-build.md.

import Foundation

/// The engine's phase machine. This is Genesis' vocabulary, not walkie's —
/// do not add cases. `done` and `blocked` are absorbing; `awaiting` survives a
/// turn-ending result, which is why a run can wait on you with nothing running.
public enum RunPhase: String, Codable, Sendable, CaseIterable {
    case idle, running, awaiting, blocked, done
}

/// walkie's plain-voice vocabulary. Maps onto RunPhase but NOT one to one:
/// `queued` and `standing` have no Genesis phase and are walkie's own.
public enum WorkState: String, Sendable, CaseIterable {
    case queued, running, stuck, needsYou, done, standing

    /// The only lossless direction. `idle` is a thread that has never run,
    /// which is a different claim from queued — hence the optional.
    public static func from(_ phase: RunPhase) -> WorkState? {
        switch phase {
        case .running: .running
        case .awaiting: .needsYou
        case .blocked: .stuck
        case .done: .done
        case .idle: nil
        }
    }
}

public struct Workspace: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String
    /// A git repository root the agent operates in.
    public let rootPath: String
    public let isGitRepo: Bool?
    /// Run directly in rootPath instead of a per-session worktree. A posture,
    /// not a constant — a nested monorepo runs at the root by design.
    public let noWorktree: Bool?
    /// Spawn hardening. True drops every inherited MCP server; false carries
    /// the operator's. MCP runs outside the filesystem sandbox, so path
    /// confinement does not reach it and this flag is the only thing that does.
    public let confined: Bool?
    /// Absolute HOME for this workspace's agent spawns. Unset = the operator's.
    public let home: String?

    public init(id: String, name: String, rootPath: String, isGitRepo: Bool? = nil,
                noWorktree: Bool? = nil, confined: Bool? = nil, home: String? = nil) {
        self.id = id; self.name = name; self.rootPath = rootPath
        self.isGitRepo = isGitRepo; self.noWorktree = noWorktree
        self.confined = confined; self.home = home
    }
}

public struct Session: Codable, Sendable, Identifiable {
    public let id: String
    public let workspaceId: String
    public let threadId: String
    /// The coding-agent session id, for `--resume` continuity.
    public let agentSessionId: String?
    public let phase: RunPhase
    /// Bound sticky on the first turn and reused after.
    public let engine: String?
    public let noWorktree: Bool?
    /// `genesis/<key>` for a worktree session, else the repo's current branch.
    public let branch: String?
    public let title: String?
    public let archived: Bool?
}

/// The surface Genesis serves today. Anything not listed here does not exist
/// and must be built — see `WalkieOnly` below.
public enum GenesisEndpoint: Sendable {
    case health, workspaces, workspacesAvailable, workspacesBrowse, workspacesRefresh
    case workspaceFiles(String), workspaceGitStatus(String), workspaceGitDiff(String), workspaceChecks(String)
    case threads, thread(String), message, control
    /// Live turn events. A WebSocket, not SSE.
    case socket(thread: String)

    public var path: String {
        switch self {
        case .health: "/health"
        case .workspaces: "/workspaces"
        case .workspacesAvailable: "/workspaces/available"
        case .workspacesBrowse: "/workspaces/browse"
        case .workspacesRefresh: "/workspaces/refresh"
        case .workspaceFiles(let id): "/workspaces/\(id)/files"
        case .workspaceGitStatus(let id): "/workspaces/\(id)/git/status"
        case .workspaceGitDiff(let id): "/workspaces/\(id)/git/diff"
        case .workspaceChecks(let id): "/workspaces/\(id)/checks"
        case .threads: "/threads"
        case .thread(let id): "/threads/\(id)"
        case .message: "/message"
        case .control: "/control"
        case .socket(let thread): "/ws?thread=\(thread)"
        }
    }
}

/// `POST /control` actions. walkie's Interrupt is `.interrupt`; Send back is a
/// `POST /message`. There is no approve action — the gate is walkie's to build.
public enum ControlAction: String, Codable, Sendable {
    case reset, interrupt, status, archive, unarchive, rename
}

/// Concepts walkie adds that Genesis does not have. Every screen showing one of
/// these is a specification, not an integration. Listed so nobody ships a call
/// to an endpoint that was never written.
public enum WalkieOnly: String, Sendable, CaseIterable {
    case gateAndApprove
    case voiceReachabilityAllowlist
    case standingRoutines
    case askLog
    case containmentProof
    case orchestratorPlane
}

/// An ask is not a parsed message. `awaiting` is entered when the agent calls
/// `AskUserQuestion`, and the reducer captures `pendingQuestion` off that tool
/// call — so the options below ARE the tool's options.
public struct Ask: Codable, Sendable, Identifiable {
    public let id: String
    public let threadId: String
    public let question: String
    public let options: [AskOption]
    /// Set by the host, never by the model, and never inferred from a summary
    /// written by the agent that wants the yes.
    public let containment: Containment
    public let askedAt: Date
}

public struct AskOption: Codable, Sendable, Identifiable {
    public let id: String
    public let label: String
    public let detail: String?
    public let safest: Bool
}

/// Whether voice may answer. `.contained` requires a proof computed from the
/// run's diff and target: no merge, no push, no delete, revertible in one
/// command. Anything else opens on a screen with the evidence.
public enum Containment: String, Codable, Sendable {
    case contained, needsAScreen
    public var voiceMayApprove: Bool { self == .contained }
}
