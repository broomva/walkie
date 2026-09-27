import SwiftUI
import WalkieDesign
import WalkieModel

public struct HomeScreen: View {
    @Bindable var store: WalkieStore
    @Environment(\.walkie) private var t

    public init(store: WalkieStore) {
        self.store = store
    }

    private var runningThreads: [ApiThread] {
        store.filteredThreads.filter { $0.phase == "running" || $0.phase == "awaiting" }
    }

    private var standingThreads: [ApiThread] {
        store.filteredThreads.filter { $0.phase == "idle" }
    }

    private var doneThreads: [ApiThread] {
        store.filteredThreads.filter { $0.phase == "done" || $0.phase == "blocked" }
    }

    public var body: some View {
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                #if os(macOS)
                // 1. Status Bar (macOS desktop window chrome)
                StatusBar()
                #endif

                // 2. Address Bar
                AddressBar(
                    scope: store.activeScope,
                    meta: addressMeta,
                    dotColor: store.activeScope == "everything" ? nil : t.tidepool
                ) {
                    store.isShowingSwitcher = true
                }

                // 3. Scrollable Content
                ScrollView {
                    VStack(spacing: WalkieSpace.s5) {
                        if store.isOffline {
                            offlineBanner
                        }

                        // Needs you Section (Active Asks)
                        if !store.filteredAsks.isEmpty {
                            needsYouSection
                        }

                        // Running now Section
                        if !runningThreads.isEmpty {
                            runningNowSection
                        }

                        // Standing Section
                        if !standingThreads.isEmpty {
                            standingSection
                        }

                        // Done today Section
                        if !doneThreads.isEmpty {
                            doneSection
                        } else if store.filteredAsks.isEmpty && runningThreads.isEmpty && standingThreads.isEmpty {
                            quietSection
                        }

                        // Bottom breathing room for floating Dock
                        Spacer()
                            .frame(height: 80)
                    }
                    .padding(.horizontal, WalkieSpace.s4)
                    .padding(.top, WalkieSpace.s1)
                }
                .refreshable {
                    await store.refreshAll()
                }
            }

