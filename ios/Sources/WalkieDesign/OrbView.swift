import SwiftUI

/// The orb, as a CPU-drawn Fibonacci lattice.
///
/// This is the SCAFFOLD renderer. The shipping one is a Metal port of
/// docs/design/shaders/orb.glsl behind a SwiftUI `Shader`, which adds the two
/// voices, the Undertow/Understop weather, and the internal bleed. This view
/// exists so screens compose and preview today, and so the geometry (point
/// count, depth falloff, size rule) is already correct when the shader lands.
///
/// Two bugs are fixed in the GLSL and must not return on the port:
///  - output is PREMULTIPLIED — `vec4(rgb, a)` after an over-composite chain,
///    never `rgb * a` a second time;
///  - dot radius is a FRACTION OF THE SPHERE, never absolute pixels.
public struct OrbView: View {
    @Environment(\.walkie) private var t
    private let size: WalkieOrbSize
    private let diameter: CGFloat
    /// 0…1. Drives dot size and brightness, never geometry — pushing points
    /// outward reads as polka dots and blanked the render during design.
    private let volume: Double

    public init(_ size: WalkieOrbSize = .hero, diameter: CGFloat = 168, volume: Double = 0) {
        self.size = size; self.diameter = diameter; self.volume = volume
    }

    public var body: some View {
        Canvas { ctx, canvas in
            let c = CGPoint(x: canvas.width / 2, y: canvas.height / 2)
            let r = min(canvas.width, canvas.height) / 2 * size.radius * 2
            let n = size.points
            let golden = 2.399963229728653

            if size.forcesBody || t.orbBody > 0.5 {
                ctx.fill(Circle().path(in: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2)),
                         with: .color(t.orbSphere))
            }

            for i in 0..<n {
                let fi = Double(i)
                let y = 1 - 2 * (fi + 0.5) / Double(n)
                let rr = (max(0, 1 - y * y)).squareRoot()
                let th = golden * fi
                let px = cos(th) * rr, pz = sin(th) * rr
                let depth = pz * 0.5 + 0.5
                // Far side recedes: smaller and fainter. Steeper on paper,
                // where the lattice alone has to describe the surface.
                let alpha = (0.05 + 0.95 * pow(depth, 1.5 + 1.1 * t.orbShade)) * (1 + 0.55 * volume)
                let dot = r * 0.030 * (0.30 + 1.10 * depth) * (0.85 + 0.50 * volume)
                let p = CGPoint(x: c.x + px * r, y: c.y + y * r)
                ctx.fill(
                    Circle().path(in: CGRect(x: p.x - dot, y: p.y - dot, width: dot * 2, height: dot * 2)),
                    with: .color(t.orbInk.opacity(min(1, alpha)))
                )
            }
        }
        .frame(width: diameter, height: diameter)
        .accessibilityHidden(true)
    }
}
