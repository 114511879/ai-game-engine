# Android Runtime API Key Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the embedded DeepSeek credential, request a key at runtime, harden the Android WebView wrapper, and rebuild a verified Debug APK with no packaged credential.

**Architecture:** The trusted web app keeps a user-supplied key only in WebView local storage and clears it after HTTP 401. Gradle recursively verifies synchronized assets and rejects credential-shaped values before packaging; the Android Activity restricts navigation and forwards lifecycle events.

**Tech Stack:** Vanilla JavaScript, Android WebView/Java, Groovy Gradle tasks, Android Gradle Plugin 7.4.1, Gradle 7.5, Android Lint, ADB.

---

The workspace is not a Git repository. Do not initialize Git; use verification checkpoints instead of commits.

### Task 1: Add a Failing Embedded-Credential Guard

**Files:**
- Modify: `android/app/build.gradle`

- [ ] **Step 1: Add the credential verification task**

Add after `verifyWebAssetSync`:

```groovy
tasks.register('verifyNoEmbeddedCredentials') {
    dependsOn tasks.named('syncWebAssets')
    doLast {
        def destinationRoot = new File(generatedWebAssets.get().asFile, 'web')
        def credentialPattern = ~/(?i)\bsk-[A-Za-z0-9_-]{12,}/
        fileTree(destinationRoot) {
            include '**/*.js', '**/*.html', '**/*.json'
        }.files.each { candidate ->
            if (credentialPattern.matcher(candidate.getText('UTF-8')).find()) {
                def relative = destinationRoot.toPath().relativize(candidate.toPath())
                throw new GradleException('Credential-shaped value found in packaged asset: ' + relative)
            }
        }
    }
}
```

Add `dependsOn tasks.named('verifyNoEmbeddedCredentials')` to the existing `check` task configuration.

- [ ] **Step 2: Run the guard and verify RED**

```powershell
android\gradle-jbr.bat -p android :app:verifyNoEmbeddedCredentials --offline --no-daemon --console=plain
```

Expected: FAIL with `Credential-shaped value found in packaged asset: core\dsl\Config.js` without printing the credential.

### Task 2: Implement Runtime API Key Input

**Files:**
- Modify: `core/dsl/Config.js`
- Modify: `ai/generator/AIGenerator.js`
- Modify: `android/app/build.gradle`

- [ ] **Step 1: Extend the JavaScript contract check before implementation**

Add a `verifyRuntimeAPIKeyContract` Gradle task that reads `AIGenerator.js` and requires these exact markers:

```groovy
tasks.register('verifyRuntimeAPIKeyContract') {
    def generatorSource = new File(webRoot, 'ai/generator/AIGenerator.js')
    doLast {
        def sourceText = generatorSource.getText('UTF-8')
        [
            'age.deepseek_api_key',
            'window.prompt',
            "error.code='missing_api_key'",
            'clearStoredAPIKey()',
            'localStorage.removeItem'
        ].each { requiredText ->
            if (!sourceText.contains(requiredText)) {
                throw new GradleException('Runtime API key contract is missing: ' + requiredText)
            }
        }
    }
}
```

Run it and expect failure on `age.deepseek_api_key`.

- [ ] **Step 2: Remove the embedded key from Config.js**

Change the initialization to:

```javascript
(function(){var A=window.AGE=window.AGE||{};A.API_KEY='';
```

- [ ] **Step 3: Add runtime key management to AIGenerator.js**

Add near the top of the module:

```javascript
var API_KEY_STORAGE='age.deepseek_api_key';

function readStoredAPIKey(){
  try{return (localStorage.getItem(API_KEY_STORAGE)||'').trim();}
  catch(error){return'';}
}

function saveAPIKey(key){
  A.API_KEY=key;
  try{localStorage.setItem(API_KEY_STORAGE,key);}catch(error){}
}

function clearStoredAPIKey(){
  A.API_KEY='';
  try{localStorage.removeItem(API_KEY_STORAGE);}catch(error){}
}

function requireAPIKey(){
  var key=(A.API_KEY||'').trim()||readStoredAPIKey();
  if(!key){
    key=(window.prompt('请输入 DeepSeek API Key')||'').trim();
  }
  if(!key){
    var error=new Error('需要 DeepSeek API Key 才能使用 AI 生成');
    error.code='missing_api_key';
    throw error;
  }
  saveAPIKey(key);
  return key;
}
```

