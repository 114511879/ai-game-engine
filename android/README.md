# Android Debug APK

Open this `android` directory in Android Studio.

## Build

Use **Build > Build Bundle(s) / APK(s) > Build APK(s)**, or run from the repository root:

```powershell
android\gradle-jbr.bat -p android :app:assembleDebug
```

The helper script selects the JBR bundled with Android Studio and then delegates to the standard Gradle Wrapper. The APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Every build validates and copies the current web source from the repository root. After editing HTML, CSS, JavaScript, or files under `ai`, `assets`, `core`, `fitness`, or `plugins`, rebuild and reinstall the APK. No manual asset copy is needed.

An APK already installed on a phone does not change automatically. Install the newly built APK over the existing app to update it.

## DeepSeek API Key

The APK does not contain a DeepSeek API key. The first AI request prompts for a key and stores it only in the WebView data on that device. Cancelling the prompt sends no request. An HTTP 401 response clears the stored value so the next request prompts again.

The credential that was previously present in `core/dsl/Config.js` must be revoked or rotated in the DeepSeek console. Rebuilding the APK does not revoke old copies of a credential.

## Install

With a device or emulator connected, use `adb` from `ANDROID_HOME`, or fall back to the standard per-user SDK location:

```powershell
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
& (Join-Path $sdk 'platform-tools\adb.exe') install -r 'android\app\build\outputs\apk\debug\app-debug.apk'
```

The packaged web app can use HTTPS APIs when the device has network access. The Android wrapper blocks cleartext traffic, so the existing HTTP RAG URL uses the web application's offline fallback on Android.
