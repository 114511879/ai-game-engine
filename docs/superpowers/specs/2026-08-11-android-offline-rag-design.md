# Android Offline RAG Design

**Date:** 2026-08-11  
**Status:** Approved for implementation planning

## Objective

The Android APK must retrieve bundled game-design knowledge without a network connection and must add user-confirmed successful game examples to a persistent on-device semantic index. An APK upgrade must preserve user examples. Uninstalling the application may remove them.

This work makes RAG offline. DeepSeek-backed consultation and game generation remain network-dependent and are outside this design.

## Constraints and Decisions

- Use an on-device semantic model rather than keyword-only retrieval.
- A final APK size of approximately 100-180 MB is acceptable.
- Allow approximately 300 MB of free device storage for installation, extracted native libraries, the model, and the growing index.
- Keep at most 1,000 user-created examples. Delete the oldest user examples only after a newer example has been committed successfully.
- Keep the existing desktop/browser HTTP RAG workflow unchanged.
- Support Android API 26 and later on `arm64-v8a` and `armeabi-v7a` release devices.
- Do not embed credentials or require storage permissions.

## Architecture

The APK will contain two RAG transports behind the existing `AGE.RAGClient` interface:

1. In Android WebView, `RAGClient` uses an asynchronous JavaScript bridge backed by a native `LocalRagEngine`.
2. In a normal browser, `RAGClient` continues to call `http://127.0.0.1:8765`.

The native engine owns model inference, the SQLite document store, vector persistence, seed migrations, recovery of incomplete indexing, and similarity search. The web layer owns request shaping and conversion to the response contract already consumed by `main.js`.

The native implementation uses `com.microsoft.onnxruntime:onnxruntime-android:1.20.0` and a locked, INT8-quantized ONNX export of `BAAI/bge-small-zh-v1.5`. The model bundle includes its WordPiece vocabulary and a manifest containing the artifact version, SHA-256 hashes, vector dimension, maximum token count, pooling strategy, and normalization strategy.

## Packaged Assets

The following versioned assets are packaged under the Android app assets rather than the synchronized web directory:

- `rag/model.onnx`: INT8 BGE model.
- `rag/vocab.txt`: matching WordPiece vocabulary.
- `rag/model-manifest.json`: hashes and inference contract.
- `rag/seed-documents.jsonl`: the curated knowledge records.
- `rag/seed-vectors.bin`: normalized 512-dimensional float vectors produced by the exact packaged model.

The Gradle build verifies that every manifest hash matches, every seed document has one vector, every vector has 512 finite values, and the model/vector artifact versions match. A missing or inconsistent asset fails the build.

Release builds include only `arm64-v8a` and `armeabi-v7a`. Debug builds may additionally include `x86_64` for emulator testing.

## Native Components

### `BgeTokenizer`

`BgeTokenizer` performs the model-compatible basic and WordPiece tokenization. It adds special tokens, truncates to 256 tokens, and generates `input_ids`, `attention_mask`, and `token_type_ids`. Tests use fixed Chinese, Latin, punctuation, unknown-token, and boundary fixtures.

### `OnnxEmbeddingModel`

The embedding model is initialized lazily on a dedicated executor. Queries receive the BGE Chinese retrieval prefix `为这个句子生成表示以用于检索相关文章：`; stored documents do not. The engine takes the CLS token from `last_hidden_state`, converts it to a 512-dimensional float vector, and L2-normalizes it. Batch inference is used for multiple rewritten queries.

### `RagDatabase`

`RagDatabase` uses `SQLiteOpenHelper` and application-private storage. The core schema is:

```text
documents(
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,            -- built_in | user
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  embedding BLOB,
  embedding_version TEXT,
  state TEXT NOT NULL,             -- pending | ready | failed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  seed_version INTEGER
)

rag_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)
```

Embeddings are little-endian float32 BLOBs. Built-in seed import is idempotent by document ID and seed version. An upgrade inserts or updates built-in records inside one transaction and never replaces `origin=user` records.

Saving an experience first commits its content with `state=pending`. The executor then embeds it and atomically changes it to `ready`. Startup retries all `pending` records. A reproducible inference error changes a record to `failed`; a future model-version migration may retry it.

After a new user record becomes `ready`, the database keeps the newest 1,000 user records and deletes older user records in the same cleanup transaction. Built-in records never count toward this limit.

### `LocalRagEngine`

For retrieval, the engine:

1. Validates and normalizes the query list.
2. Initializes the database and model if needed.
3. Embeds the query list as one batch.
4. Scans all `ready` vectors whose `embedding_version` matches the active model.
5. Assigns each document its maximum cosine similarity across query vectors.
6. Blends semantic similarity at 85% with deterministic token overlap at 15% to stabilize exact names and game terms.
7. Returns the top six documents with scores clamped to the existing zero-to-one UI range.

With 19 current seed documents and at most 1,000 user examples, a linear scan covers roughly 2 MB of vector values and avoids an additional native vector-database dependency.

