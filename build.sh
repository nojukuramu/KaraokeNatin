#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# KaraokeNatin Build Script - Android & Desktop (Linux/macOS)
# POSIX counterpart to build.bat. On Windows, use build.bat.
# ============================================================
# Usage:
#   ./build.sh                 - Build both Android + Desktop
#   ./build.sh android         - Build Android APK only
#   ./build.sh desktop         - Build desktop installers only
#   ./build.sh sign            - Sign an existing Android APK
#   ./build.sh android_signed  - Build Android APK and invoke signing
#
# "desktop" replaces build.bat's "windows" target: `pnpm tauri build`
# produces whatever bundle targets are configured for the host OS
# (tauri.conf.json now lists nsis/msi for Windows and deb/appimage for
# Linux). This script does not cross-compile Windows installers from
# Linux/macOS -- that is a genuinely Windows-only capability of the
# original tooling and is not reproduced here.
# ============================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_DIR="${PROJECT_ROOT}/apps/host"
TAURI_DIR="${HOST_DIR}/src-tauri"
ANDROID_GEN="${TAURI_DIR}/gen/android"

# --- Configuration Loading ---
if [ -f "${PROJECT_ROOT}/.env" ]; then
    echo "Loading configuration from .env file..."
    set -a
    # shellcheck disable=SC1091
    source "${PROJECT_ROOT}/.env"
    set +a
fi

# --- Android SDK / NDK / JDK paths ---
# build.bat checks these unconditionally for every target, including
# "windows"-only builds. That's arguably a quirk, but we mirror it
# faithfully rather than silently changing behavior.
MISSING=()
[ -z "${ANDROID_HOME:-}" ] && MISSING+=("ANDROID_HOME")
[ -z "${NDK_HOME:-}" ] && MISSING+=("NDK_HOME")
[ -z "${JAVA_HOME:-}" ] && MISSING+=("JAVA_HOME")
if [ "${#MISSING[@]}" -gt 0 ]; then
    echo "ERROR: the following required environment variable(s) are not set: ${MISSING[*]}"
    echo "       Set them in .env or in your shell environment."
    exit 1
fi

# --- Locate the highest installed Android build-tools version ---
# build.bat hardcoded build-tools\36.0.0 (now fixed there too, see
# build.bat). Here we pick the highest version actually installed under
# $ANDROID_HOME/build-tools using `sort -V` (a true version sort, unlike
# build.bat's lexicographic `dir /o-n`), and fail clearly if none exist.
if [ ! -d "${ANDROID_HOME}/build-tools" ]; then
    echo "ERROR: No build-tools directory found under \$ANDROID_HOME (${ANDROID_HOME}/build-tools)."
    echo "       Install Android build-tools via sdkmanager."
    exit 1
fi
BUILD_TOOLS_VERSION="$(find "${ANDROID_HOME}/build-tools" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort -V | tail -n1)"
if [ -z "${BUILD_TOOLS_VERSION}" ]; then
    echo "ERROR: \$ANDROID_HOME/build-tools exists but contains no build-tools versions."
    echo "       Install one via: sdkmanager \"build-tools;<version>\""
    exit 1
fi
BUILD_TOOLS="${ANDROID_HOME}/build-tools/${BUILD_TOOLS_VERSION}"
echo "Using Android build-tools ${BUILD_TOOLS_VERSION} (${BUILD_TOOLS})"

# --- Keystore Configuration ---
KEYSTORE_PATH="${KEYSTORE_PATH:-karaokenatin.keystore}"
KEYSTORE="${PROJECT_ROOT}/${KEYSTORE_PATH}"
KEYSTORE_ALIAS="${KEYSTORE_ALIAS:-karaokenatin}"

# --- Parse argument ---
TARGET="${1:-all}"

case "$TARGET" in
    android|desktop|sign|android_signed|all) ;;
    *)
        echo "Unknown target: ${TARGET}"
        echo "Usage: build.sh [android|desktop|sign|android_signed|all]"
        exit 1
        ;;
esac

finish() {
    echo
    echo "============================================================"
    echo " Build finished!"
    echo "============================================================"
    echo
}

sign_apk_interactive() {
    echo
    echo "============================================================"
    echo " KaraokeNatin - Sign Android APK"
    echo "============================================================"
    echo

    local apk_unsigned="${ANDROID_GEN}/app/build/outputs/apk/arm64/release/app-arm64-release-unsigned.apk"
    local apk_signed="${PROJECT_ROOT}/KaraokeNatin-arm64-release.apk"

    if [ ! -f "$apk_unsigned" ]; then
        echo "ERROR: No unsigned APK found. Run \"build.sh android\" first."
        exit 1
    fi

    if [ ! -f "$KEYSTORE" ]; then
        echo "No keystore found. Generating one..."
        echo "You will be prompted to set a password and enter details."
        echo
        keytool -genkey -v -keystore "$KEYSTORE" -alias "$KEYSTORE_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
            || { echo "ERROR: Failed to generate keystore."; exit 1; }
        echo
        echo "Keystore created: $KEYSTORE"
        echo "IMPORTANT: Back up this keystore! You need it for future updates."
        echo
    fi

    cp -f "$apk_unsigned" "$apk_signed"

    echo "Zipaligning..."
    "${BUILD_TOOLS}/zipalign" -f 4 "$apk_signed" "${apk_signed}.aligned"
    mv -f "${apk_signed}.aligned" "$apk_signed"

    echo "Signing APK..."
    echo "Enter your keystore password when prompted:"
    "${BUILD_TOOLS}/apksigner" sign --ks "$KEYSTORE" --ks-key-alias "$KEYSTORE_ALIAS" "$apk_signed" \
        || { echo "ERROR: Signing failed."; exit 1; }

    echo
    echo "============================================================"
    echo " Signed APK: $apk_signed"
    echo "============================================================"
    echo

    "${BUILD_TOOLS}/apksigner" verify --verbose "$apk_signed" || true
}