Use `requireAPIKey()` in `requestOnce` and build the Authorization header from its return value. Add a missing-key case to `errorMessage`. In `callStructuredAI`'s catch block, call `clearStoredAPIKey()` when `error.status===401` before storing the public error message.

- [ ] **Step 4: Run contract and credential checks**

```powershell
android\gradle-jbr.bat -p android :app:verifyRuntimeAPIKeyContract :app:verifyNoEmbeddedCredentials --offline --no-daemon --console=plain
```

Expected: both tasks pass; no credential value appears in output.

### Task 3: Harden Synchronization, WebView, Lifecycle, and Portability

**Files:**
- Modify: `android/app/build.gradle`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/java/com/aigameengine/app/MainActivity.java`
- Modify: `android/gradle.properties`
- Modify: `android/gradle-jbr.bat`
- Modify: `android/README.md`

- [ ] **Step 1: Extend the Activity contract before implementation**

Require these markers in `verifyMainActivityContract`:

```groovy
"file:///android_asset/web/",
"startsWith(APP_ASSET_PREFIX)",
"webView.onPause()",
"webView.pauseTimers()",
"webView.onResume()",
"webView.resumeTimers()"
```

Run the contract and expect failure on `startsWith(APP_ASSET_PREFIX)`.

- [ ] **Step 2: Recursively compare synchronized directories**

For each synchronized directory, build sorted relative-file lists for source and destination, excluding `__pycache__` and `*.pyc`. Fail when the lists differ, then compare every matching file with `java.util.Arrays.equals(source.bytes, packaged.bytes)`.

- [ ] **Step 3: Restrict WebView navigation and forward lifecycle**

Add `APP_ASSET_PREFIX = "file:///android_asset/web/"`. Allow a `file:` navigation only when its full URL starts with that prefix. Open only `http` and `https` schemes externally and block every other scheme. Set `setAllowFileAccessFromFileURLs(false)`, remove mixed-content allowance, and set `android:usesCleartextTraffic="false"`.

Add Activity methods:

```java
@Override
protected void onPause() {
    webView.onPause();
    webView.pauseTimers();
    super.onPause();
}

@Override
protected void onResume() {
    super.onResume();
    webView.onResume();
    webView.resumeTimers();
}
```

- [ ] **Step 4: Remove workstation-only Java configuration**

Remove `org.gradle.java.home` from `android/gradle.properties`. Update `gradle-jbr.bat` to use a valid existing `JAVA_HOME`, otherwise fall back to `%ProgramFiles%\Android\Android Studio\jbr`, and fail with a clear message if neither contains `bin\java.exe`.

Update `android/README.md` to use `ANDROID_HOME` or `%LOCALAPPDATA%\Android\Sdk` for ADB rather than a user-specific absolute path.

- [ ] **Step 5: Run contracts, Lint, and assembly**

```powershell
android\gradle-jbr.bat -p android :app:verifyWebAssetSync :app:verifyNoEmbeddedCredentials :app:verifyRuntimeAPIKeyContract :app:verifyMainActivityContract :app:lintDebug :app:assembleDebug --offline --no-daemon --console=plain
```

Expected: `BUILD SUCCESSFUL` and `lint-results-debug.txt` says `No issues found.`

### Task 4: Verify and Install the Secure APK

**Files:**
- Produce: `android/app/build/outputs/apk/debug/app-debug.apk`
- Produce: `android/app/build/reports/emulator-smoke.png`

- [ ] **Step 1: Scan source and APK entries without exposing matches**

Run a credential-shaped scan over synchronized text assets and fail if any match exists. Inspect APK entries for `index.html`, the startup page, `main.js`, `Engine.js`, and `StoryPlugin.js`.

- [ ] **Step 2: Verify identity and signature**

Use `aapt dump badging` and `apksigner verify --verbose --print-certs`. Expect package `com.aigameengine.app`, launcher `MainActivity`, and APK Signature Scheme v2 verification.

- [ ] **Step 3: Install and launch on Pixel_2_API_26**

Start the existing emulator headlessly, wait for `sys.boot_completed=1`, install with `adb install -r`, launch the Activity, verify a live PID and no `FATAL EXCEPTION`, capture the screenshot, and stop the emulator.

- [ ] **Step 4: Record the mandatory external action**

Report that the previous DeepSeek credential must be revoked or rotated in the DeepSeek console. Do not claim this external action was performed by Codex.
