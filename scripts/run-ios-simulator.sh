#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_DIR="$ROOT/ios"
BUILD_DIR="$IOS_DIR/.build/arm64-apple-ios-simulator/debug"
APP_BUNDLE="$IOS_DIR/.build/Walkie.app"
BUNDLE_ID="tech.broomva.walkie"
DEVICE_NAME="${1:-iPhone 16 Pro}"

echo "==> Building Walkie for iOS Simulator..."
SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
(cd "$IOS_DIR" && swift build --triple arm64-apple-ios18.2-simulator --sdk "$SDK" --product WalkieApp)

echo "==> Assembling .app bundle..."
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE"
cp "$BUILD_DIR/WalkieApp" "$APP_BUNDLE/Walkie"

cat << 'PLIST' > "$APP_BUNDLE/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>Walkie</string>
    <key>CFBundleIdentifier</key>
    <string>tech.broomva.walkie</string>
    <key>CFBundleName</key>
    <string>Walkie</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>UIDeviceFamily</key>
    <array>
        <integer>1</integer>
        <integer>2</integer>
    </array>
    <key>CFBundleSupportedPlatforms</key>
    <array>
        <string>iPhoneSimulator</string>
    </array>
    <key>MinimumOSVersion</key>
    <string>17.0</string>
    <key>UILaunchScreen</key>
    <dict/>
    <key>NSAppTransportSecurity</key>
    <dict>
        <!-- Simulator development runner: allows connections to local loopback and private Tailscale mesh (100.x.x.x) -->
        <key>NSAllowsArbitraryLoads</key>
        <true/>
    </dict>
</dict>
</plist>
PLIST

echo "==> Signing app bundle ad-hoc..."
codesign --force --deep --sign - "$APP_BUNDLE"

echo "==> Finding Simulator: $DEVICE_NAME..."
DEVICE_ID="$(xcrun simctl list devices available | grep -F "$DEVICE_NAME (" | head -n 1 | sed -E 's/.*\(([A-F0-9-]+)\).*/\1/' || true)"
if [ -z "$DEVICE_ID" ]; then
  echo "Error: Device '$DEVICE_NAME' not found in available simulators" >&2
  exit 1
fi

echo "==> Booting Simulator ($DEVICE_ID)..."
xcrun simctl boot "$DEVICE_ID" 2>/dev/null || true
xcrun simctl bootstatus "$DEVICE_ID" -b
open -a Simulator

echo "==> Installing Walkie.app into $DEVICE_NAME..."
xcrun simctl install "$DEVICE_ID" "$APP_BUNDLE"

echo "==> Launching Walkie ($BUNDLE_ID)..."
xcrun simctl launch --terminate-running-process "$DEVICE_ID" "$BUNDLE_ID"
echo "==> Walkie is running in the iOS Simulator!"
