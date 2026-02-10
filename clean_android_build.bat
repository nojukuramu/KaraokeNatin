@echo off
echo ============================================================
echo  KaraokeNatin - DEEP CLEAN Android
echo ============================================================

set PROJECT_ROOT=%~dp0
set TAURI_DIR=%PROJECT_ROOT%apps\host\src-tauri

echo.
echo [1/3] Deleting Rust Android target artifacts...
if exist "%TAURI_DIR%\target\aarch64-linux-android" (
    rmdir /S /Q "%TAURI_DIR%\target\aarch64-linux-android"
    echo     Deleted target\aarch64-linux-android
) else (
    echo     Target dir already clean.
)

echo.
echo [2/3] Deleting compiled JNI libraries...
if exist "%TAURI_DIR%\gen\android\app\src\main\jniLibs\arm64-v8a" (
    rmdir /S /Q "%TAURI_DIR%\gen\android\app\src\main\jniLibs\arm64-v8a"
    echo     Deleted jniLibs\arm64-v8a
)

echo.
echo [3/3] Cleaning Gradle build...
cd /d "%TAURI_DIR%\gen\android"
call gradlew.bat clean
cd /d "%PROJECT_ROOT%"

echo.
echo ============================================================
echo  Clean complete. Now running build...
echo ============================================================
echo.

call build.bat android_signed
