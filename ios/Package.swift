// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Walkie",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "WalkieDesign", targets: ["WalkieDesign"]),
        .library(name: "WalkieModel", targets: ["WalkieModel"]),
        .library(name: "WalkieScreens", targets: ["WalkieScreens"]),
    ],
    targets: [
        .target(name: "WalkieDesign"),
        .target(name: "WalkieModel"),
        .target(name: "WalkieScreens", dependencies: ["WalkieDesign", "WalkieModel"]),
        .testTarget(name: "WalkieTests", dependencies: ["WalkieDesign", "WalkieModel", "WalkieScreens"]),
    ]
)