The native result contains documents, runtime mode, knowledge counts, and diagnostics. The web client supplies the existing `plan`, `coverage`, `context_text`, `source_counts`, `web_search_needed=false`, `web_search_used=false`, and `web_sources=[]` fields expected by the UI.

### `AndroidRagBridge`

`AndroidRagBridge` exposes three asynchronous operations through `@JavascriptInterface`:

```text
health(requestId)
retrieve(requestId, payloadJson)
saveExperience(requestId, payloadJson)
```

Bridge methods validate payload size and required fields, enqueue work on a single RAG executor, and return immediately. Completion is delivered on the UI thread to:

```text
window.AGE.NativeRAG.resolve(requestId, resultJson)
window.AGE.NativeRAG.reject(requestId, errorJson)
```

The JavaScript adapter owns request IDs, pending promises, and timeouts. Late callbacks are ignored after timeout or page destruction.

## Web Integration

`RAGClient.js` detects the bridge through `window.AndroidRag` and uses it before the HTTP transport. No request to `127.0.0.1` is attempted inside the APK.

The client creates up to three rewritten queries from the raw request and confirmed Intent DSL:

- the original user request;
- game type, world/theme, and camera terms;
- combat, mechanics, progression, and requested systems.

Empty or duplicate rewritten queries are removed. Returned documents are normalized into the current RAG response shape so `researchAndGenerate`, the research panel, context routing, and experience saving require no conditional Android logic.

The desktop/browser path preserves the existing HTTP endpoints and response handling.

## Initialization and Recovery

The engine initializes lazily on the first health, retrieval, or save request. The UI reports local knowledge initialization while the request remains pending; it does not fail over to HTTP in the APK.

Initialization performs these operations in order:

1. Verify packaged artifact metadata and open the database.
2. Apply schema migrations transactionally.
3. Import or update built-in documents and precomputed vectors.
4. Load the ONNX session and vocabulary.
5. Queue recovery of pending user documents.
6. Mark semantic retrieval ready.

If model initialization or semantic inference fails, the engine performs local keyword retrieval over built-in and user content. The response is marked `native_lexical_fallback` so the UI can report degraded local retrieval. Database or seed corruption triggers recreation of built-in rows only; recoverable user rows are retained. User records are never silently dropped to repair seed data.

## Security and Privacy

- Documents, vectors, and metadata stay in application-private storage.
- Existing `allowBackup=false` and backup exclusion rules remain in force.
- No filesystem permission is requested.
- RAG performs no network access. The existing Internet permission remains because DeepSeek generation is separate functionality.
- The bridge rejects calls unless the main WebView is showing the packaged application URL.
- Packaged pages prohibit frames and object embedding through Content Security Policy, reducing exposure of `addJavascriptInterface` to untrusted frames.
- External HTTP and HTTPS navigation continues to open in the system browser.
- Model and seed artifacts contain no API key or user data.

## Testing

### JVM and JavaScript Tests

- Tokenizer fixtures cover Chinese segmentation, WordPiece fallback, special tokens, truncation, padding, and unknown tokens.
- Embedding tests cover output dimension, finite values, normalization, deterministic inference, and invalid model outputs.
- Search tests cover cosine ordering, multi-query maximum score, semantic/lexical blending, and top-six truncation.
- Database tests cover first import, repeat import, seed upgrade, preservation of user data, pending recovery, model-version mismatch, and cleanup at 1,001 user examples.
- Bridge tests cover malformed JSON, oversized payloads, background execution, success callback, failure callback, and destroyed-page callbacks.
- JavaScript tests cover native transport preference, request timeout cleanup, native response normalization, experience saving, fallback mode display, and unchanged browser HTTP behavior.

### Build and Device Tests

- The existing source synchronization and credential checks remain mandatory.
- New Gradle checks verify all RAG artifacts, hashes, dimensions, ABI filters, and the JavaScript bridge contract.
- An instrumentation test loads the packaged WebView and exercises health, retrieval, and experience saving through the real bridge.
- On an Android API 26 emulator and a current Android emulator, airplane-mode testing verifies built-in retrieval, saving a new example, retrieving that example with a similar query, process restart recovery, and data preservation after `adb install -r`.
- A forced model-load failure verifies keyword fallback without network access.
- APK and installed-size measurements must stay within the accepted 100-180 MB APK and approximately 300 MB free-space envelope.

## Acceptance Criteria

The work is complete when all of the following hold:

- With all network connectivity disabled, the APK returns local RAG documents instead of the current `127.0.0.1` connection error.
- A successful game example saved in the APK becomes retrievable by a semantically similar request.
- Saved examples remain available after process death, device restart, and an APK replacement install.
- Seed upgrades do not overwrite user examples.
- Semantic failure returns local keyword results and clearly identifies degraded mode.
- The normal browser build continues to use the current HTTP RAG service.
- Release builds contain no API key and pass the model, knowledge, ABI, database, bridge, and offline device tests.

## Out of Scope

- Fully offline game generation or replacement of the DeepSeek API.
- Synchronizing user examples across devices.
- Importing arbitrary user documents.
- Online web search from the APK RAG path.
- Preserving data after application uninstall.
