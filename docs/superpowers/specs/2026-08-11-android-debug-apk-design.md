# Android Debug APK Design

## Goal

Create an Android Studio project that packages the existing AI Game Engine web application as an installable Debug APK. Every Android build must automatically include the latest web source from the repository root.

Build-time synchronization does not update an APK that is already installed on a device. After changing the web project, a new APK must be built and installed over the previous version.

## Chosen Approach

Use a small native Android application with one Activity and one WebView. Keep the Android project under `android/` and keep the web application in its existing repository-root locations.

This approach is preferred over Capacitor because it adds fewer dependencies and introduces no Node-based mobile build layer. It is preferred over loading a hosted site because the application remains usable with its packaged assets and does not require web hosting.

## Android Application

- Application name: `AI Game Engine`
- Application ID: `com.aigameengine.app`
- Build output: Debug APK
- Minimum Android version: Android 8.0 (API 26)
- Entry point: a single native Activity containing a full-screen WebView
- Initial page: packaged `index.html`, which redirects to the existing startup page

The WebView enables JavaScript, DOM storage, Canvas rendering, network access, and state restoration. Android's Back button navigates backward through WebView history when possible and closes the Activity otherwise.

## Web Asset Synchronization

The Android Gradle build defines a synchronization task that runs before `preBuild`. It copies the current web application into a generated assets directory inside the Android build directory. The generated directory is registered as an Android asset source.

The synchronized inputs are:

- Root web files: `index.html`, `AI-ENGINE启动.html`, `game.html`, `update-announcement.html`, `styles.css`, and `main.js`
- Web source directories: `ai/`, `assets/`, `core/`, `fitness/`, and `plugins/`

Documentation, tests, the Python server, Android sources, caches, and build output are not copied into the APK.

The synchronization task validates required entry files before copying. A missing `index.html`, startup page, or `main.js` fails the build instead of producing an incomplete APK. Because the destination is generated from scratch by a Gradle Sync task, deleted web files are also removed from the next APK.

## Runtime Data Flow

1. Android Studio invokes the Debug build.
2. Gradle validates and synchronizes current web files into generated Android assets.
3. Android resource packaging embeds those generated assets in the APK.
4. The Activity loads `file:///android_asset/web/index.html` in the WebView.
5. Relative HTML, JavaScript, CSS, and asset references resolve inside the APK.
6. Existing web code continues to store user state through DOM storage and make permitted network requests.

DeepSeek HTTPS requests remain available when the device has network access. The current RAG address, `http://127.0.0.1:8765`, refers to the Android device itself rather than the development computer. Unless a RAG service runs on the device, the existing web application uses its current offline fallback behavior. Reconfiguring RAG for a LAN or hosted endpoint is outside this packaging task.

## Error Handling

- Missing required web inputs fail the Gradle build with a clear message.
- A main-frame WebView load failure displays a local retry page instead of a blank screen.
- Ordinary API and RAG failures remain handled by the existing JavaScript application.
- Cleartext traffic is permitted for the existing local RAG URL, while HTTPS remains the normal path for external AI requests.

## Verification

The implementation is complete when all of the following pass:

- The Gradle synchronization task copies all intended web inputs and excludes non-runtime directories.
- A change to a web source file is reflected in the next packaged asset without manual copying.
- `assembleDebug` succeeds using the installed Android Studio JDK and Android SDK.
- Android Lint reports no blocking errors.
- APK inspection confirms the expected package name and current web files.
- The APK installs and launches on an available emulator or connected device, loads the startup interface, follows internal navigation, and handles Android Back navigation.

The expected artifact path is `android/app/build/outputs/apk/debug/app-debug.apk`.

## Out of Scope

- Release signing or Play Store publication
- Network hot updates after installation
- Hosting or embedding the Python RAG service on Android
- Redesigning the existing web interface
- Changing current game-generation behavior
