# Android Runtime API Key Design

## Goal

Remove the existing DeepSeek credential from source-controlled web assets and from every generated APK while keeping AI generation usable for local Debug APK testing.

The exposed credential must be revoked or rotated in the DeepSeek account. Removing it from future builds does not invalidate copies that may already exist.

## Chosen Approach

Require the user to provide a DeepSeek API key at runtime on the first AI request. Store the supplied value only in the WebView's device-local storage. Do not inject a key through Gradle, Android resources, Java source, or generated assets because all of those values are recoverable from the APK.

A server-side proxy remains the recommended architecture for a future public release, but deploying and operating that service is outside this Debug packaging task.

## Runtime Flow

1. `Config.js` initializes `AGE.API_KEY` to an empty value.
2. Before an AI request, `AIGenerator.js` checks memory and local storage for a saved key.
3. If no key exists, the browser prompts the user to enter one.
4. A non-empty key is trimmed, saved to local storage, and used in the Authorization header.
5. Cancelling or submitting an empty value stops the request and shows a missing-key status message.
6. An HTTP 401 response clears the saved key so the next AI request prompts again.

The key must never be written to logs, status text, thrown error messages, Gradle output, or APK resources.

## Build Protection

Add a Gradle verification task that scans synchronized web assets for credential-shaped `sk-...` values. The task runs as part of the existing Debug verification and fails the build if a potential embedded key is found.

The scanner is a defense against accidental future reintroduction. It does not replace revoking the already exposed key.

## Related Android Hardening

Apply the directly related review fixes while rebuilding the secure APK:

- Restrict WebView internal navigation to `file:///android_asset/web/` rather than trusting every `file:` URL.
- Reject unsupported URI schemes and open normal HTTP/HTTPS navigation in the system browser.
- Forward Activity pause/resume events to the WebView so game loops and media do not continue in the background.
- Remove the project-level hard-coded Gradle Java home; retain the optional Windows helper with a documented Android Studio JBR fallback.
- Strengthen web synchronization verification to compare nested synchronized files, not only root files and directory existence.

The direct DeepSeek API call still requires cross-origin network access from the trusted packaged file origin. A server proxy is required before this access can be removed entirely.

## Error Handling

- Missing key: no network request; show a concise prompt/status and allow retry.
- Invalid or revoked key: clear local storage on HTTP 401 and show the existing invalid-key message.
- Storage unavailable: use the entered key for the current session without persisting it.
- Other API/network failures: preserve existing timeout, rate-limit, truncation, and fallback behavior.

## Verification

- A new build-protection check fails against a credential-shaped fixture before implementation.
- Source and synchronized APK assets contain no credential-shaped DeepSeek key.
- Runtime key retrieval, cancellation, persistence failure, and 401 clearing have contract coverage.
- Web synchronization verification recursively compares packaged files with source files and rejects excluded paths.
- Android Lint reports no issues.
- Debug APK assembly and v2 signature verification pass.
- The final APK installs and launches on the API 26 emulator without a fatal exception.

## Out of Scope

- Hosting a production API proxy
- Managing DeepSeek accounts or rotating the credential on the user's behalf
- Encrypting a client-side key as if it were a distributable secret
- Release signing or store publication
