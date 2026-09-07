import Foundation

public enum WalkieApiError: LocalizedError, Sendable {
    case unauthorized
    case serverUnreachable(String)
    case httpError(status: Int, message: String)
    case invalidResponse

    public var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Invalid Walkie secret (unauthorized)"
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
    private let session: URLSession

    public init(baseUrl: URL, secret: String, session: URLSession = .shared) {
        self.baseUrl = baseUrl
        self.secret = secret
        self.session = session
    }

    public func updateConfig(baseUrl: URL, secret: String) {
        self.baseUrl = baseUrl
        self.secret = secret
    }

    private func makeRequest(endpoint: GenesisEndpoint, method: String = "GET", body: Data? = nil) -> URLRequest {
        let url = baseUrl.appendingPathComponent(endpoint.path)
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue(secret, forHTTPHeaderField: "x-genesis-walkie-secret")
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        req.timeoutInterval = 8.0
        return req
    }

    public func fetchAsks() async throws -> AsksPage {
        let req = makeRequest(endpoint: .walkieAsks)
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
        let req = makeRequest(endpoint: .walkieAnswer, method: "POST", body: body)
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
        let req = makeRequest(endpoint: .walkieThreads)
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
        let req = makeRequest(endpoint: .workspaces)
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
        let req = makeRequest(endpoint: .health)
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
}
