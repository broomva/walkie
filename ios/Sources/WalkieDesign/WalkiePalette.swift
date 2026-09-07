// Design tokens — values generated from designs/walkie.pen.
// Regenerate rather than hand-edit; the canvas is the source of truth.

import SwiftUI

public extension Color {
    /// #RRGGBB or #RRGGBBAA.
    init(hex: String) {
        let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        let hasAlpha = s.count == 8
        let r = Double((v >> (hasAlpha ? 24 : 16)) & 0xFF) / 255
        let g = Double((v >> (hasAlpha ? 16 : 8)) & 0xFF) / 255
        let b = Double((v >> (hasAlpha ? 8 : 0)) & 0xFF) / 255
        let a = hasAlpha ? Double(v & 0xFF) / 255 : 1
        self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}

/// One resolved theme. Two instances exist: `.light` and `.dark`.
///
/// Resolved rather than dynamic on purpose — a `Color` cannot read the
/// environment, so the palette is injected and views read it from there. That
/// also makes both themes renderable side by side in a preview.
public struct WalkiePalette: Sendable {
    public let bg, surface, surfaceQuiet: Color
    public let textPrimary, textSecondary, textMuted, textFaint: Color
    public let edge, edgeVisible, separator, glass, hairline: Color
    public let blueText, tidepool, green, amber, select: Color
    public let glowBlue, glowCyan, glowIce: Color
    public let shContact, shLift, shChrome: Color

    /// Orb uniforms that follow the theme. `body` and `shade` are floats fed
    /// straight into the shader; see WalkieOrbSize for the size rule.
    public let orbSphere, orbInk, orbAgent, orbYou: Color
    public let orbBody, orbShade: Double

    public static let light = WalkiePalette(
        bg: Color(hex: "#F3F4F6"), surface: Color(hex: "#FFFFFF"), surfaceQuiet: Color(hex: "#F3F4F6"),
        textPrimary: Color(hex: "#0C101A"), textSecondary: Color(hex: "#3D424D"),
        textMuted: Color(hex: "#5F636C"), textFaint: Color(hex: "#95989F"),
        edge: Color(hex: "#18213512"), edgeVisible: Color(hex: "#18213529"),
        separator: Color(hex: "#18213529"), glass: Color(hex: "#FFFFFFB3"), hairline: Color(hex: "#FFFFFF99"),
        blueText: Color(hex: "#436EB4"), tidepool: Color(hex: "#009BD8"),
        green: Color(hex: "#00A24F"), amber: Color(hex: "#AF7C00"), select: Color(hex: "#5480C717"),
        glowBlue: Color(hex: "#3783F0"), glowCyan: Color(hex: "#09B7DC"), glowIce: Color(hex: "#A1D1F4"),
        shContact: Color(hex: "#1821350F"), shLift: Color(hex: "#18213514"), shChrome: Color(hex: "#1821351F"),
        orbSphere: Color(hex: "#FBFCFD"), orbInk: Color(hex: "#2A3140"),
        orbAgent: Color(hex: "#436EB4"), orbYou: Color(hex: "#3783F0"),
        orbBody: 0, orbShade: 1
    )

    public static let dark = WalkiePalette(
        bg: Color(hex: "#060810"), surface: Color(hex: "#0F121C"), surfaceQuiet: Color(hex: "#0B0E17"),
        textPrimary: Color(hex: "#F2F3F6"), textSecondary: Color(hex: "#A1A5AC"),
        textMuted: Color(hex: "#7D8088"), textFaint: Color(hex: "#7D8088"),
        edge: Color(hex: "#F2F3F61A"), edgeVisible: Color(hex: "#F2F3F62E"),
        separator: Color(hex: "#F2F3F62E"), glass: Color(hex: "#0F121CB3"), hairline: Color(hex: "#F2F3F61A"),
        blueText: Color(hex: "#5480C7"), tidepool: Color(hex: "#009BD8"),
        green: Color(hex: "#16B364"), amber: Color(hex: "#DCA81C"), select: Color(hex: "#5480C726"),
        glowBlue: Color(hex: "#3783F0"), glowCyan: Color(hex: "#09B7DC"), glowIce: Color(hex: "#A1D1F4"),
        shContact: Color(hex: "#00000059"), shLift: Color(hex: "#00000066"), shChrome: Color(hex: "#00000073"),
        orbSphere: Color(hex: "#0C101A"), orbInk: Color(hex: "#F2F3F6"),
        orbAgent: Color(hex: "#A1D1F4"), orbYou: Color(hex: "#3783F0"),
        orbBody: 1, orbShade: 0
    )
}

public enum WalkieRadius {
    public static let input: CGFloat = 6
    public static let card: CGFloat = 12
    public static let group: CGFloat = 20
    public static let pill: CGFloat = 9999
}

public enum WalkieSpace {
    public static let s1: CGFloat = 4, s2: CGFloat = 8, s3: CGFloat = 12
    public static let s4: CGFloat = 16, s5: CGFloat = 20, s6: CGFloat = 24, s8: CGFloat = 32
}

/// The canvas runs 11/13/15/17; the Broomva design system specifies
/// 12/14/16/18/22/24/28. That divergence is UNRESOLVED — see the handoff.
/// These mirror the canvas so the port matches the exports.
public enum WalkieText {
    public static let mono = "JetBrains Mono"
    public static func title(_ size: CGFloat = 24) -> Font { .system(size: size, weight: .regular) }
    public static let body = Font.system(size: 15)
    public static let rowTitle = Font.system(size: 16)
    public static let meta = Font.system(size: 13)
    public static let label = Font.system(size: 12, weight: .medium)
    public static let monoSmall = Font.system(size: 12, design: .monospaced)
    public static let monoTiny = Font.system(size: 11, design: .monospaced)
    public static let key = Font.system(size: 10, design: .monospaced)
}
