@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM KaraokeNatin Build Script - Android & Windows
REM ============================================================
REM Usage:
REM   build.bat              - Build both Android + Windows
REM   build.bat android      - Build Android APK only
REM   build.bat windows      - Build Windows installers only
REM   build.bat sign         - Sign an existing Android APK
REM   build.bat android_signed - Build Android APK and invoke signing
REM ============================================================

set PROJECT_ROOT=%~dp0
set HOST_DIR=%PROJECT_ROOT%apps\host
set TAURI_DIR=%HOST_DIR%\src-tauri
set ANDROID_GEN=%TAURI_DIR%\gen\android

REM --- Configuration Loading ---
if exist "%PROJECT_ROOT%.env" (
    echo Loading configuration from .env file...
    for /f "usebackq tokens=1* delims==" %%A in ("%PROJECT_ROOT%.env") do (
        set "%%A=%%B"
    )
)

REM --- Android SDK / NDK paths ---
if "%ANDROID_HOME%"=="" (
    echo ERROR: ANDROID_HOME is not set. Please set it in .env or environment variables.
    exit /b 1
)
if "%NDK_HOME%"=="" (
    echo ERROR: NDK_HOME is not set. Please set it in .env or environment variables.
    exit /b 1
)
if "%JAVA_HOME%"=="" (
    echo ERROR: JAVA_HOME is not set. Please set it in .env or environment variables.
    exit /b 1
)

set BUILD_TOOLS=%ANDROID_HOME%\build-tools\36.0.0

REM --- Keystore Configuration ---
if "%KEYSTORE_PATH%"=="" set KEYSTORE_PATH=karaokenatin.keystore
set KEYSTORE=%PROJECT_ROOT%%KEYSTORE_PATH%

if "%KEYSTORE_ALIAS%"=="" set KEYSTORE_ALIAS=karaokenatin

REM --- Parse argument ---
set TARGET=%1
if "%TARGET%"=="" set TARGET=all

if "%TARGET%"=="android" goto :preflight
if "%TARGET%"=="windows" goto :preflight
if "%TARGET%"=="sign" goto :sign_apk
if "%TARGET%"=="android_signed" goto :preflight
if "%TARGET%"=="all" goto :preflight

echo Unknown target: %TARGET%
echo Usage: build.bat [android^|windows^|sign^|android_signed^|all]
exit /b 1

:preflight
echo.
echo ============================================================
echo  KaraokeNatin Build - %TARGET%
echo ============================================================
echo.

REM --- Step 1: Build shared package ---
echo [1/4] Building shared package...
cd /d "%PROJECT_ROOT%"
call pnpm --filter @karaokenatin/shared build
if errorlevel 1 (
    echo ERROR: Failed to build shared package.
    exit /b 1
)
echo       Shared package built OK.
echo.

REM --- Step 2: Build host frontend ---
echo [2/4] Building host frontend...
cd /d "%PROJECT_ROOT%"
call pnpm --filter @karaokenatin/host build
if errorlevel 1 (
    echo ERROR: Failed to build host frontend.
    exit /b 1
)
echo       Frontend built OK.
echo.

if "%TARGET%"=="android" goto :build_android
if "%TARGET%"=="windows" goto :build_windows
if "%TARGET%"=="android_signed" goto :build_android
if "%TARGET%"=="all" goto :build_android

:build_android
echo [3/4] Building Android APK (arm64)...
echo       Using cargo-ndk to cross-compile Rust...

cd /d "%TAURI_DIR%"

REM --- Clear old native libraries to prevent stale/locked files ---
set JNILIBS_ARM64=%ANDROID_GEN%\app\src\main\jniLibs\arm64-v8a
if exist "%JNILIBS_ARM64%\libapp_lib.so" del /q "%JNILIBS_ARM64%\libapp_lib.so"
echo       Cleared old native library.

cargo ndk -t arm64-v8a -o gen/android/app/src/main/jniLibs build --release --lib --features tauri/custom-protocol
if errorlevel 1 (
    echo ERROR: cargo-ndk build failed.
    exit /b 1
)
echo       Native library compiled OK.

REM --- Copy frontend assets to Android project ---
echo       Copying frontend assets to Android...
set ANDROID_ASSETS=%ANDROID_GEN%\app\src\main\assets
if exist "%ANDROID_ASSETS%\index.html" del /q "%ANDROID_ASSETS%\index.html"
if exist "%ANDROID_ASSETS%\assets" rmdir /s /q "%ANDROID_ASSETS%\assets"
xcopy /e /i /y "%HOST_DIR%\dist\*" "%ANDROID_ASSETS%\" >nul
if errorlevel 1 (
    echo ERROR: Failed to copy frontend assets.
    exit /b 1
)
echo       Frontend assets copied OK.

