// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Walkie",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .executable(name: "WalkieApp", targets: ["WalkieApp"]),
        .library(name: "WalkieDesign", targets: ["WalkieDesign"]),
        .library(name: "WalkieModel", targets: ["WalkieModel"]),
        .library(name: "WalkieScreens", targets: ["WalkieScreens"]),
    ],
    targets: [
        .executableTarget(
            name: "WalkieApp",
            dependencies: ["WalkieDesign", "WalkieModel", "WalkieScreens"]
        ),
        .target(name: "WalkieDesign"),
        .target(name: "WalkieModel"),
        .target(name: "WalkieScreens", dependencies: ["WalkieDesign", "WalkieModel"]),
        .testTarget(name: "WalkieTests", dependencies: ["WalkieDesign", "WalkieModel", "WalkieScreens"]),
    ]
)
