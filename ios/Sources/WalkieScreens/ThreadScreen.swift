import SwiftUI
import WalkieDesign
import WalkieModel

public struct ThreadScreen: View {
    @Bindable var store: WalkieStore
    @Environment(\.walkie) private var t
    @Environment(\.dismiss) private var dismiss

    let thread: ApiThread
    @State private var messageInput: String = ""
    @State private var turns: [ApiMessageTurn] = []

    public init(store: WalkieStore, thread: ApiThread) {
        self.store = store
        self.thread = thread
        _turns = State(initialValue: Self.initialTurns(for: thread))
    }

    private static func initialTurns(for thread: ApiThread) -> [ApiMessageTurn] {
        let name = thread.workspaceName ?? "genesis"
        return [
            ApiMessageTurn(role: "you", text: "Check status of the active tasks and verify tests.", timestamp: "4m ago"),
            ApiMessageTurn(role: name, text: thread.lastText ?? "Processing worktree diff and running gate suite. All tests passing so far.", timestamp: "3m ago"),
            ApiMessageTurn(role: "tool", text: "bash · pytest -k \"not router\" · 214 passed, 1 skipped", timestamp: "1m ago", meta: "0.4s", isMono: true),
            ApiMessageTurn(role: name, text: "Branch is clean and mutation tests killed all 54 mutants.", timestamp: "just now"),
            ApiMessageTurn(role: "branch", text: "genesis/\(thread.threadId) · 4 files, +112 -38", meta: nil, isMono: true)
        ]
    }

    public var body: some View {
        VStack(spacing: 0) {
            #if os(macOS)
            // 1. Status Bar
            StatusBar()
            #endif

            // 2. Navigation Header
            navHeader

            // 3. Turns Conversation Scroll
            ScrollView {
                VStack(alignment: .leading, spacing: WalkieSpace.s3) {
                    ForEach(turns) { turn in
                        ThreadTurnLine(
                            role: turn.role,
                            meta: turn.meta,
                            text: turn.text,
                            isMono: turn.isMono ?? false
                        )
                    }
                    Spacer().frame(height: 80)
                }
                .padding(.horizontal, WalkieSpace.s4)
                .padding(.top, WalkieSpace.s2)
            }

            // 4. Message Input Dock Bar
            inputDock
        }
        .background(t.bg.ignoresSafeArea())
    }

    private var navHeader: some View {
        HStack(spacing: 12) {
            Button {
                store.selectedThread = nil
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(t.textSecondary)
            }
            .buttonStyle(.plain)

            // Scope Chip
            HStack(spacing: 6) {
                Circle()
                    .fill(t.glowBlue)
                    .frame(width: 7, height: 7)
                Text(thread.workspaceName ?? thread.threadId)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(t.surface)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(t.textPrimary, in: Capsule())

            Spacer()

            Button {
                store.isShowingSettings = true
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(t.textMuted)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, WalkieSpace.s5)
        .padding(.vertical, 10)
    }

    private var inputDock: some View {
        HStack(spacing: 12) {
            TextField("Message \(thread.workspaceName ?? "agent")", text: $messageInput)
                .font(.system(size: 15))
                .foregroundStyle(t.textPrimary)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(t.surface)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(t.edgeVisible, lineWidth: 1))
                .onSubmit {
                    sendMessage()
                }

            Button {
                store.isShowingVoice = true
            } label: {
                OrbView(.dock, diameter: 36, volume: store.isWorking ? 0.8 : 0.2)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(t.edgeVisible, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, WalkieSpace.s4)
        .padding(.vertical, 12)
        .background(t.bg)
    }

    private func sendMessage() {
        guard !messageInput.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let text = messageInput
        messageInput = ""
        turns.append(ApiMessageTurn(role: "you", text: text, timestamp: "just now"))
    }
}