            // 4. Floating Bottom Dock Bar
            DockBar(
                title: dockTitle,
                subtitle: "Hold anywhere to talk",
                volume: store.isWorking ? 0.85 : 0.15,
                onTap: {
                    store.isShowingVoice = true
                },
                onHold: {
                    store.isShowingVoice = true
                }
            )
        }
        .background(t.bg.ignoresSafeArea())
        .onAppear {
            store.startPolling()
        }
    }

    // MARK: - Subviews & Sections

    private var addressMeta: String {
        let sc = store.filteredThreads.count
        let sLabel = "\(sc) session\(sc == 1 ? "" : "s")"
        let ac = store.filteredAsks.count
        let aLabel = ac == 0 ? "nothing waiting" : "\(ac) ask\(ac == 1 ? "" : "s")"
        return "\(sLabel) · \(aLabel)"
    }

    private var dockTitle: String {
        if !store.filteredAsks.isEmpty {
            let count = store.filteredAsks.count
            return "\(count) ask\(count == 1 ? "" : "s") waiting on you"
        }
        if runningThreads.isEmpty {
            return "Nothing needs you"
        }
        let count = runningThreads.count
        return "\(count) session\(count == 1 ? "" : "s") live"
    }

    private var offlineBanner: some View {
        HStack(spacing: WalkieSpace.s3) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(t.amber)

            VStack(alignment: .leading, spacing: 2) {
                Text("Host Offline")
                    .font(.subheadline.bold())
                    .foregroundStyle(t.textPrimary)
                Text("Cannot reach Genesis at \(store.serverUrlString)")
                    .font(.caption)
                    .foregroundStyle(t.textSecondary)
            }
            Spacer()
        }
        .padding(WalkieSpace.s3)
        .background(t.amber.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: WalkieRadius.card))
        .overlay(
            RoundedRectangle(cornerRadius: WalkieRadius.card)
                .stroke(t.amber.opacity(0.3), lineWidth: 1)
        )
    }

    private var needsYouSection: some View {
        HaloCard(label: "Needs you", isAccented: true) {
            ForEach(Array(store.filteredAsks.enumerated()), id: \.element.id) { index, ask in
                if index > 0 {
                    RowSeparator()
                }
                askRow(ask)
            }
        }
    }

    private func askRow(_ ask: ApiAsk) -> some View {
        Button {
            store.selectedAsk = ask
        } label: {
            HStack(spacing: WalkieSpace.s4) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(ask.question)
                        .font(.system(size: 17, weight: .regular))
                        .foregroundStyle(t.textPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    HStack(spacing: 6) {
                        Text(ask.header ?? ask.threadId)
                            .font(.system(size: 13))
                            .foregroundStyle(t.textMuted)
                        Text("·")
                            .foregroundStyle(t.textFaint)
                        Text("action required")
                            .font(.system(size: 13))
                            .foregroundStyle(t.textMuted)
                    }
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 4) {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(t.tidepool)
                            .frame(width: 7, height: 7)
                        Text("Needs you")
                            .font(.system(size: 13))
                            .foregroundStyle(t.textMuted)
                    }

                    Text("Answer")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(t.blueText)
                }
            }
            .padding(.horizontal, WalkieSpace.s4)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var runningNowSection: some View {
        HaloCard(label: "Running now", isAccented: true) {
            ForEach(Array(runningThreads.enumerated()), id: \.element.id) { index, thread in
                if index > 0 {
                    RowSeparator()
                }
                threadRow(thread, stateLabel: "Running", dotColor: t.glowBlue)
            }
        }
    }

    private var standingSection: some View {
        HaloCard(label: "Standing · why they last woke", isAccented: false) {
            ForEach(Array(standingThreads.enumerated()), id: \.element.id) { index, thread in
                if index > 0 {
                    RowSeparator()
                }
                threadRow(thread, stateLabel: "Standing", dotColor: t.textFaint)
            }
        }
    }

    private var doneSection: some View {
        HaloCard(label: "Done today", isAccented: false) {
            ForEach(Array(doneThreads.enumerated()), id: \.element.id) { index, thread in
                if index > 0 {
                    RowSeparator()
                }
                threadRow(thread, stateLabel: "Done", dotColor: t.green)
            }
        }
    }

    private var quietSection: some View {
        VStack(spacing: WalkieSpace.s4) {
            OrbView(.hero, diameter: 120, volume: 0.05)
                .padding(.top, 24)

            Text("All quiet")
                .font(.title3.weight(.medium))
                .foregroundStyle(t.textPrimary)

            Text("No pending decisions waiting on you.\nYour agents will ping you here when they need input.")
                .font(WalkieText.body)
                .foregroundStyle(t.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(.vertical, WalkieSpace.s5)
    }

    private func threadRow(_ thread: ApiThread, stateLabel: String, dotColor: Color) -> some View {
        Button {
            store.selectedThread = thread
        } label: {
            HStack(spacing: WalkieSpace.s4) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(thread.title ?? thread.lastText ?? thread.threadId)
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(t.textPrimary)
                        .lineLimit(1)
                        .multilineTextAlignment(.leading)

                    Text(thread.workspaceName ?? "genesis")
                        .font(.system(size: 13))
                        .foregroundStyle(t.textMuted)
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 4) {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(dotColor)
                            .frame(width: 7, height: 7)
                        Text(stateLabel)
                            .font(.system(size: 13))
                            .foregroundStyle(t.textMuted)
                    }

                    if let last = thread.lastText, !last.isEmpty {
                        Text("receipts")
                            .font(.system(size: 12))
                            .foregroundStyle(t.textFaint)
                    }
                }
            }
            .padding(.horizontal, WalkieSpace.s4)
            .padding(.vertical, 13)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
