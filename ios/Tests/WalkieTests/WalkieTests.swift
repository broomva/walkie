import Testing
import SwiftUI
@testable import WalkieDesign
@testable import WalkieModel
@testable import WalkieScreens

@Test("every catalog entry has a matching export slug")
func catalogSlugsAreUnique() {
    let slugs = WalkieCatalog.allCases.map(\.slug)
    #expect(slugs.count == 21)
    #expect(Set(slugs).count == slugs.count)
}

@Test("hex parsing handles both RGB and RGBA")
func hexParsing() {
    // Smoke: opaque and alpha forms both construct without trapping.
    _ = Color(hex: "#0C101A")
    _ = Color(hex: "#18213512")
}

@Test("the phase mapping is lossy in exactly one place")
func phaseMapping() {
    #expect(WorkState.from(.running) == .running)
    #expect(WorkState.from(.awaiting) == .needsYou)
    #expect(WorkState.from(.blocked) == .stuck)
    #expect(WorkState.from(.done) == .done)
    // `idle` is a thread that has never run — NOT walkie's `queued`.
    #expect(WorkState.from(.idle) == nil)
}

@Test("walkie states without a Genesis phase stay unmapped")
func walkieOnlyStates() {
    let mapped = Set(RunPhase.allCases.compactMap(WorkState.from))
    #expect(!mapped.contains(.queued))
    #expect(!mapped.contains(.standing))
}

@Test("only contained runs may be approved by voice")
func containmentGate() {
    #expect(Containment.contained.voiceMayApprove)
    #expect(!Containment.needsAScreen.voiceMayApprove)
}

@Test("endpoint paths match the Genesis surface")
func endpointPaths() {
    #expect(GenesisEndpoint.message.path == "/message")
    #expect(GenesisEndpoint.control.path == "/control")
    #expect(GenesisEndpoint.socket(thread: "t1").path == "/ws?thread=t1")
    #expect(GenesisEndpoint.workspaceGitDiff("ws1").path == "/workspaces/ws1/git/diff")
    #expect(GenesisEndpoint.walkieAsks.path == "/walkie/asks")
    #expect(GenesisEndpoint.walkieAnswer.path == "/walkie/answer")
    #expect(GenesisEndpoint.walkieThreads.path == "/walkie/threads")
}

@Test("the dock orb keeps a body and drops the weather in both themes")
func orbSizeRule() {
    #expect(WalkieOrbSize.dock.forcesBody)
    #expect(!WalkieOrbSize.dock.showsWeather)
    #expect(!WalkieOrbSize.hero.forcesBody)
    #expect(WalkieOrbSize.hero.showsWeather)
    #expect(WalkieOrbSize.hero.radius < WalkieOrbSize.dock.radius)
}

@Test("AsksPage JSON decodes correctly from Genesis response")
func asksPageDecoding() throws {
    let json = """
    {
      "asks": [
        {
          "id": "ask-123",
          "threadId": "th-456",
          "question": "Deploy to staging?",
          "header": "Confirmation required",
          "options": [
            {"label": "Deploy", "description": "Roll out"},
            {"label": "Hold"}
          ],
          "createdAt": "2026-09-07T00:00:00Z",
          "status": "pending"
        }
      ],
      "total": 1
    }
    """
    let page = try JSONDecoder().decode(AsksPage.self, from: json.data(using: .utf8)!)
    #expect(page.total == 1)
    #expect(page.asks.count == 1)
    #expect(page.asks[0].id == "ask-123")
    #expect(page.asks[0].options?.count == 2)
    #expect(page.asks[0].options?[0].label == "Deploy")
}

@Test("AnswerPayload encodes to expected JSON structure")
func answerPayloadEncoding() throws {
    let payload = AnswerPayload(threadId: "th-1", id: "ask-1", answer: "Deploy")
    let data = try JSONEncoder().encode(payload)
    let dict = try JSONSerialization.jsonObject(with: data) as? [String: String]
    #expect(dict?["threadId"] == "th-1")
    #expect(dict?["id"] == "ask-1")
    #expect(dict?["answer"] == "Deploy")
}

