import SwiftUI
import WalkieDesign
import WalkieModel

public struct SwitcherSheet: View {
    @Bindable var store: WalkieStore
    @Environment(\.walkie) private var t
    @Environment(\.dismiss) private var dismiss

    public init(store: WalkieStore) {
        self.store = store
    }

    public var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Button {
                    store.isShowingSwitcher = false
                    dismiss()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 14, weight: .semibold))
                        Text("who are you talking to")
                            .font(WalkieText.meta)
                    }
                    .foregroundStyle(t.textMuted)
                }
                .buttonStyle(.plain)

                Spacer()

                Button("Done") {
                    store.isShowingSwitcher = false
                    dismiss()
                }
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(t.blueText)
            }
            .padding(.horizontal, WalkieSpace.s5)
            .padding(.vertical, 14)

            ScrollView {
                VStack(alignment: .leading, spacing: WalkieSpace.s5) {
                    // 1. Across everything
                    SectionGroup("Across everything") {
                        scopeRow(
                            title: "everything",
                            description: "Answered from the store, under two seconds, whatever else is busy.",
                            dotColor: nil
                        )
                        RowSeparator()
                        scopeRow(
                            title: "orchestrator",
                            description: "Judgement across sessions. Slower on purpose — it reads before it answers.",
                            dotColor: nil
                        )
                    }

                    // 2. One session, directly
                    SectionGroup("One session, directly") {
                        if sessionItems.isEmpty {
                            HStack {
                                Text("No active sessions connected")
                                    .font(WalkieText.meta)
                                    .foregroundStyle(t.textFaint)
                                Spacer()
                            }
                            .padding(.horizontal, WalkieSpace.s4)
                            .padding(.vertical, 14)
                        } else {
                            ForEach(Array(sessionItems.enumerated()), id: \.element.name) { index, item in
                                if index > 0 {
                                    RowSeparator()
                                }
                                scopeRow(
                                    title: item.name,
                                    description: item.status,
                                    dotColor: item.isRunning ? t.glowBlue : t.textFaint
                                )
                            }
                        }
                    }

                    // 3. System & Inspection
                    SectionGroup("System") {
                        NavRow(icon: "gearshape", title: "Connection & Settings", meta: store.serverUrlString, chevron: true)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                store.isShowingSettings = true
                            }
                        RowSeparator()
                        NavRow(icon: "square.grid.2x2", title: "Design Catalog Inspector", meta: "16 screens exported", chevron: true)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                store.isShowingCatalog = true
                            }
                    }

                    // Footnote
                    Footnote("What you pick changes what the orb reaches and which tools the call carries — it is one session.update, not a new call.")
                        .padding(.horizontal, WalkieSpace.s2)
                        .padding(.bottom, 24)
                }
                .padding(.horizontal, WalkieSpace.s4)
            }
        }
        .background(t.bg.ignoresSafeArea())
    }

    private struct SessionItem {
        let name: String
        let status: String
        let isRunning: Bool
    }

    private var sessionItems: [SessionItem] {
        var items: [SessionItem] = []
        var seen = Set<String>()

        for thread in store.threads {
            let name = thread.workspaceName ?? thread.threadId
            guard !seen.contains(name) else { continue }
            seen.insert(name)
            let isRunning = thread.phase == "running" || thread.phase == "awaiting"
            let status = isRunning ? "running · live" : "idle"
            items.append(SessionItem(name: name, status: status, isRunning: isRunning))
        }

        for ws in store.workspaces {
            guard !seen.contains(ws.name) else { continue }
            seen.insert(ws.name)
            items.append(SessionItem(name: ws.name, status: "workspace", isRunning: false))
        }

        return items
    }

    private func scopeRow(title: String, description: String, dotColor: Color?) -> some View {
        Button {
            store.activeScope = title
            store.isShowingSwitcher = false
            dismiss()
        } label: {
            HStack(alignment: .top, spacing: 14) {
                if let dotColor {
                    Circle()
                        .fill(dotColor)
                        .frame(width: 8, height: 8)
                        .padding(.top, 6)
                } else {
                    Circle()
                        .fill(t.surface)
                        .frame(width: 8, height: 8)
                        .padding(.top, 6)
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(t.textPrimary)

                    Text(description)
                        .font(.system(size: 13))
                        .foregroundStyle(t.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 8)

                if store.activeScope.lowercased() == title.lowercased() {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(t.blueText)
                }
            }
            .padding(.horizontal, WalkieSpace.s4)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