step_build_shared_and_frontend() {
    echo
    echo "============================================================"
    echo " KaraokeNatin Build - ${TARGET}"
    echo "============================================================"
    echo

    echo "[1/4] Building shared package..."
    (cd "$PROJECT_ROOT" && pnpm --filter @karaokenatin/shared build) \
        || { echo "ERROR: Failed to build shared package."; exit 1; }
    echo "      Shared package built OK."
    echo

    echo "[2/4] Building host frontend..."
    (cd "$PROJECT_ROOT" && pnpm --filter @karaokenatin/host build) \
        || { echo "ERROR: Failed to build host frontend."; exit 1; }
    echo "      Frontend built OK."
    echo
}

build_android() {
    echo "[3/4] Building Android APK (arm64)..."
    echo "      Using cargo-ndk to cross-compile Rust..."

    cd "$TAURI_DIR"

    # --- Clear old native libraries to prevent stale/locked files ---
    local jnilibs_arm64="${ANDROID_GEN}/app/src/main/jniLibs/arm64-v8a"
    if [ -f "${jnilibs_arm64}/libapp_lib.so" ]; then
        rm -f "${jnilibs_arm64}/libapp_lib.so"
        echo "      Cleared old native library."
    fi

    cargo ndk -t arm64-v8a -o gen/android/app/src/main/jniLibs build --release --lib --features tauri/custom-protocol \
        || { echo "ERROR: cargo-ndk build failed."; exit 1; }
    echo "      Native library compiled OK."

    # --- Copy frontend assets to Android project ---
    echo "      Copying frontend assets to Android..."
    local android_assets="${ANDROID_GEN}/app/src/main/assets"
    [ -f "${android_assets}/index.html" ] && rm -f "${android_assets}/index.html"
    [ -d "${android_assets}/assets" ] && rm -rf "${android_assets}/assets"
    mkdir -p "$android_assets"
    cp -r "${HOST_DIR}/dist/." "${android_assets}/" \
        || { echo "ERROR: Failed to copy frontend assets."; exit 1; }
    echo "      Frontend assets copied OK."

    echo "      Running Gradle assembleArm64Release..."
    cd "$ANDROID_GEN"
    ./gradlew assembleArm64Release -x rustBuildArm64Release -x rustBuildUniversalRelease --warning-mode=summary \
        || { echo "ERROR: Gradle build failed."; exit 1; }

    # --- Sign the APK if keystore exists ---
    if [ "$TARGET" = "android_signed" ]; then
        sign_apk_interactive
        finish
        exit 0
    fi

    local apk_unsigned="${ANDROID_GEN}/app/build/outputs/apk/arm64/release/app-arm64-release-unsigned.apk"
    local apk_signed="${PROJECT_ROOT}/KaraokeNatin-arm64-release.apk"

    if [ -f "$KEYSTORE" ]; then
        echo "      Signing APK..."
        cp -f "$apk_unsigned" "$apk_signed"

        "${BUILD_TOOLS}/zipalign" -f 4 "$apk_signed" "${apk_signed}.aligned"
        mv -f "${apk_signed}.aligned" "$apk_signed"

        if "${BUILD_TOOLS}/apksigner" sign --ks "$KEYSTORE" --ks-key-alias "$KEYSTORE_ALIAS" --ks-pass env:KARAOKE_KS_PASS "$apk_signed"; then
            echo "      Signed APK: $apk_signed"
        else
            echo "WARNING: APK signing failed. You may need to set the KARAOKE_KS_PASS environment variable."
            echo "         Or run: build.sh sign"
        fi
    else
        echo "      APK is unsigned. To sign, run: build.sh sign"
        echo "      Unsigned APK: $apk_unsigned"
    fi
    echo "      Android build complete!"
    echo
}

build_desktop() {
    echo "[4/4] Building desktop installers..."
    cd "$HOST_DIR"
    pnpm tauri build || { echo "ERROR: Desktop Tauri build failed."; exit 1; }

    echo "      Desktop build complete!"
    echo "      Bundles: ${TAURI_DIR}/target/release/bundle/"
    echo
}

case "$TARGET" in
    sign)
        sign_apk_interactive
        ;;
    android)
        step_build_shared_and_frontend
        build_android
        ;;
    desktop)
        step_build_shared_and_frontend
        build_desktop
        ;;
    android_signed)
        step_build_shared_and_frontend
        build_android   # exits internally once signing is done for this target
        ;;
    all)
        step_build_shared_and_frontend
        build_android
        build_desktop
        ;;
esac

finish
