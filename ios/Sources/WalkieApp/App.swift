import SwiftUI
import WalkieDesign
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
            #if os(macOS)
            macOSView
            #else
            iOSView
            #endif
        }
        #if os(macOS)
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 440, height: 860)
        #endif
    }

    #if os(macOS)
    @ViewBuilder
    private var macOSView: some View {
        VStack(spacing: 0) {
            HStack {
                Text("walkie")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(palette.textPrimary)

                Spacer()

                Button {
                    isDarkMode.toggle()
                } label: {
                    Image(systemName: isDarkMode ? "sun.max.fill" : "moon.fill")
                        .foregroundStyle(palette.textSecondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(palette.surface)

            LiveDockView(store: store)
                .walkiePalette(palette)
        }
        .frame(minWidth: 400, minHeight: 700)
    }
    #endif

    #if !os(macOS)
    @ViewBuilder
    private var iOSView: some View {
        LiveDockView(store: store)
            .walkiePalette(palette)
            .preferredColorScheme(isDarkMode ? .dark : .light)
    }
    #endif
}
