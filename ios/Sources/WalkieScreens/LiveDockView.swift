import SwiftUI
import WalkieDesign
import WalkieModel

public struct LiveDockView: View {
    @Bindable var store: WalkieStore
    @Environment(\.walkie) private var t
    @State private var showingSettings = false
    @State private var showingCatalog = false

    public init(store: WalkieStore) {
        self.store = store
    }

    public var body: some View {
        VStack(spacing: 0) {
            // Live Status Bar
            statusBar
                .padding(.horizontal, WalkieSpace.s4)
                .padding(.vertical, WalkieSpace.s3)
                .background(t.surface.opacity(0.85))
                .overlay(
                    Rectangle()
                        .fill(t.separator)
                        .frame(height: 1),
                    alignment: .bottom
                )

            // Scrollable Content
            ScrollView {
                VStack(spacing: WalkieSpace.s5) {
                    if store.isOffline {
                        offlineBanner
                    }

                    if !store.asks.isEmpty {
                        asksSection
                    } else if !store.isOffline {
                        emptyState
                    }

                    // Context Section (Always below the asks)
                    contextSection
                }
                .padding(WalkieSpace.s4)
            }
            .refreshable {
                await store.refreshAll()
            }
        }
        .background(t.bg.ignoresSafeArea())
        .sheet(isPresented: $showingSettings) {
            NavigationStack {
                LiveSettingsView(store: store)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { showingSettings = false }
                        }
                    }
            }
        }
        .sheet(isPresented: $showingCatalog) {
            NavigationStack {
                CatalogPickerView()
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Close") { showingCatalog = false }
                        }
                    }
            }
        }
        .onAppear {
            store.startPolling()
        }
        .onDisappear {
            store.stopPolling()
        }
    }

    // MARK: - Status Bar
    private var statusBar: some View {
        HStack(spacing: WalkieSpace.s3) {
            OrbView(.dock, diameter: 24, volume: store.isWorking ? 0.85 : 0.15)

            Text(store.statusText)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(store.statusKind == .ok ? t.textPrimary : t.amber)
                .lineLimit(1)

            Spacer()

            Button {
                showingCatalog = true
            } label: {
                Image(systemName: "square.grid.2x2")
                    .font(.subheadline)
                    .foregroundStyle(t.textSecondary)
            }
            .accessibilityLabel("Catalog")

            Button {
                showingSettings = true
            } label: {
                Image(systemName: "gearshape")
                    .font(.subheadline)
                    .foregroundStyle(t.textSecondary)
            }
            .accessibilityLabel("Settings")
        }
    }

    // MARK: - Offline Banner
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

    // MARK: - Asks Section
    private var asksSection: some View {
        VStack(spacing: WalkieSpace.s4) {
            ForEach(store.asks) { ask in
                askCard(ask)
            }
        }
    }

    private func askCard(_ ask: ApiAsk) -> some View {
        VStack(alignment: .leading, spacing: WalkieSpace.s3) {
            if let header = ask.header, !header.isEmpty {
                Text(header)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(t.blueText)
                    .textCase(.uppercase)
            }

            Text(ask.question)
                .font(.headline)
                .foregroundStyle(t.textPrimary)
                .fixedSize(horizontal: false, vertical: true)

            if let options = ask.options, !options.isEmpty {
                VStack(spacing: WalkieSpace.s2) {
                    ForEach(options) { opt in
                        Button {
                            Task {
                                await store.answer(ask: ask, option: opt.label)
                            }
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(opt.label)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(t.textPrimary)
                                    if let desc = opt.description, !desc.isEmpty {
                                        Text(desc)
                                            .font(.caption)
                                            .foregroundStyle(t.textSecondary)
                                    }
                                }
                                Spacer()
                                if store.isAnsweringId == ask.id {
                                    ProgressView()
                                        .controlSize(.small)
                                } else {
                                    Image(systemName: "arrow.right")
                                        .font(.caption.bold())
                                        .foregroundStyle(t.textMuted)
                                }
                            }
                            .padding(.horizontal, WalkieSpace.s4)
                            .padding(.vertical, WalkieSpace.s3)
                            .background(t.surfaceQuiet)
                            .clipShape(RoundedRectangle(cornerRadius: WalkieRadius.input))
                            .overlay(
                                RoundedRectangle(cornerRadius: WalkieRadius.input)
                                    .stroke(t.edgeVisible, lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(store.isAnsweringId == ask.id)
                    }
                }
                .padding(.top, WalkieSpace.s2)
            }
        }
        .padding(WalkieSpace.s4)
        .background(t.surface)
        .clipShape(RoundedRectangle(cornerRadius: WalkieRadius.group))
        .overlay(
            RoundedRectangle(cornerRadius: WalkieRadius.group)
                .stroke(t.edgeVisible, lineWidth: 1)
        )
        .shadow(color: t.shLift, radius: 8, y: 4)
    }

    // MARK: - Empty State
    private var emptyState: some View {
        VStack(spacing: WalkieSpace.s3) {
            OrbView(.inline, diameter: 80, volume: store.isWorking ? 0.75 : 0.1)
                .padding(.top, WalkieSpace.s4)

            Text("All quiet")
                .font(.headline)
                .foregroundStyle(t.textPrimary)

            Text("No pending decisions waiting on you.\nYour agents will ping you here when they need input.")
                .font(.subheadline)
                .foregroundStyle(t.textMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, WalkieSpace.s4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, WalkieSpace.s6)
    }

    // MARK: - Context Section
    private var contextSection: some View {
        VStack(alignment: .leading, spacing: WalkieSpace.s3) {
            Text("SITUATION & RUNNING AGENTS")
                .font(.caption.bold())
                .foregroundStyle(t.textMuted)
                .padding(.horizontal, WalkieSpace.s1)

            if !store.threads.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(store.threads.prefix(5))) { thread in
                        threadRow(thread)
                        if thread.id != store.threads.prefix(5).last?.id {
                            Divider().background(t.separator)
                        }
                    }
                }
                .background(t.surface)
                .clipShape(RoundedRectangle(cornerRadius: WalkieRadius.card))
                .overlay(
                    RoundedRectangle(cornerRadius: WalkieRadius.card)
                        .stroke(t.edge, lineWidth: 1)
                )
            } else {
                Text("No active sessions recorded.")
                    .font(.caption)
                    .foregroundStyle(t.textMuted)
                    .padding(WalkieSpace.s3)
            }

            if !store.workspaces.isEmpty {
                Text("WORKSPACES")
                    .font(.caption.bold())
                    .foregroundStyle(t.textMuted)
                    .padding(.horizontal, WalkieSpace.s1)
                    .padding(.top, WalkieSpace.s2)

                VStack(spacing: 0) {
                    ForEach(store.workspaces) { ws in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ws.name)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(t.textPrimary)
                                Text(ws.rootPath)
                                    .font(.caption)
                                    .foregroundStyle(t.textSecondary)
                                    .lineLimit(1)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, WalkieSpace.s3)
                        .padding(.vertical, WalkieSpace.s2)

                        if ws.id != store.workspaces.last?.id {
                            Divider().background(t.separator)
                        }
                    }
                }
                .background(t.surface)
                .clipShape(RoundedRectangle(cornerRadius: WalkieRadius.card))
                .overlay(
                    RoundedRectangle(cornerRadius: WalkieRadius.card)
                        .stroke(t.edge, lineWidth: 1)
                )
            }
        }
    }

    private func threadRow(_ thread: ApiThread) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(thread.title ?? thread.threadId)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(t.textPrimary)
                    .lineLimit(1)

                Spacer()

                phaseBadge(thread.phase)
            }

            if let last = thread.lastText, !last.isEmpty {
                Text(last)
                    .font(.caption)
                    .foregroundStyle(t.textSecondary)
                    .lineLimit(2)
            }
        }
        .padding(.horizontal, WalkieSpace.s3)
        .padding(.vertical, WalkieSpace.s3)
    }

    private func phaseBadge(_ phase: String) -> some View {
        let (color, label) = switch phase {
        case "running": (t.green, "running")
        case "awaiting": (t.amber, "needs you")
        case "blocked": (Color.red, "stuck")
        case "done": (t.textMuted, "done")
        default: (t.textFaint, phase)
        }

        return Text(label)
            .font(.caption2.bold())
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

// MARK: - Live Settings Sheet
public struct LiveSettingsView: View {
    @Bindable var store: WalkieStore
    @Environment(\.walkie) private var t
    @State private var serverUrl: String = ""
    @State private var secret: String = ""
    @State private var token: String = ""

    public init(store: WalkieStore) {
        self.store = store
    }

    public var body: some View {
        Form {
            Section("Genesis Server") {
                TextField("Server URL", text: $serverUrl)
                    .autocorrectionDisabled()
                    #if !os(macOS)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    #endif

                SecureField("Walkie Secret", text: $secret)
                    .autocorrectionDisabled()
                    #if !os(macOS)
                    .textInputAutocapitalization(.never)
                    #endif

                SecureField("Session Bearer Token", text: $token)
                    .autocorrectionDisabled()
                    #if !os(macOS)
                    .textInputAutocapitalization(.never)
                    #endif

                Button {
                    store.serverUrlString = serverUrl
                    store.secret = secret
                    store.token = token
                    Task {
                        await store.testConnection()
                    }
                } label: {
                    HStack {
                        Text("Test Connection")
                        Spacer()
                        if store.isTestingConnection {
                            ProgressView()
                                .controlSize(.small)
                        } else if let ms = store.lastPingLatencyMs {
                            Text(String(format: "%.0f ms", ms))
                                .font(.caption)
                                .foregroundStyle(t.green)
                        }
                    }
                }
            }

            Section("About") {
                HStack {
                    Text("Architecture")
                    Spacer()
                    Text("SwiftUI + Tailscale")
                        .foregroundStyle(t.textSecondary)
                }
                HStack {
                    Text("Backend Status")
                    Spacer()
                    Text(store.isOffline ? "Offline" : "Online")
                        .foregroundStyle(store.isOffline ? t.amber : t.green)
                }
            }
        }
        .navigationTitle("Settings")
        .onAppear {
            serverUrl = store.serverUrlString
            secret = store.secret
            token = store.token
        }
    }
}

// MARK: - Catalog Picker Sheet (For visual design reviews)
public struct CatalogPickerView: View {
    @State private var selected: WalkieCatalog = .welcome
    @Environment(\.walkie) private var t

    public init() {}

    public var body: some View {
        VStack {
            Picker("Select Screen", selection: $selected) {
                ForEach(WalkieCatalog.allCases) { item in
                    Text(item.slug).tag(item)
                }
            }
            .pickerStyle(.menu)
            .padding()

            ZStack {
                selected.screen
                    .walkiePalette(t)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .navigationTitle("Design Catalog")
    }
}
