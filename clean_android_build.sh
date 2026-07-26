#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# KaraokeNatin - DEEP CLEAN Android (Linux/macOS)
# POSIX counterpart to clean_android_build.bat.
# ============================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAURI_DIR="${PROJECT_ROOT}/apps/host/src-tauri"

echo "============================================================"
echo " KaraokeNatin - DEEP CLEAN Android"
echo "============================================================"

# --- Configuration Loading ---
# clean_android_build.bat doesn't load .env itself, but it calls
# build.bat at the end, which does. Loading it here too means the checks
# below (and the eventual build.sh invocation) see the same environment
# either way.
if [ -f "${PROJECT_ROOT}/.env" ]; then
    echo "Loading configuration from .env file..."
    set -a
    # shellcheck disable=SC1091
    source "${PROJECT_ROOT}/.env"
    set +a
fi

echo
echo "[1/3] Deleting Rust Android target artifacts..."
if [ -d "${TAURI_DIR}/target/aarch64-linux-android" ]; then
    rm -rf "${TAURI_DIR}/target/aarch64-linux-android"
    echo "    Deleted target/aarch64-linux-android"
else
    echo "    Target dir already clean."
fi

echo
echo "[2/3] Deleting compiled JNI libraries..."
if [ -d "${TAURI_DIR}/gen/android/app/src/main/jniLibs/arm64-v8a" ]; then
    rm -rf "${TAURI_DIR}/gen/android/app/src/main/jniLibs/arm64-v8a"
    echo "    Deleted jniLibs/arm64-v8a"
else
    echo "    jniLibs/arm64-v8a already clean."
fi

echo
echo "[3/3] Cleaning Gradle build..."
if [ ! -x "${TAURI_DIR}/gen/android/gradlew" ]; then
    echo "ERROR: ${TAURI_DIR}/gen/android/gradlew not found or not executable."
    exit 1
fi
(cd "${TAURI_DIR}/gen/android" && ./gradlew clean)

echo
echo "============================================================"
echo " Clean complete. Now running build..."
echo "============================================================"
echo

# ANDROID_HOME / NDK_HOME / JAVA_HOME and the build-tools lookup are
# validated inside build.sh itself, same as clean_android_build.bat
# delegating those checks to build.bat.
"${PROJECT_ROOT}/build.sh" android_signed
