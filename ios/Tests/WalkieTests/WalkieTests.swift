import Testing
import SwiftUI
@testable import WalkieDesign
@testable import WalkieModel
@testable import WalkieScreens

@Test("every catalog entry has a matching export slug")
func catalogSlugsAreUnique() {
    let slugs = WalkieCatalog.allCases.map(\.slug)
    #expect(slugs.count == 16)
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
}

@Test("the dock orb keeps a body and drops the weather in both themes")
func orbSizeRule() {
    #expect(WalkieOrbSize.dock.forcesBody)
    #expect(!WalkieOrbSize.dock.showsWeather)
    #expect(!WalkieOrbSize.hero.forcesBody)
    #expect(WalkieOrbSize.hero.showsWeather)
    #expect(WalkieOrbSize.hero.radius < WalkieOrbSize.dock.radius)
}
