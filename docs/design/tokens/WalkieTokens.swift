// walkie · design tokens
// Generated from apps/walkie/designs/walkie.pen — do not hand-edit.
// Regenerate by re-exporting from the canvas; the .pen file is the source of truth.

import SwiftUI

public enum WalkieColor {
    static func dyn(_ light: (Double,Double,Double,Double), _ dark: (Double,Double,Double,Double)) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark
            ? UIColor(red: dark.0, green: dark.1, blue: dark.2, alpha: dark.3)
            : UIColor(red: light.0, green: light.1, blue: light.2, alpha: light.3) })
    }

    /// light #F3F4F6 · dark #060810
    public static let bg = dyn((0.9529, 0.9569, 0.9647, 1.0), (0.0235, 0.0314, 0.0627, 1.0))
    /// light #FFFFFF · dark #0F121C
    public static let surface = dyn((1.0, 1.0, 1.0, 1.0), (0.0588, 0.0706, 0.1098, 1.0))
    /// light #F3F4F6 · dark #0B0E17
    public static let surfaceQuiet = dyn((0.9529, 0.9569, 0.9647, 1.0), (0.0431, 0.0549, 0.0902, 1.0))
    /// light #0C101A · dark #F2F3F6
    public static let textPrimary = dyn((0.0471, 0.0627, 0.102, 1.0), (0.949, 0.9529, 0.9647, 1.0))
    /// light #3D424D · dark #A1A5AC
    public static let textSecondary = dyn((0.2392, 0.2588, 0.302, 1.0), (0.6314, 0.6471, 0.6745, 1.0))
    /// light #5F636C · dark #7D8088
    public static let textMuted = dyn((0.3725, 0.3882, 0.4235, 1.0), (0.4902, 0.502, 0.5333, 1.0))
    /// light #18213512 · dark #F2F3F61A
    public static let edge = dyn((0.0941, 0.1294, 0.2078, 0.0706), (0.949, 0.9529, 0.9647, 0.102))
    /// light #18213529 · dark #F2F3F62E
    public static let edgeVisible = dyn((0.0941, 0.1294, 0.2078, 0.1608), (0.949, 0.9529, 0.9647, 0.1804))
    /// light #5480C7 · dark #5480C7
    public static let blue = dyn((0.3294, 0.502, 0.7804, 1.0), (0.3294, 0.502, 0.7804, 1.0))
    /// light #009BD8 · dark #009BD8
    public static let tidepool = dyn((0.0, 0.6078, 0.8471, 1.0), (0.0, 0.6078, 0.8471, 1.0))
    /// light #D42325 · dark #D42325
    public static let red = dyn((0.8314, 0.1373, 0.1451, 1.0), (0.8314, 0.1373, 0.1451, 1.0))
    /// light #060810 · dark #060810
    public static let onAccent = dyn((0.0235, 0.0314, 0.0627, 1.0), (0.0235, 0.0314, 0.0627, 1.0))
    /// light #FFFFFFB3 · dark #0F121CB3
    public static let glass = dyn((1.0, 1.0, 1.0, 0.702), (0.0588, 0.0706, 0.1098, 0.702))
    /// light #436EB4 · dark #5480C7
    public static let blueText = dyn((0.2627, 0.4314, 0.7059, 1.0), (0.3294, 0.502, 0.7804, 1.0))
    /// light #3783F0 · dark #3783F0
    public static let glowBlue = dyn((0.2157, 0.5137, 0.9412, 1.0), (0.2157, 0.5137, 0.9412, 1.0))
    /// light #09B7DC · dark #09B7DC
    public static let glowCyan = dyn((0.0353, 0.7176, 0.8627, 1.0), (0.0353, 0.7176, 0.8627, 1.0))
    /// light #A1D1F4 · dark #A1D1F4
    public static let glowIce = dyn((0.6314, 0.8196, 0.9569, 1.0), (0.6314, 0.8196, 0.9569, 1.0))
    /// light #95989F · dark #7D8088
    public static let textFaint = dyn((0.5843, 0.5961, 0.6235, 1.0), (0.4902, 0.502, 0.5333, 1.0))
    /// light #FFFFFF99 · dark #F2F3F61A
    public static let hairline = dyn((1.0, 1.0, 1.0, 0.6), (0.949, 0.9529, 0.9647, 0.102))
    /// light #1821350F · dark #00000059
    public static let shContact = dyn((0.0941, 0.1294, 0.2078, 0.0588), (0.0, 0.0, 0.0, 0.349))
    /// light #18213514 · dark #00000066
    public static let shLift = dyn((0.0941, 0.1294, 0.2078, 0.0784), (0.0, 0.0, 0.0, 0.4))
    /// light #1821351F · dark #00000073
    public static let shChrome = dyn((0.0941, 0.1294, 0.2078, 0.1216), (0.0, 0.0, 0.0, 0.451))
    /// light #00A24F · dark #16B364
    public static let green = dyn((0.0, 0.6353, 0.3098, 1.0), (0.0863, 0.702, 0.3922, 1.0))
    /// light #AF7C00 · dark #DCA81C
    public static let amber = dyn((0.6863, 0.4863, 0.0, 1.0), (0.8627, 0.6588, 0.1098, 1.0))
    /// light #5480C717 · dark #5480C726
    public static let select = dyn((0.3294, 0.502, 0.7804, 0.0902), (0.3294, 0.502, 0.7804, 0.149))
    /// light #18213529 · dark #F2F3F62E
    public static let separator = dyn((0.0941, 0.1294, 0.2078, 0.1608), (0.949, 0.9529, 0.9647, 0.1804))
    /// light #FBFCFD · dark #0C101A
    public static let orbSphere = dyn((0.9843, 0.9882, 0.9922, 1.0), (0.0471, 0.0627, 0.102, 1.0))
    /// light #2A3140 · dark #F2F3F6
    public static let orbInk = dyn((0.1647, 0.1922, 0.251, 1.0), (0.949, 0.9529, 0.9647, 1.0))
    /// light #436EB4 · dark #A1D1F4
    public static let orbAgent = dyn((0.2627, 0.4314, 0.7059, 1.0), (0.6314, 0.8196, 0.9569, 1.0))
}

public enum WalkieOrb {
    /// 0 = bodiless constellation (light), 1 = filled luminous sphere (dark).
    /// Below 88pt the orb keeps a body in BOTH themes — see WalkieOrbSize.
    public static var orbBody: Double { UITraitCollection.current.userInterfaceStyle == .dark ? 1.0 : 0.0 }
    public static var orbShade: Double { UITraitCollection.current.userInterfaceStyle == .dark ? 0.0 : 1.0 }
}

public enum WalkieOrbSize {
    /// The one rule that survives both themes: a bodiless lattice at dock scale is dust.
    case dock, inline, hero
    public var points: Int { 260 }
    public var radius: Double { switch self { case .dock: 0.66; case .inline: 0.46; case .hero: 0.26 } }
    public var forcesBody: Bool { self == .dock }
    public var showsWeather: Bool { self != .dock }
}

public enum WalkieRadius {
    public static let card: CGFloat = 12
    public static let input: CGFloat = 6
    public static let group: CGFloat = 20
    public static let pill: CGFloat = 9999
}

public enum WalkieSpacing {
    public static let s1: CGFloat = 4
    public static let s2: CGFloat = 8
    public static let s3: CGFloat = 12
    public static let s4: CGFloat = 16
    public static let s5: CGFloat = 20
    public static let s6: CGFloat = 24
    public static let s8: CGFloat = 32
}
