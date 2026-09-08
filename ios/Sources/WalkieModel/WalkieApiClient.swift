import Foundation

public enum WalkieApiError: LocalizedError, Sendable {
    case unauthorized
    case insecureEndpoint(String)
    case serverUnreachable(String)
    case httpError(status: Int, message: String)
    case invalidResponse

    public var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Invalid Walkie secret (unauthorized)"
        case .insecureEndpoint(let url):
            return "Insecure endpoint rejected (HTTPS required for non-mesh endpoints): \(url)"
        case .serverUnreachable(let msg):
            return "Cannot reach Genesis: \(msg)"
        case .httpError(let status, let msg):
            return "HTTP \(status): \(msg)"
        case .invalidResponse:
            return "Invalid response from server"
        }
    }
}

public actor WalkieApiClient {
    public var baseUrl: URL
    public var secret: String
    public var bearerToken: String?
    private let session: URLSession

    public init(baseUrl: URL, secret: String, bearerToken: String? = nil, session: URLSession = .shared) {
        self.baseUrl = baseUrl
        self.secret = secret
        self.bearerToken = bearerToken
        self.session = session
    }

    public static func isPermittedScheme(url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        if scheme == "https" { return true }
        if scheme == "http" {
            guard let host = url.host?.lowercased() else { return false }
            // Permit unencrypted HTTP only on loopback, local network, or Tailscale mesh IP
            if host == "localhost" || host == "127.0.0.1" || host.hasSuffix(".local") {
                return true
            }
            if host.hasPrefix("100.") {
                return true
            }
        }
        return false
    }

    public func updateConfig(baseUrl: URL, secret: String, bearerToken: String? = nil) {
        self.baseUrl = baseUrl
        self.secret = secret
        self.bearerToken = bearerToken
    }

    private func makeRequest(endpoint: GenesisEndpoint, method: String = "GET", body: Data? = nil) throws -> URLRequest {
        guard Self.isPermittedScheme(url: baseUrl) else {
            throw WalkieApiError.insecureEndpoint(baseUrl.absoluteString)
        }
        let url = baseUrl.appendingPathComponent(endpoint.path)
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue(secret, forHTTPHeaderField: "x-genesis-walkie-secret")
        if let bearerToken, !bearerToken.isEmpty {
            let scheme = baseUrl.scheme?.lowercased()
            let host = baseUrl.host?.lowercased() ?? ""
            let isPlainLocalHttp = scheme == "http" && host.hasSuffix(".local")
            if !isPlainLocalHttp {
                req.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
            }
        }
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        req.timeoutInterval = 8.0
        return req
    }

    public func fetchAsks() async throws -> AsksPage {
        let req = try makeRequest(endpoint: .walkieAsks)
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw WalkieApiError.invalidResponse
        }
        if http.statusCode == 401 || http.statusCode == 403 {
            throw WalkieApiError.unauthorized
        }
        guard http.statusCode == 200 else {
            let msg = String(data: data, encoding: .utf8) ?? "status \(http.statusCode)"
            throw WalkieApiError.httpError(status: http.statusCode, message: msg)
        }
        return try JSONDecoder().decode(AsksPage.self, from: data)
    }

    public func answerAsk(threadId: String, id: String, answer: String) async throws {
        let payload = AnswerPayload(threadId: threadId, id: id, answer: answer)
        let body = try JSONEncoder().encode(payload)
        let req = try makeRequest(endpoint: .walkieAnswer, method: "POST", body: body)
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw WalkieApiError.invalidResponse
        }
        if http.statusCode == 401 || http.statusCode == 403 {
            throw WalkieApiError.unauthorized
        }
        // 200/204 is success. 409 means already answered elsewhere, which is non-fatal.
        if http.statusCode == 409 {
            return
        }
        guard http.statusCode >= 200 && http.statusCode < 300 else {
            let msg = String(data: data, encoding: .utf8) ?? "status \(http.statusCode)"
            throw WalkieApiError.httpError(status: http.statusCode, message: msg)
        }
    }

    public func fetchThreads() async throws -> [ApiThread] {
        guard let req = try? makeRequest(endpoint: .walkieThreads) else {
            return []
        }
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            return []
        }
        if let decoded = try? JSONDecoder().decode(ThreadsResponse.self, from: data) {
            return decoded.threads
        }
        return []
    }

    public func fetchWorkspaces() async throws -> [Workspace] {
        guard let req = try? makeRequest(endpoint: .workspaces) else {
            return []
        }
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            return []
        }
        if let decoded = try? JSONDecoder().decode(WorkspacesResponse.self, from: data) {
            return decoded.workspaces
        }
        if let list = try? JSONDecoder().decode([Workspace].self, from: data) {
            return list
        }
        return []
    }

    public func checkHealth() async -> (ok: Bool, latencyMs: Double) {
        let start = CFAbsoluteTimeGetCurrent()
        guard let req = try? makeRequest(endpoint: .health) else {
            return (false, 0)
        }
        do {
            let (_, response) = try await session.data(for: req)
            let elapsed = (CFAbsoluteTimeGetCurrent() - start) * 1000.0
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                return (true, elapsed)
            }
            return (false, elapsed)
        } catch {
            let elapsed = (CFAbsoluteTimeGetCurrent() - start) * 1000.0
            return (false, elapsed)
        }
    }

    public func fetchThreadTurns(threadId: String) async throws -> [ApiThreadTurn] {
        guard let req = try? makeRequest(endpoint: .thread(threadId)) else {
            return []
        }
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            return []
        }
        if let decoded = try? JSONDecoder().decode(ApiThreadDetailResponse.self, from: data) {
            return decoded.turns
        }
        return []
    }

    public func sendMessage(threadId: String, text: String) async throws -> ApiMessageResult {
        struct MessagePayload: Codable {
            let threadId: String
            let text: String
        }
        let payload = MessagePayload(threadId: threadId, text: text)
        let body = try JSONEncoder().encode(payload)
        let req = try makeRequest(endpoint: .message, method: "POST", body: body)
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw WalkieApiError.invalidResponse
        }
        if http.statusCode == 401 || http.statusCode == 403 {
            throw WalkieApiError.unauthorized
        }
        guard http.statusCode >= 200 && http.statusCode < 300 else {
            let msg = String(data: data, encoding: .utf8) ?? "status \(http.statusCode)"
            throw WalkieApiError.httpError(status: http.statusCode, message: msg)
        }
        return try JSONDecoder().decode(ApiMessageResult.self, from: data)
    }

    public func controlThread(threadId: String, action: ControlAction) async throws -> ApiControlResult {
        struct ControlPayload: Codable {
            let threadId: String
            let action: String
        }
        let payload = ControlPayload(threadId: threadId, action: action.rawValue)
        let body = try JSONEncoder().encode(payload)
        let req = try makeRequest(endpoint: .control, method: "POST", body: body)
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw WalkieApiError.invalidResponse
        }
        if http.statusCode == 401 || http.statusCode == 403 {
            throw WalkieApiError.unauthorized
        }
        guard http.statusCode >= 200 && http.statusCode < 300 else {
            let msg = String(data: data, encoding: .utf8) ?? "status \(http.statusCode)"
            throw WalkieApiError.httpError(status: http.statusCode, message: msg)
        }
        let decoded = try JSONDecoder().decode(ApiControlResult.self, from: data)
        if decoded.ok == false {
            let message = decoded.error ?? decoded.reason ?? "Control action failed"
            throw WalkieApiError.httpError(status: http.statusCode, message: message)
        }
        return decoded
    }
}
