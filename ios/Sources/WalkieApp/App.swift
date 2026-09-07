import SwiftUI
import WalkieDesign
import WalkieModel
import WalkieScreens

@main
struct WalkieApp: App {
    @State private var store = WalkieStore.shared
    @State private var isDarkMode = true

    private var palette: WalkiePalette {
        isDarkMode ? .dark : .light
    }

    var body: some Scene {
        WindowGroup {
            rootView
                .walkiePalette(palette)
                .preferredColorScheme(isDarkMode ? .dark : .light)
        }
        #if os(macOS)
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 440, height: 860)
        #endif
    }

    @ViewBuilder
    private var rootView: some View {
        HomeScreen(store: store)
            .sheet(isPresented: $store.isShowingSwitcher) {
                SwitcherSheet(store: store)
                    .walkiePalette(palette)
            }
            .sheet(isPresented: $store.isShowingVoice) {
                VoiceScreen(store: store)
                    .walkiePalette(palette)
            }
            .sheet(item: $store.selectedAsk) { ask in
                AskScreen(store: store, ask: ask)
                    .walkiePalette(palette)
            }
            .sheet(item: $store.selectedThread) { thread in
                ThreadScreen(store: store, thread: thread)
                    .walkiePalette(palette)
            }
            .sheet(isPresented: $store.isShowingSettings) {
                NavigationStack {
                    LiveSettingsView(store: store)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Done") { store.isShowingSettings = false }
                            }
                        }
                }
                .walkiePalette(palette)
            }
            .sheet(isPresented: $store.isShowingCatalog) {
                NavigationStack {
                    CatalogPickerView()
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Close") { store.isShowingCatalog = false }
                            }
                        }
                }
                .walkiePalette(palette)
            }
            .onAppear {
                applyLaunchArguments()
            }
    }

    private func applyLaunchArguments() {
        let args = CommandLine.arguments
        if args.contains("--screen-voice") {
            store.isShowingVoice = true
        } else if args.contains("--screen-switcher") {
            store.isShowingSwitcher = true
        } else if args.contains("--screen-ask") {
            store.selectedAsk = ApiAsk(
                id: "test-ask",
                threadId: "seaslug",
                question: "Which sessions should walkie attach to?",
                header: "seaslug",
                options: [
                    ApiAskOption(label: "Genesis sessions only", description: "Injection is native. Ships in days. Talks to agents you would have to start differently."),
                    ApiAskOption(label: "Attach to sessions you already run", description: "Reaches today's work. Rides the documented inbox socket.")
                ],
                createdAt: "now",
                status: "pending"
            )
        } else if args.contains("--screen-thread") {
            store.selectedThread = ApiThread(
                threadId: "seaslug",
                phase: "running",
                title: "Reading the worktree diff",
                workspaceName: "seaslug"
            )
        }
    }
}
