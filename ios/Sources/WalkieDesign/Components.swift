import SwiftUI

// The seven pieces every screen in this slice is built from. Match
// docs/design/screens/*.png; change these rather than restyling a screen.

public struct StatusBar: View {
    @Environment(\.walkie) private var t
    public init() {}
    public var body: some View {
        HStack {
            Text("9:41").font(.system(size: 14, weight: .medium)).foregroundStyle(t.textPrimary)
            Spacer()
            HStack(spacing: 6) {
                Image(systemName: "cellularbars")
                Image(systemName: "wifi")
                Image(systemName: "battery.100")
            }
            .font(.system(size: 12)).foregroundStyle(t.textPrimary)
        }
        .padding(.horizontal, WalkieSpace.s6)
        .frame(height: 62)
    }
}

public struct NavBar: View {
    @Environment(\.walkie) private var t
    private let crumb: String
    public init(_ crumb: String) { self.crumb = crumb }
    public var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "chevron.left").font(.system(size: 14))
            Text(crumb).font(WalkieText.meta)
            Spacer()
        }
        .foregroundStyle(t.textMuted)
        .padding(.horizontal, WalkieSpace.s5)
        .padding(.bottom, 10)
    }
}

public struct ScreenTitle: View {
    @Environment(\.walkie) private var t
    private let title: String, subtitle: String?
    public init(_ title: String, _ subtitle: String? = nil) { self.title = title; self.subtitle = subtitle }
    public var body: some View {
        VStack(alignment: .leading, spacing: WalkieSpace.s2) {
            Text(title).font(WalkieText.title()).foregroundStyle(t.textPrimary)
            if let subtitle {
                Text(subtitle).font(WalkieText.body).foregroundStyle(t.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, WalkieSpace.s1)
    }
}

/// A labelled card group. Rows inside are separated by a hairline, never by
/// their own borders.
public struct SectionGroup<Content: View>: View {
    @Environment(\.walkie) private var t
    private let label: String?
    private let content: Content
    public init(_ label: String? = nil, @ViewBuilder content: () -> Content) {
        self.label = label; self.content = content()
    }
    public var body: some View {
        VStack(alignment: .leading, spacing: WalkieSpace.s2) {
            if let label {
                Text(label).font(WalkieText.label).foregroundStyle(t.textMuted)
                    .padding(.horizontal, WalkieSpace.s4)
            }
            VStack(spacing: 0) { content }
                .background(t.surface)
                .clipShape(RoundedRectangle(cornerRadius: WalkieRadius.group))
                .overlay(RoundedRectangle(cornerRadius: WalkieRadius.group).stroke(t.edge, lineWidth: 1))
        }
    }
}

public struct RowSeparator: View {
    @Environment(\.walkie) private var t
    public init() {}
    public var body: some View {
        Rectangle().fill(t.separator).frame(height: 1).padding(.leading, WalkieSpace.s4)
    }
}

public struct NavRow: View {
    @Environment(\.walkie) private var t
    private let icon: String?, title: String, meta: String?, value: String?, mono: Bool, chevron: Bool
    public init(icon: String? = nil, title: String, meta: String? = nil,
                value: String? = nil, mono: Bool = false, chevron: Bool = true) {
        self.icon = icon; self.title = title; self.meta = meta
        self.value = value; self.mono = mono; self.chevron = chevron
    }
    public var body: some View {
        HStack(spacing: WalkieSpace.s3) {
            if let icon { Image(systemName: icon).font(.system(size: 16)).foregroundStyle(t.textFaint).frame(width: 18) }
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(WalkieText.rowTitle).foregroundStyle(t.textPrimary)
                if let meta {
                    Text(meta).font(mono ? WalkieText.monoSmall : WalkieText.meta)
                        .foregroundStyle(t.textMuted).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: WalkieSpace.s2)
            if let value { Text(value).font(WalkieText.monoTiny).foregroundStyle(t.textFaint) }
            if chevron { Image(systemName: "chevron.right").font(.system(size: 13)).foregroundStyle(t.textFaint) }
        }
        .padding(.horizontal, WalkieSpace.s4).padding(.vertical, 13)
    }
}

public struct ToggleRow: View {
    @Environment(\.walkie) private var t
    private let title: String, meta: String?
    @State private var on: Bool
    /// `locked` rows state a rule rather than offer a choice — "nothing
    /// consequential" is fixed at every setting and must not become editable.
    private let locked: Bool
    public init(title: String, meta: String? = nil, on: Bool = false, locked: Bool = false) {
        self.title = title; self.meta = meta; _on = State(initialValue: on); self.locked = locked
    }
    public var body: some View {
        HStack(spacing: WalkieSpace.s3) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(WalkieText.rowTitle).foregroundStyle(t.textPrimary)
                if let meta {
                    Text(meta).font(.system(size: 12)).foregroundStyle(t.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: WalkieSpace.s2)
            Capsule()
                .fill(on ? t.textPrimary : t.edgeVisible)
                .frame(width: 40, height: 24)
                .overlay(alignment: on ? .trailing : .leading) {
                    Circle().fill(on ? t.bg : t.surface).frame(width: 18, height: 18).padding(3)
                }
                .opacity(locked ? 0.5 : 1)
                .onTapGesture { if !locked { on.toggle() } }
        }
        .padding(.horizontal, WalkieSpace.s4).padding(.vertical, 13)
    }
}

public struct PickerRow: View {
    @Environment(\.walkie) private var t
    private let title: String, meta: String?, selected: Bool
    public init(title: String, meta: String? = nil, selected: Bool = false) {
        self.title = title; self.meta = meta; self.selected = selected
    }
    public var body: some View {
        HStack(spacing: WalkieSpace.s3) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(WalkieText.rowTitle).foregroundStyle(t.textPrimary)
                if let meta {
                    Text(meta).font(.system(size: 12)).foregroundStyle(t.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: WalkieSpace.s2)
            if selected { Image(systemName: "checkmark").font(.system(size: 14, weight: .medium)).foregroundStyle(t.blueText) }
        }
        .padding(.horizontal, WalkieSpace.s4).padding(.vertical, 13)
    }
}

public struct KeyValueRow: View {
    @Environment(\.walkie) private var t
    private let key: String, value: String
    private let tint: KeyValueTint
    public enum KeyValueTint: Sendable { case normal, good, warn }
    public init(_ key: String, _ value: String, tint: KeyValueTint = .normal) {
        self.key = key; self.value = value; self.tint = tint
    }
    public var body: some View {
        HStack(alignment: .top, spacing: WalkieSpace.s3) {
            Text(key).font(WalkieText.monoSmall).foregroundStyle(t.textMuted).frame(width: 100, alignment: .leading)
            Text(value).font(WalkieText.monoSmall)
                .foregroundStyle(tint == .good ? t.green : tint == .warn ? t.amber : t.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, WalkieSpace.s4).padding(.vertical, 12)
    }
}

public struct PillButton: View {
    @Environment(\.walkie) private var t
    private let title: String, primary: Bool
    private let action: () -> Void
    public init(_ title: String, primary: Bool = false, action: @escaping () -> Void = {}) {
        self.title = title; self.primary = primary; self.action = action
    }
    public var body: some View {
        Button(action: action) {
            Text(title).font(.system(size: 15, weight: .medium))
                .foregroundStyle(primary ? t.bg : t.textPrimary)
                .padding(.horizontal, WalkieSpace.s5).padding(.vertical, WalkieSpace.s3)
                .background(primary ? t.textPrimary : t.surface, in: Capsule())
                .overlay { if !primary { Capsule().stroke(t.edgeVisible, lineWidth: 1) } }
        }
        .buttonStyle(.plain)
    }
}

/// Footnote under a group. Carries the reason, not decoration — most of these
/// state a rule the screen is obeying.
public struct Footnote: View {
    @Environment(\.walkie) private var t
    private let text: String
    public init(_ text: String) { self.text = text }
    public var body: some View {
        Text(text).font(.system(size: 12)).foregroundStyle(t.textFaint)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Standard screen chrome: status bar, optional nav, scrolling content.
public struct Screen<Content: View>: View {
    @Environment(\.walkie) private var t
    private let crumb: String?
    private let content: Content
    public init(crumb: String? = nil, @ViewBuilder content: () -> Content) {
        self.crumb = crumb; self.content = content()
    }
    public var body: some View {
        VStack(spacing: 0) {
            StatusBar()
            if let crumb { NavBar(crumb) }
            ScrollView {
                VStack(alignment: .leading, spacing: WalkieSpace.s6) { content }
                    .padding(.horizontal, WalkieSpace.s4)
                    .padding(.bottom, WalkieSpace.s6)
            }
        }
        .background(t.bg)
    }
}

/// Centred composition used by the onboarding and voice stages.
public struct StageScreen<Content: View>: View {
    @Environment(\.walkie) private var t
    private let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }
    public var body: some View {
        VStack(spacing: 0) {
            StatusBar()
            ScrollView {
                VStack(spacing: WalkieSpace.s5) { content }
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 28)
                    .padding(.top, 36)
                    .padding(.bottom, WalkieSpace.s6)
            }
        }
        .background(t.bg)
    }
}

public struct StageTitle: View {
    @Environment(\.walkie) private var t
    private let text: String, size: CGFloat
    public init(_ text: String, size: CGFloat = 22) { self.text = text; self.size = size }
    public var body: some View {
        Text(text).font(.system(size: size)).foregroundStyle(t.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

public struct StageBody: View {
    @Environment(\.walkie) private var t
    private let text: String
    public init(_ text: String) { self.text = text }
    public var body: some View {
        Text(text).font(WalkieText.body).foregroundStyle(t.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

public struct StageHint: View {
    @Environment(\.walkie) private var t
    private let text: String, mono: Bool
    public init(_ text: String, mono: Bool = false) { self.text = text; self.mono = mono }
    public var body: some View {
        Text(text).font(mono ? WalkieText.monoSmall : .system(size: 12))
            .foregroundStyle(t.textFaint).fixedSize(horizontal: false, vertical: true)
    }
}
