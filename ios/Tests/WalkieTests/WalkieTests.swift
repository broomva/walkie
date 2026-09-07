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

