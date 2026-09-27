import SwiftUI

private struct PaletteKey: EnvironmentKey {
    static let defaultValue = WalkiePalette.dark
}

public extension EnvironmentValues {
    var walkie: WalkiePalette {
        get { self[PaletteKey.self] }
        set { self[PaletteKey.self] = newValue }
    }
}

public extension View {
    /// Resolve the palette from the system colour scheme. Apply once at the root.
    func walkieTheme() -> some View { modifier(WalkieThemeResolver()) }
    /// Force a palette — used by previews to show both themes side by side.
    func walkiePalette(_ p: WalkiePalette) -> some View { environment(\.walkie, p) }
}

private struct WalkieThemeResolver: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content.environment(\.walkie, scheme == .dark ? .dark : .light)
    }
}

/// The one rule that survives both themes: a bodiless lattice at dock scale is
/// dust, so below ~88pt the orb keeps a body and drops the weather.
public enum WalkieOrbSize: Sendable {
    case dock, inline, hero

    public var points: Int { 260 }
    public var radius: Double {
        switch self {
        case .dock: 0.66
        case .inline: 0.46
        case .hero: 0.26
        }
    }
    public var forcesBody: Bool { self == .dock }
    public var showsWeather: Bool { self != .dock }
}
