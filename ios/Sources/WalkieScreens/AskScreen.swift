import SwiftUI
import WalkieDesign
import WalkieModel

public struct AskScreen: View {
    @Bindable var store: WalkieStore
    @Environment(\.walkie) private var t
    @Environment(\.dismiss) private var dismiss

    let ask: ApiAsk
    @State private var selectedOption: String?
    @State private var isAnswered: Bool = false
    @State private var answeredSelection: String = ""

    public init(store: WalkieStore, ask: ApiAsk) {
        self.store = store
        self.ask = ask
        if let first = ask.options?.first?.label {
            _selectedOption = State(initialValue: first)
        }
    }

    private var options: [ApiAskOption] {
        if let opts = ask.options, !opts.isEmpty {
            return opts
        }
        return [
            ApiAskOption(label: "Approve", description: "Proceed with the proposed change immediately."),
            ApiAskOption(label: "Hold", description: "Keep the work on pause until you review on screen.")
        ]
    }

    public var body: some View {
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                #if os(macOS)
                // 1. Status Bar
                StatusBar()
                #endif

                // 2. Breadcrumb Header
                crumbHeader

                // 3. Scrollable Question Content
                ScrollView {
                    VStack(alignment: .leading, spacing: WalkieSpace.s5) {
                        // Title
                        Text(ask.question)
                            .font(.system(size: 26, weight: .bold))
                            .foregroundStyle(t.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 8)

                        // Subtitle context
                        Text("Everything else is decided. Either answer is one commit to undo, so this one can be said out loud.")
                            .font(WalkieText.body)
                            .foregroundStyle(t.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)

                        if isAnswered {
                            answeredBox
                        } else {
                            // Section: Choose one
                            VStack(alignment: .leading, spacing: WalkieSpace.s2) {
                                Text("Choose one")
                                    .font(WalkieText.label)
                                    .foregroundStyle(t.textMuted)
                                    .padding(.horizontal, WalkieSpace.s4)

                                VStack(spacing: 0) {
                                    ForEach(Array(options.enumerated()), id: \.element.id) { index, opt in
                                        if index > 0 {
                                            RowSeparator()
                                        }
                                        OptionLine(
                                            title: opt.label,
                                            description: opt.description,
                                            badge: index == 0 ? "safest" : nil,
                                            isSelected: selectedOption == opt.label,
                                            action: {
                                                selectedOption = opt.label
                                            }
                                        )
                                    }
                                }
                                .background(t.surface)
                                .clipShape(RoundedRectangle(cornerRadius: WalkieRadius.group))
                                .overlay(
                                    RoundedRectangle(cornerRadius: WalkieRadius.group)
                                        .stroke(t.edge, lineWidth: 1)
                                )
                            }

                            // Explainer footnote
                            Text("Say \"one\", \"two\", or the name. These are the options the agent passed to AskUserQuestion — walkie is reading them back, not inventing them.")
                                .font(.system(size: 13))
                                .foregroundStyle(t.textFaint)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.top, 4)
                        }

                        Spacer()
                            .frame(height: 100)
                    }
                    .padding(.horizontal, WalkieSpace.s4)
                }
            }

            // 4. Bottom Dock Bar
            if !isAnswered {
                DockBar(
                    title: selectedOption != nil ? "Tap to answer: \(selectedOption!)" : "Hold to answer",
                    subtitle: "\(ask.header ?? "agent") is listening",
                    volume: store.inFlightAskIds.contains(ask.id) ? 0.9 : 0.25,
                    onTap: {
                        submitAnswer()
                    },
                    onHold: {
                        submitAnswer()
                    }
                )
            }
        }
        .background(t.bg.ignoresSafeArea())
    }

    private var crumbHeader: some View {
        VStack(spacing: 0) {
            Button {
                store.selectedAsk = nil
                dismiss()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                    Text("\(ask.header ?? "agent") · walkie · just now")
                        .font(WalkieText.meta)
                    Spacer()
                }
                .foregroundStyle(t.textMuted)
                .padding(.horizontal, WalkieSpace.s5)
                .padding(.vertical, 10)
            }
            .buttonStyle(.plain)

            // Accent indicator bar
            HStack {
                Rectangle()
                    .fill(t.tidepool)
                    .frame(width: 44, height: 2)
                Spacer()
            }
            .padding(.horizontal, WalkieSpace.s5)
        }
    }

    private var answeredBox: some View {
        VStack(alignment: .leading, spacing: WalkieSpace.s3) {
            HStack {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(t.green)
                    .font(.title3)

                Text("Answered: \(answeredSelection)")
                    .font(.headline)
                    .foregroundStyle(t.textPrimary)

                Spacer()

                Button("Done") {
                    store.selectedAsk = nil
                    dismiss()
                }
                .font(.subheadline.bold())
                .foregroundStyle(t.blueText)
            }

            Text("The response was delivered to Genesis. The agent has resumed its plan.")
                .font(WalkieText.meta)
                .foregroundStyle(t.textMuted)
        }
        .padding(WalkieSpace.s4)
        .background(t.surface)
        .clipShape(RoundedRectangle(cornerRadius: WalkieRadius.group))
        .overlay(
            RoundedRectangle(cornerRadius: WalkieRadius.group)
                .stroke(t.green.opacity(0.3), lineWidth: 1)
        )
    }

    private func submitAnswer() {
        guard let opt = selectedOption, !store.inFlightAskIds.contains(ask.id) else { return }
        answeredSelection = opt
        Task {
            await store.answer(ask: ask, option: opt)
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                isAnswered = true
            }
        }
    }
}
