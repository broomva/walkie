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
    case walkieAsks, walkieAnswer, walkieThreads
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
        case .walkieAsks: "/walkie/asks"
        case .walkieAnswer: "/walkie/answer"
        case .walkieThreads: "/walkie/threads"
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

// MARK: - Live API Wire Models

public struct ApiAskOption: Codable, Sendable, Identifiable {
    public var id: String { label }
    public let label: String
    public let description: String?

    public init(label: String, description: String? = nil) {
        self.label = label
        self.description = description
    }
}

public struct ApiAsk: Codable, Sendable, Identifiable {
    public let id: String
    public let sessionId: String?
    public let threadId: String
    public let question: String
    public let header: String?
    public let options: [ApiAskOption]?
    public let multiSelect: Bool?
    public let createdAt: String
    public let status: String

    public init(id: String, sessionId: String? = nil, threadId: String, question: String, header: String? = nil, options: [ApiAskOption]? = nil, multiSelect: Bool? = nil, createdAt: String, status: String) {
        self.id = id
        self.sessionId = sessionId
        self.threadId = threadId
        self.question = question
        self.header = header
        self.options = options
        self.multiSelect = multiSelect
        self.createdAt = createdAt
        self.status = status
    }
}

public struct AsksPage: Codable, Sendable {
    public let asks: [ApiAsk]
    public let total: Int
    public let degraded: String?

    public init(asks: [ApiAsk], total: Int, degraded: String? = nil) {
        self.asks = asks
        self.total = total
        self.degraded = degraded
    }
}

public struct AnswerPayload: Codable, Sendable {
    public let threadId: String
    public let id: String
    public let answer: String

    public init(threadId: String, id: String, answer: String) {
        self.threadId = threadId
        self.id = id
        self.answer = answer
    }
}

public struct ApiThread: Codable, Sendable, Identifiable {
    public var id: String { threadId }
    public let threadId: String
    public let phase: String
    public let title: String?
    public let lastText: String?
    public let workspaceName: String?
    public let createdAt: String?
    public let archived: Bool?

    public init(threadId: String, phase: String, title: String? = nil, lastText: String? = nil, workspaceName: String? = nil, createdAt: String? = nil, archived: Bool? = nil) {
        self.threadId = threadId
        self.phase = phase
        self.title = title
        self.lastText = lastText
        self.workspaceName = workspaceName
        self.createdAt = createdAt
        self.archived = archived
    }

    public var runPhase: RunPhase {
        RunPhase(rawValue: phase) ?? .idle
    }
}

public struct ThreadsResponse: Codable, Sendable {
    public let threads: [ApiThread]
    public let total: Int?
    public let hasMore: Bool?

    public init(threads: [ApiThread], total: Int? = nil, hasMore: Bool? = nil) {
        self.threads = threads
        self.total = total
        self.hasMore = hasMore
    }
}

public struct WorkspacesResponse: Codable, Sendable {
    public let workspaces: [Workspace]
    public let defaultWorkspace: String?

    public init(workspaces: [Workspace], defaultWorkspace: String? = nil) {
        self.workspaces = workspaces
        self.defaultWorkspace = defaultWorkspace
    }
}

public struct ApiMessageTurn: Codable, Sendable, Identifiable {
    public var id: String
    public let role: String
    public let text: String
    public let timestamp: String?
    public let meta: String?
    public let isMono: Bool?

    public init(id: String = UUID().uuidString, role: String, text: String, timestamp: String? = nil, meta: String? = nil, isMono: Bool? = nil) {
        self.id = id
        self.role = role
        self.text = text
        self.timestamp = timestamp
        self.meta = meta
        self.isMono = isMono
    }
}

public struct ApiThreadDetailResponse: Codable, Sendable {
    public let turns: [ApiThreadTurn]

    public init(turns: [ApiThreadTurn] = []) {
        self.turns = turns
    }
}

public struct ApiThreadTurn: Codable, Sendable, Identifiable {
    public let id: String
    public let sessionId: String?
    public let role: String
    public let text: String
    public let createdAt: String?
    public let durationMs: Int?

    public init(
        id: String = UUID().uuidString,
        sessionId: String? = nil,
        role: String,
        text: String,
        createdAt: String? = nil,
        durationMs: Int? = nil
    ) {
        self.id = id
        self.sessionId = sessionId
        self.role = role
        self.text = text
        self.createdAt = createdAt
        self.durationMs = durationMs
    }
}

public struct ApiMessageResult: Codable, Sendable {
    public let reply: String
    public let phase: String
    public let sessionId: String?

    public init(reply: String, phase: String, sessionId: String? = nil) {
        self.reply = reply
        self.phase = phase
        self.sessionId = sessionId
    }
}

public struct ApiControlResult: Codable, Sendable {
    public let ok: Bool?
    public let phase: String?
    public let error: String?

    public init(ok: Bool? = nil, phase: String? = nil, error: String? = nil) {
        self.ok = ok
        self.phase = phase
        self.error = error
    }
}

