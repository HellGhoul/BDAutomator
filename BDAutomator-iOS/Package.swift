// swift-tools-version: 5.7
import PackageDescription

let package = Package(
    name: "BDAutomator",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .library(
            name: "BDAutomator",
            targets: ["BDAutomator"]),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "BDAutomator",
            dependencies: [],
            path: "BDAutomator/BDAutomator"),
        .testTarget(
            name: "BDAutomatorTests",
            dependencies: ["BDAutomator"],
            path: "Tests/BDAutomatorTests"),
    ]
)