echo       Running Gradle assembleArm64Release...
cd /d "%ANDROID_GEN%"
call gradlew.bat assembleArm64Release -x rustBuildArm64Release -x rustBuildUniversalRelease --warning-mode=summary
if errorlevel 1 (
    echo ERROR: Gradle build failed.
    exit /b 1
)

REM --- Sign the APK if keystore exists ---
if "%TARGET%"=="android_signed" goto :sign_apk
set APK_UNSIGNED=%ANDROID_GEN%\app\build\outputs\apk\arm64\release\app-arm64-release-unsigned.apk
set APK_SIGNED=%PROJECT_ROOT%KaraokeNatin-arm64-release.apk

if exist "%KEYSTORE%" (
    echo       Signing APK...
    copy /y "%APK_UNSIGNED%" "%APK_SIGNED%" >nul

    "%BUILD_TOOLS%\zipalign.exe" -f 4 "%APK_SIGNED%" "%APK_SIGNED%.aligned"
    move /y "%APK_SIGNED%.aligned" "%APK_SIGNED%" >nul

    "%BUILD_TOOLS%\apksigner.bat" sign --ks "%KEYSTORE%" --ks-key-alias %KEYSTORE_ALIAS% --ks-pass env:KARAOKE_KS_PASS "%APK_SIGNED%"
    if errorlevel 1 (
        echo WARNING: APK signing failed. You may need to set KARAOKE_KS_PASS environment variable.
        echo          Or run: build.bat sign
    ) else (
        echo       Signed APK: %APK_SIGNED%
    )
) else (
    echo       APK is unsigned. To sign, run: build.bat sign
    echo       Unsigned APK: %APK_UNSIGNED%
)
echo       Android build complete!
echo.

if "%TARGET%"=="android" goto :done
goto :build_windows

:build_windows
echo [4/4] Building Windows installers...
cd /d "%HOST_DIR%"
call pnpm tauri build
if errorlevel 1 (
    echo ERROR: Windows Tauri build failed.
    exit /b 1
)

echo       Windows build complete!
echo       NSIS Setup: %TAURI_DIR%\target\release\bundle\nsis\
echo       MSI:        %TAURI_DIR%\target\release\bundle\msi\
echo.

goto :done

:sign_apk
echo.
echo ============================================================
echo  KaraokeNatin - Sign Android APK
echo ============================================================
echo.

set APK_UNSIGNED=%ANDROID_GEN%\app\build\outputs\apk\arm64\release\app-arm64-release-unsigned.apk
set APK_SIGNED=%PROJECT_ROOT%KaraokeNatin-arm64-release.apk

if not exist "%APK_UNSIGNED%" (
    echo ERROR: No unsigned APK found. Run "build.bat android" first.
    exit /b 1
)

REM --- Generate keystore if it doesn't exist ---
if not exist "%KEYSTORE%" (
    echo No keystore found. Generating one...
    echo You will be prompted to set a password and enter details.
    echo.
    keytool -genkey -v -keystore "%KEYSTORE%" -alias %KEYSTORE_ALIAS% -keyalg RSA -keysize 2048 -validity 10000
    if errorlevel 1 (
        echo ERROR: Failed to generate keystore.
        exit /b 1
    )
    echo.
    echo Keystore created: %KEYSTORE%
    echo IMPORTANT: Back up this keystore! You need it for future updates.
    echo.
)

REM --- Copy, zipalign, and sign ---
copy /y "%APK_UNSIGNED%" "%APK_SIGNED%" >nul

echo Zipaligning...
"%BUILD_TOOLS%\zipalign.exe" -f 4 "%APK_SIGNED%" "%APK_SIGNED%.aligned"
move /y "%APK_SIGNED%.aligned" "%APK_SIGNED%" >nul

echo Signing APK...
echo Enter your keystore password when prompted:
"%BUILD_TOOLS%\apksigner.bat" sign --ks "%KEYSTORE%" --ks-key-alias %KEYSTORE_ALIAS% "%APK_SIGNED%"
if errorlevel 1 (
    echo ERROR: Signing failed.
    exit /b 1
)

echo.
echo ============================================================
echo  Signed APK: %APK_SIGNED%
echo ============================================================
echo.

"%BUILD_TOOLS%\apksigner.bat" verify --verbose "%APK_SIGNED%" 2>nul
goto :done

:done
echo.
echo ============================================================
echo  Build finished!
echo ============================================================
echo.
endlocal
