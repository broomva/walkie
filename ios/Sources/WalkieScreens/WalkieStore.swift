import Foundation
import SwiftUI
import Security
import WalkieModel
import WalkieDesign

public enum StatusKind: Sendable {
    case ok
    case error
}

private enum KeychainHelper {
    static let service = "tech.broomva.walkie"
    static let account = "walkie.secret"

    static func save(secret: String) {
        guard let data = secret.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
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
            KeychainHelper.save(secret: secret)
            resetClient()
        }
    }

    // Navigation & Scope State
    public var activeScope: String = "everything"
    public var selectedAsk: ApiAsk? = nil
    public var selectedThread: ApiThread? = nil
    public var isShowingVoice: Bool = false
    public var isShowingSwitcher: Bool = false
    public var isShowingSettings: Bool = false
    public var isShowingCatalog: Bool = false

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
    public private(set) var inFlightAskIds: Set<String> = []

    public var filteredAsks: [ApiAsk] {
        if activeScope == "everything" || activeScope == "orchestrator" {
            return asks
        }
        return asks.filter { ask in
            threads.first(where: { $0.threadId == ask.threadId })?.workspaceName?.lowercased() == activeScope.lowercased()
        }
    }

    public var filteredThreads: [ApiThread] {
        if activeScope == "everything" || activeScope == "orchestrator" {
            return threads
        }
        return threads.filter { $0.workspaceName?.lowercased() == activeScope.lowercased() }
    }

    private var client: WalkieApiClient
    private var askPollTask: Task<Void, Never>?
    private var contextPollTask: Task<Void, Never>?
    private var configGeneration: UInt64 = 0

    public init(
        defaultUrl: String = "http://100.82.195.109:8787",
        defaultSecret: String = "1d4960b754036d4dab30d81972e17ddf53bbf45f8cac002d"
    ) {
        let storedUrl = UserDefaults.standard.string(forKey: "walkie.serverUrl") ?? defaultUrl

        let loadedSecret: String
        if let legacySecret = UserDefaults.standard.string(forKey: "walkie.secret") {
            KeychainHelper.save(secret: legacySecret)
            UserDefaults.standard.removeObject(forKey: "walkie.secret")
            loadedSecret = legacySecret
        } else {
            loadedSecret = KeychainHelper.load() ?? defaultSecret
        }

        self.serverUrlString = storedUrl
        self.secret = loadedSecret

        let url = URL(string: storedUrl) ?? URL(string: defaultUrl)!
        self.client = WalkieApiClient(baseUrl: url, secret: loadedSecret)
    }

    private func resetClient() {
        configGeneration &+= 1
        let gen = configGeneration
        stopPolling()
        guard let url = URL(string: serverUrlString) else { return }
        Task {
            await client.updateConfig(baseUrl: url, secret: secret)
            guard self.configGeneration == gen else { return }
            await refreshAll()
            startPolling()
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
        let gen = configGeneration
        do {
            let page = try await client.fetchAsks()
            guard self.configGeneration == gen else { return }
            self.asks = page.asks.filter { $0.status == "pending" }
            self.isOffline = false
            self.statusKind = .ok
            if self.asks.isEmpty {
                self.statusText = "all quiet"
            } else {
                self.statusText = "\(self.asks.count) waiting"
            }
        } catch let err as WalkieApiError {
            guard self.configGeneration == gen else { return }
            self.isOffline = true
            self.statusKind = .error
            self.statusText = err.localizedDescription
        } catch {
            guard self.configGeneration == gen else { return }
            self.isOffline = true
            self.statusKind = .error
            self.statusText = "cannot reach Genesis"
        }
    }

    public func refreshContext() async {
        let gen = configGeneration
        let t = (try? await client.fetchThreads()) ?? []
        let w = (try? await client.fetchWorkspaces()) ?? []

        guard self.configGeneration == gen else { return }
        self.threads = t
        self.workspaces = w

        // The orb is active if any agent turn is currently running
        self.isWorking = t.contains { $0.phase == "running" }
    }

    public func answer(ask: ApiAsk, option: String) async {
        guard !inFlightAskIds.contains(ask.id) else { return }
        inFlightAskIds.insert(ask.id)
        isAnsweringId = ask.id
        defer {
            inFlightAskIds.remove(ask.id)
            if isAnsweringId == ask.id {
                isAnsweringId = nil
            }
        }

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
