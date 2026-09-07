import Foundation
import SwiftUI
import WalkieModel
import WalkieDesign

public enum StatusKind: Sendable {
    case ok
    case error
}

@Observable
@MainActor
public final class WalkieStore {
    public static let shared = WalkieStore()

    // Persistent Configuration
    public var serverUrlString: String {
        didSet {
            UserDefaults.standard.set(serverUrlString, forKey: "walkie.serverUrl")
            resetClient()
        }
    }

    public var secret: String {
        didSet {
            UserDefaults.standard.set(secret, forKey: "walkie.secret")
            resetClient()
        }
    }

    // Live Server State
    public private(set) var asks: [ApiAsk] = []
    public private(set) var threads: [ApiThread] = []
    public private(set) var workspaces: [Workspace] = []
    public private(set) var statusText: String = "connecting…"
    public private(set) var statusKind: StatusKind = .ok
    public private(set) var isWorking: Bool = false
    public private(set) var isOffline: Bool = false
    public private(set) var lastPingLatencyMs: Double? = nil
    public private(set) var isTestingConnection: Bool = false
    public private(set) var isAnsweringId: String? = nil

    private var client: WalkieApiClient
    private var askPollTask: Task<Void, Never>?
    private var contextPollTask: Task<Void, Never>?

    public init(
        defaultUrl: String = "http://100.82.195.109:8787",
        defaultSecret: String = "1d4960b754036d4dab30d81972e17ddf53bbf45f8cac002d"
    ) {
        let storedUrl = UserDefaults.standard.string(forKey: "walkie.serverUrl") ?? defaultUrl
        let storedSecret = UserDefaults.standard.string(forKey: "walkie.secret") ?? defaultSecret
        self.serverUrlString = storedUrl
        self.secret = storedSecret

        let url = URL(string: storedUrl) ?? URL(string: defaultUrl)!
        self.client = WalkieApiClient(baseUrl: url, secret: storedSecret)
    }

    private func resetClient() {
        guard let url = URL(string: serverUrlString) else { return }
        Task {
            await client.updateConfig(baseUrl: url, secret: secret)
            await refreshAll()
        }
    }

    public func startPolling() {
        stopPolling()

        // Initial fetch
        Task {
            await refreshAll()
        }

        // Asks clock: 4s (matching web PWA POLL_MS)
        askPollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                guard let self else { break }
                await self.refreshAsks()
            }
        }

        // Context clock: 60s (matching web PWA CONTEXT_POLL_MS)
        contextPollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                guard let self else { break }
                await self.refreshContext()
            }
        }
    }

    public func stopPolling() {
        askPollTask?.cancel()
        askPollTask = nil
        contextPollTask?.cancel()
        contextPollTask = nil
    }

    public func refreshAll() async {
        await refreshAsks()
        await refreshContext()
    }

    public func refreshAsks() async {
        do {
            let page = try await client.fetchAsks()
            self.asks = page.asks.filter { $0.status == "pending" }
            self.isOffline = false
            self.statusKind = .ok
            if self.asks.isEmpty {
                self.statusText = "all quiet"
            } else {
                self.statusText = "\(self.asks.count) waiting"
            }
        } catch let err as WalkieApiError {
            self.isOffline = true
            self.statusKind = .error
            self.statusText = err.localizedDescription
        } catch {
            self.isOffline = true
            self.statusKind = .error
            self.statusText = "cannot reach Genesis"
        }
    }

    public func refreshContext() async {
        let t = (try? await client.fetchThreads()) ?? []
        let w = (try? await client.fetchWorkspaces()) ?? []

        self.threads = t
        self.workspaces = w

        // The orb is active if any agent turn is currently running
        self.isWorking = t.contains { $0.phase == "running" }
    }

    public func answer(ask: ApiAsk, option: String) async {
        isAnsweringId = ask.id
        defer { isAnsweringId = nil }

        // Optimistic removal
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            self.asks.removeAll { $0.id == ask.id }
            if self.asks.isEmpty {
                self.statusText = "all quiet"
            } else {
                self.statusText = "\(self.asks.count) waiting"
            }
        }

        do {
            try await client.answerAsk(threadId: ask.threadId, id: ask.id, answer: option)
            // Synchronize with server truth
            await refreshAsks()
        } catch {
            self.statusText = "failed to send answer"
            self.statusKind = .error
            // Re-read server truth to restore state if answer failed
            await refreshAsks()
        }
    }

    public func testConnection() async {
        isTestingConnection = true
        defer { isTestingConnection = false }

        let result = await client.checkHealth()
        self.lastPingLatencyMs = result.latencyMs
        if result.ok {
            self.statusText = String(format: "connected (%.0fms)", result.latencyMs)
            self.statusKind = .ok
            self.isOffline = false
        } else {
            self.statusText = "connection failed"
            self.statusKind = .error
            self.isOffline = true
        }
    }
}
