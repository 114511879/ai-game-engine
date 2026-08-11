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

## Offline RAG

The Android APK packages an INT8 `BAAI/bge-small-zh-v1.5` model, its tokenizer, and the curated game-design seed knowledge. Retrieval runs entirely on the device and does not connect to `127.0.0.1` or require network access. DeepSeek consultation and game generation remain separate network features and still require a user-provided API key.

The first retrieval copies the verified ONNX model into private no-backup storage and initializes the local SQLite index. Successful game examples saved by the user are embedded on the device and remain available after process restarts, device restarts, and replacement installs. The newest 1,000 user examples are retained. Android removes this private data when the application is uninstalled.

Release builds support Android API 26 or later on `arm64-v8a` and `armeabi-v7a`. Debug builds also package x86 variants for emulator tests. The APK must remain below 180 MB; allow up to 300 MB of free space for installation, extracted native libraries, the model, and an empty index.

The locked model preparation environment is CPython 3.12 on Windows AMD64. Rebuild the model assets from the repository root with:

```powershell
$ragExportPackages = 'E:\111\ai-game-engine-rag\export-packages'
& 'C:\Users\administered0\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pip install --target $ragExportPackages -r android\tools\offline_rag_requirements.txt
$env:PYTHONPATH = $ragExportPackages
& 'C:\Users\administered0\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' android\tools\prepare_offline_rag.py --model-cache 'E:\111\ai-game-engine-rag\models' --seed 'server\knowledge\0806_game_design_seed_v1.jsonl' --output 'android\app\src\main\ragAssets\rag'
```

## DeepSeek API Key

The APK does not contain a DeepSeek API key. The first AI request prompts for a key and stores it only in the WebView data on that device. Cancelling the prompt sends no request. An HTTP 401 response clears the stored value so the next request prompts again.

The credential that was previously present in `core/dsl/Config.js` must be revoked or rotated in the DeepSeek console. Rebuilding the APK does not revoke old copies of a credential.

## Install

With a device or emulator connected, use `adb` from `ANDROID_HOME`, or fall back to the standard per-user SDK location:

```powershell
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
& (Join-Path $sdk 'platform-tools\adb.exe') install -r 'android\app\build\outputs\apk\debug\app-debug.apk'
```

The packaged web app can use HTTPS APIs when the device has network access. The Android wrapper blocks cleartext traffic. Android RAG uses the native on-device bridge, while desktop/browser development continues to use the HTTP service documented in the project README.
