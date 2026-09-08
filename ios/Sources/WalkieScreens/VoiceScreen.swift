import SwiftUI
import WalkieDesign
import WalkieModel

public struct VoiceScreen: View {
    @Bindable var store: WalkieStore
    @Environment(\.walkie) private var t
    @Environment(\.dismiss) private var dismiss

    @State private var isTalking: Bool = false
    @State private var volume: Double = 0.35

    public init(store: WalkieStore) {
        self.store = store
    }

    public var body: some View {
        VStack(spacing: 0) {
            #if os(macOS)
            // 1. Status Bar
            StatusBar()
            #endif

            // 2. Address Bar
            AddressBar(
                scope: store.activeScope,
                meta: store.isWorking ? "running · live" : "listening",
                dotColor: store.activeScope == "everything" ? nil : t.tidepool
            ) {
                store.isShowingSwitcher = true
            }

            Spacer()

            // 3. Hero Orb with Glowing Aura
            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [t.glowBlue.opacity(0.25), Color.clear],
                            center: .center,
                            startRadius: 20,
                            endRadius: 140
                        )
                    )
                    .frame(width: 280, height: 280)
                    .blur(radius: 20)

                OrbView(.hero, diameter: 168, volume: volume)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(t.edgeVisible, lineWidth: 1))
            }
            .contentShape(Circle())
            .onTapGesture {
                toggleTalking()
            }

            Spacer()

            // 4. Voice Altitude Status & Actions
            VStack(spacing: WalkieSpace.s4) {
                Text(isTalking ? "Walkie listening…" : "Talking to \(store.activeScope)")
                    .font(.system(size: 24, weight: .medium))
                    .foregroundStyle(t.textPrimary)

                Text(explanationText)
                    .font(WalkieText.body)
                    .foregroundStyle(t.textSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 28)

                // Action buttons
                HStack(spacing: 16) {
                    PillButton("Show thread", primary: false) {
                        dismiss()
                        if let first = store.filteredThreads.first {
                            store.selectedThread = first
                        }
                    }

                    PillButton("Interrupt", primary: false) {
                        isTalking = false
                        volume = 0.15
                        if let threadId = store.selectedThread?.threadId ?? store.filteredThreads.first?.threadId {
                            Task {
                                try? await store.interrupt(threadId: threadId)
                            }
                        }
                    }
                }
                .padding(.top, 8)

                // Footnote
                Footnote("session altitude · the chip is the only thing that changed")
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)
            }
            .padding(.bottom, WalkieSpace.s6)

            // 5. Dismiss button at bottom
            Button {
                store.isShowingVoice = false
                dismiss()
            } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(t.textMuted)
                    .padding(12)
            }
            .padding(.bottom, WalkieSpace.s2)
        }
        .background(t.bg.ignoresSafeArea())
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 150_000_000)
                if isTalking {
                    volume = Double.random(in: 0.55...0.95)
                } else if store.isWorking {
                    volume = Double.random(in: 0.40...0.75)
                } else {
                    volume = Double.random(in: 0.10...0.25)
                }
            }
        }
    }

    private var explanationText: String {
        if store.activeScope == "everything" {
            return "Everything you say is routed to the orchestrator. Judgement across sessions."
        }
        return "Only this session hears you. The orchestrator is not in the room and will not see this turn unless you put it there."
    }

    private func toggleTalking() {
        isTalking.toggle()
        volume = isTalking ? 0.85 : 0.25
    }
}