@Test("scheme validation requires HTTPS for remote endpoints and allows private mesh HTTP")
func schemeValidation() {
    #expect(WalkieApiClient.isPermittedScheme(url: URL(string: "https://api.broomva.tech")!))
    #expect(WalkieApiClient.isPermittedScheme(url: URL(string: "http://100.82.195.109:8787")!))
    #expect(WalkieApiClient.isPermittedScheme(url: URL(string: "http://127.0.0.1:8787")!))
    #expect(WalkieApiClient.isPermittedScheme(url: URL(string: "http://localhost:8787")!))
    #expect(WalkieApiClient.isPermittedScheme(url: URL(string: "http://genesis.local:8787")!))
    #expect(!WalkieApiClient.isPermittedScheme(url: URL(string: "http://insecure-remote.example.com")!))
}

@Test("design components construct cleanly")
@MainActor
func componentsSmoke() {
    _ = AddressBar(scope: "everything", meta: "3 sessions · 1 ask")
    _ = DockBar(title: "Three sessions live", subtitle: "Hold anywhere to talk")
    _ = OptionLine(title: "Option A", description: "First choice", badge: "safest", isSelected: true)
    _ = ThreadTurnLine(role: "you", meta: "spoken", text: "Hello", isMono: false)
}

@Test("ApiThreadDetailResponse decodes turn history from Genesis")
func threadDetailResponseDecoding() throws {
    let json = """
    {
      "turns": [
        {
          "id": "turn-1",
          "sessionId": "s-123",
          "role": "user",
          "text": "Check system status",
          "createdAt": "2026-09-07T01:00:00Z",
          "durationMs": 120
        },
        {
          "id": "turn-2",
          "sessionId": "s-123",
          "role": "agent",
          "text": "All systems nominal.",
          "createdAt": "2026-09-07T01:00:02Z",
          "durationMs": 1850
        }
      ]
    }
    """
    let detail = try JSONDecoder().decode(ApiThreadDetailResponse.self, from: json.data(using: .utf8)!)
    #expect(detail.turns.count == 2)
    #expect(detail.turns[0].role == "user")
    #expect(detail.turns[0].durationMs == 120)
    #expect(detail.turns[1].role == "agent")
    #expect(detail.turns[1].durationMs == 1850)
}

@Test("ApiMessageResult and ApiControlResult decode cleanly")
func messageAndControlResultDecoding() throws {
    let msgJson = """
    {
      "reply": "Orchestrating workflow...",
      "phase": "running",
      "sessionId": "sess-abc"
    }
    """
    let msgResult = try JSONDecoder().decode(ApiMessageResult.self, from: msgJson.data(using: .utf8)!)
    #expect(msgResult.reply == "Orchestrating workflow...")
    #expect(msgResult.phase == "running")
    #expect(msgResult.sessionId == "sess-abc")

    let ctrlJson = """
    {
      "ok": true,
      "phase": "interrupted"
    }
    """
    let ctrlResult = try JSONDecoder().decode(ApiControlResult.self, from: ctrlJson.data(using: .utf8)!)
    #expect(ctrlResult.ok == true)
    #expect(ctrlResult.phase == "interrupted")
}

@Test("ControlAction matches Genesis protocol endpoints")
func controlActionMapping() {
    #expect(ControlAction.interrupt.rawValue == "interrupt")
    #expect(ControlAction.reset.rawValue == "reset")
}

@Test("ApiControlResult decodes failure reasons cleanly")
func controlResultFailureDecoding() throws {
    let failJson = """
    {
      "ok": false,
      "reason": "unsupported"
    }
    """
    let res = try JSONDecoder().decode(ApiControlResult.self, from: failJson.data(using: .utf8)!)
    #expect(res.ok == false)
    #expect(res.reason == "unsupported")
}

@Test("WalkieStore initializes without embedded secrets")
@MainActor
func storeInitWithoutHardcodedSecrets() {
    let store = WalkieStore(defaultSecret: "", defaultToken: "")
    #expect(store.serverUrlString.hasPrefix("http"))
}

@Test("WalkieStore persists secret and token across instances")
@MainActor
func storeSecretAndTokenPersistence() {
    let testSecret = "test-secret-\(UUID().uuidString)"
    let testToken = "test-token-\(UUID().uuidString)"
    let store1 = WalkieStore(defaultSecret: "", defaultToken: "")
    store1.secret = testSecret
    store1.token = testToken
    let store2 = WalkieStore(defaultSecret: "", defaultToken: "")
    #expect(store2.secret == testSecret)
    #expect(store2.token == testToken)
}


