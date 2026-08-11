# Android Offline RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package a Chinese semantic RAG engine inside the Android APK, preserve up to 1,000 user-saved successful examples, and retain the existing HTTP RAG path for normal browsers.

**Architecture:** Android loads an INT8 ONNX export of `BAAI/bge-small-zh-v1.5`, stores normalized vectors in private SQLite, and exposes asynchronous retrieval/save operations to the packaged WebView. `RAGClient.js` selects the native bridge in the APK and the existing localhost HTTP service elsewhere, while maintaining the current response contract.

**Tech Stack:** Java 8, Android API 26+, SQLiteOpenHelper, ONNX Runtime Android 1.20.0, Gradle 7.5/AGP 7.4.1, JavaScript ES2018, Node.js tests, Python model-preparation tooling.

**Repository note:** The current workspace has no `.git` directory. Commit commands below are required checkpoints when repository metadata is restored; do not initialize a new repository or fabricate history merely to run them.

---

## File Map

**Create:**

- `android/tools/offline_rag_requirements.txt`: pinned preparation dependencies.
- `android/tools/prepare_offline_rag.py`: export, quantization, seed embedding, binary serialization, and manifest generation.
- `android/tools/test_prepare_offline_rag.py`: deterministic asset-format tests.
- `android/app/src/main/ragAssets/rag/*`: generated model, vocabulary, seed documents, seed vectors, and manifest.
- `android/app/src/main/java/com/aigameengine/app/rag/BgeTokenizer.java`: model-compatible tokenization.
- `android/app/src/main/java/com/aigameengine/app/rag/VectorMath.java`: normalization, cosine, lexical overlap, and score blending.
- `android/app/src/main/java/com/aigameengine/app/rag/EmbeddingModel.java`: injectable embedding boundary.
- `android/app/src/main/java/com/aigameengine/app/rag/OnnxEmbeddingModel.java`: ONNX session lifecycle and inference.
- `android/app/src/main/java/com/aigameengine/app/rag/RagDocument.java`: immutable document/result model.
- `android/app/src/main/java/com/aigameengine/app/rag/RagDatabase.java`: schema, seed migration, pending recovery, and retention.
- `android/app/src/main/java/com/aigameengine/app/rag/SeedAssetReader.java`: manifest, JSONL, and binary vector parsing.
- `android/app/src/main/java/com/aigameengine/app/rag/LocalRagEngine.java`: initialization, semantic retrieval, fallback, and experience indexing.
- `android/app/src/main/java/com/aigameengine/app/rag/AndroidRagBridge.java`: asynchronous JavaScript interface.
- `android/app/src/test/java/com/aigameengine/app/rag/*Test.java`: tokenizer, vector, database, asset, engine, and bridge tests.
- `android/app/src/androidTest/java/com/aigameengine/app/rag/OfflineRagInstrumentedTest.java`: real packaged model and WebView bridge smoke test.
- `tests/0811_android_offline_rag_client.test.js`: JavaScript transport and response-contract tests.

**Modify:**

- `android/app/build.gradle`: dependencies, test runner, ABI filters, RAG asset source, and verification tasks.
- `android/app/src/main/java/com/aigameengine/app/MainActivity.java`: engine lifecycle and bridge registration.
- `ai/research/RAGClient.js`: native transport, local query planning, normalization, and HTTP preservation.
- `AI-ENGINE启动.html`: bridge-compatible CSP.
- `game.html`: bridge-compatible CSP.
- `main.js`: native initialization/fallback status labels only.
- `android/README.md`: offline RAG behavior, size, persistence, and verification instructions.
- `README.md`: distinguish desktop HTTP RAG from Android on-device RAG.

### Task 1: Reproducible Model and Seed Asset Pipeline

**Files:**
- Create: `android/tools/offline_rag_requirements.txt`
- Create: `android/tools/prepare_offline_rag.py`
- Create: `android/tools/test_prepare_offline_rag.py`
- Generate: `android/app/src/main/ragAssets/rag/model.onnx`
- Generate: `android/app/src/main/ragAssets/rag/vocab.txt`
- Generate: `android/app/src/main/ragAssets/rag/model-manifest.json`
- Generate: `android/app/src/main/ragAssets/rag/seed-documents.jsonl`
- Generate: `android/app/src/main/ragAssets/rag/seed-vectors.bin`

- [ ] **Step 1: Write failing tests for the binary vector and manifest formats**

Create tests that use temporary files and assert the exact `AGERAG1\0` magic, little-endian count/dimension fields, UTF-8 IDs, float32 payloads, stable SHA-256 values, and manifest fields:

```python
class AssetFormatTest(unittest.TestCase):
    def test_vector_round_trip(self):
        rows = [("doc_a", [0.6, 0.8]), ("文档_b", [1.0, 0.0])]
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "seed-vectors.bin"
            write_seed_vectors(target, rows, dimension=2)
            actual = read_seed_vectors(target)
            self.assertEqual([row[0] for row in actual], [row[0] for row in rows])
            np.testing.assert_allclose(actual[0][1], rows[0][1], rtol=0, atol=1e-6)
            np.testing.assert_allclose(actual[1][1], rows[1][1], rtol=0, atol=1e-6)

    def test_manifest_records_locked_model_contract(self):
        manifest = build_manifest(
            revision=MODEL_REVISION,
            dimension=512,
            max_tokens=256,
            artifacts={"model.onnx": "0" * 64},
        )
        self.assertEqual(manifest["model_revision"], "7999e1d3359715c523056ef9478215996d62a620")
        self.assertEqual(manifest["query_prefix"], "为这个句子生成表示以用于检索相关文章：")
        self.assertEqual(manifest["pooling"], "cls")
        self.assertTrue(manifest["l2_normalize"])
```

- [ ] **Step 2: Run the preparation tests and verify they fail**

Run:

```powershell
& 'C:\Users\administered0\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest android.tools.test_prepare_offline_rag -v
```

Expected: FAIL because `prepare_offline_rag` and its serialization functions do not exist.

- [ ] **Step 3: Add pinned preparation dependencies and implement the pipeline**

Pin these packages:

```text
numpy==1.26.4
onnx==1.17.0
onnxruntime==1.20.0
torch==2.5.1
transformers==4.46.3
```

The script must expose these constants and functions:

```python
MODEL_ID = "BAAI/bge-small-zh-v1.5"
MODEL_REVISION = "7999e1d3359715c523056ef9478215996d62a620"
QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章："
DIMENSION = 512
MAX_TOKENS = 256
MAGIC = b"AGERAG1\0"

def write_seed_vectors(path: Path, rows: list[tuple[str, list[float]]], dimension: int) -> None:
    with path.open("wb") as stream:
        stream.write(MAGIC)
        stream.write(struct.pack("<II", len(rows), dimension))
        for document_id, vector in rows:
            encoded = document_id.encode("utf-8")
            if len(encoded) > 65535 or len(vector) != dimension:
                raise ValueError("invalid seed vector row")
            stream.write(struct.pack("<H", len(encoded)))
            stream.write(encoded)
            stream.write(struct.pack(f"<{dimension}f", *vector))

def l2_normalize(vector: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vector, axis=-1, keepdims=True)
    if np.any(~np.isfinite(norm)) or np.any(norm == 0):
        raise ValueError("invalid embedding norm")
    return vector / norm
```

The command-line pipeline must:

1. Require `--model-cache`, `--seed`, and `--output` paths.
2. Resolve only the locked snapshot directory `models--BAAI--bge-small-zh-v1.5/snapshots/7999e1d3359715c523056ef9478215996d62a620`.
3. Load `AutoTokenizer` and `AutoModel` with `local_files_only=True`.
4. Export a wrapper returning `last_hidden_state` using ONNX opset 17 and dynamic batch/sequence axes.
5. Run `onnxruntime.quantization.quantize_dynamic` with `QuantType.QInt8` and `per_channel=True`.
6. Validate the quantized session inputs and output on both Chinese and Latin fixtures.
7. Copy the vocabulary and canonicalize each JSONL document as UTF-8.
8. Embed document content without the query prefix, take CLS, normalize, and write vectors in document order.
9. Compute artifact SHA-256 values and write an ASCII-keyed UTF-8 manifest with model revision, dimension 512, max tokens 256, CLS pooling, normalization, and query prefix.
10. Delete the unquantized intermediate only after quantized validation succeeds.

- [ ] **Step 4: Run the format tests and generate the real assets**

Install preparation-only packages if absent, then generate from the existing local model cache:

```powershell
$ragExportPackages = 'E:\111\ai-game-engine-rag\export-packages'
& 'C:\Users\administered0\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pip install --target $ragExportPackages -r android\tools\offline_rag_requirements.txt
$env:PYTHONPATH = $ragExportPackages
& 'C:\Users\administered0\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest android.tools.test_prepare_offline_rag -v
& 'C:\Users\administered0\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' android\tools\prepare_offline_rag.py --model-cache 'E:\111\ai-game-engine-rag\models' --seed 'server\knowledge\0806_game_design_seed_v1.jsonl' --output 'android\app\src\main\ragAssets\rag'
```

Expected: tests PASS; the command reports 19 documents, dimension 512, locked revision, and the five generated assets. If dependency installation needs network, request approval rather than changing versions.

- [ ] **Step 5: Commit the reproducible assets checkpoint**

```powershell
git add android/tools android/app/src/main/ragAssets/rag
git commit -m "build: prepare offline RAG model assets"
```

Expected: one commit containing the generator, tests, and locked artifacts. In the current no-`.git` workspace, record this checkpoint in the task log and continue without running Git.

### Task 2: Android Build, ABI, and Asset Verification

**Files:**
- Modify: `android/app/build.gradle`

- [ ] **Step 1: Add a deliberately failing Gradle contract test**

Register `verifyOfflineRagAssets` first with the expected file names, then run it before implementing parsing. Its assertions must require the asset directory, all five files, the locked model revision, vector dimension 512, max tokens 256, and 64-character lowercase artifact hashes.

- [ ] **Step 2: Run the verifier and confirm the incomplete contract fails**

Run:

```powershell
android\gradle-jbr.bat -p android :app:verifyOfflineRagAssets
```

Expected: FAIL because the initial verifier does not yet validate the binary header and asset hashes.

- [ ] **Step 3: Configure dependencies, assets, tests, and ABI filters**

Add these Gradle contracts:

```groovy
dependencies {
    implementation 'com.microsoft.onnxruntime:onnxruntime-android:1.20.0'
    testImplementation 'junit:junit:4.13.2'
    testImplementation 'org.robolectric:robolectric:4.10.3'
    androidTestImplementation 'androidx.test.ext:junit:1.1.5'
    androidTestImplementation 'androidx.test:runner:1.5.2'
}

android {
    defaultConfig {
        testInstrumentationRunner 'androidx.test.runner.AndroidJUnitRunner'
        ndk { abiFilters 'arm64-v8a', 'armeabi-v7a' }
    }
    sourceSets {
        main {
            assets.srcDir(generatedWebAssets)
            assets.srcDir('src/main/ragAssets')
        }
    }
    testOptions { unitTests.includeAndroidResources = true }
}
```

Complete `verifyOfflineRagAssets` using `groovy.json.JsonSlurper`, `MessageDigest`, and `ByteBuffer.order(ByteOrder.LITTLE_ENDIAN)`. Validate `AGERAG1\0`, count 19, dimension 512, unique IDs, exact byte length, finite floats, and manifest hashes. Make `preBuild` and `check` depend on it. Extend `verifyWebAssetSync` so `ragAssets` remains outside the generated web tree.

- [ ] **Step 4: Run build contract tests**

Run:

```powershell
android\gradle-jbr.bat -p android :app:verifyOfflineRagAssets :app:verifyWebAssetSync :app:verifyNoEmbeddedCredentials
```

Expected: BUILD SUCCESSFUL with all five model assets verified and no credential-shaped value.

- [ ] **Step 5: Commit the Android build contract**

```powershell
git add android/app/build.gradle
git commit -m "build: package verified offline RAG assets"
```

### Task 3: Tokenizer and Vector Primitives

**Files:**
- Create: `android/app/src/main/java/com/aigameengine/app/rag/BgeTokenizer.java`
- Create: `android/app/src/main/java/com/aigameengine/app/rag/VectorMath.java`
- Create: `android/app/src/test/java/com/aigameengine/app/rag/BgeTokenizerTest.java`
- Create: `android/app/src/test/java/com/aigameengine/app/rag/VectorMathTest.java`

- [ ] **Step 1: Write failing tokenizer and vector tests**

Use the packaged vocabulary and assert `[CLS]`/`[SEP]`, Chinese token IDs, case folding, punctuation splitting, `[UNK]`, 256-token truncation, attention masks, finite L2 normalization, cosine identity, zero-vector rejection, and the 85/15 blended score:

```java
@Test public void blendUsesSemanticAndLexicalWeights() {
    assertEquals(0.71f, VectorMath.blend(0.8f, 0.2f), 0.0001f);
}

@Test public void encodedInputNeverExceeds256Tokens() throws Exception {
    BgeTokenizer tokenizer = BgeTokenizer.fromAsset(context.getAssets(), "rag/vocab.txt", 256);
    BgeTokenizer.Input input = tokenizer.encode(String.join("", Collections.nCopies(300, "游戏")));
    assertEquals(256, input.inputIds.length);
    assertEquals(tokenizer.sepTokenId(), input.inputIds[255]);
}
```

- [ ] **Step 2: Run the unit tests and verify they fail**

Run:

```powershell
android\gradle-jbr.bat -p android :app:testDebugUnitTest --tests '*BgeTokenizerTest' --tests '*VectorMathTest'
```

Expected: compilation FAIL because both production classes are absent.

- [ ] **Step 3: Implement the minimal primitives**

`BgeTokenizer` must return immutable `long[] inputIds`, `long[] attentionMask`, and `long[] tokenTypeIds`. Implement BERT basic tokenization for whitespace, lowercase Latin text, punctuation boundaries, per-character CJK tokens, and greedy longest-match WordPiece using `##` continuation tokens. Reject a vocabulary missing `[PAD]`, `[UNK]`, `[CLS]`, or `[SEP]`.

`VectorMath` must expose:

```java
static float[] normalize(float[] values)
static float cosine(float[] normalizedLeft, float[] normalizedRight)
static float lexicalOverlap(String query, String document)
static float blend(float semantic, float lexical)
static float clamp01(float value)
```

Lexical overlap uses unique lowercase Latin word tokens plus Chinese character bigrams and computes `intersection/queryTokenCount`. `blend` returns `clamp01(semantic * 0.85f + lexical * 0.15f)`.

- [ ] **Step 4: Run primitive tests**

Run the same Gradle test command.

Expected: all tokenizer and vector tests PASS.

- [ ] **Step 5: Commit primitives**

```powershell
git add android/app/src/main/java/com/aigameengine/app/rag/BgeTokenizer.java android/app/src/main/java/com/aigameengine/app/rag/VectorMath.java android/app/src/test/java/com/aigameengine/app/rag
git commit -m "feat: add BGE tokenizer and vector scoring"
```

### Task 4: Versioned SQLite Knowledge Store

**Files:**
- Create: `android/app/src/main/java/com/aigameengine/app/rag/RagDocument.java`
- Create: `android/app/src/main/java/com/aigameengine/app/rag/SeedAssetReader.java`
- Create: `android/app/src/main/java/com/aigameengine/app/rag/RagDatabase.java`
- Create: `android/app/src/test/java/com/aigameengine/app/rag/SeedAssetReaderTest.java`
- Create: `android/app/src/test/java/com/aigameengine/app/rag/RagDatabaseTest.java`

- [ ] **Step 1: Write failing seed and database tests**

Cover seed parsing, first import, idempotent repeat import, built-in update by `seed_version`, user-row preservation, pending queries, transition to ready, model-version filtering, and the 1,001-row retention boundary:

```java
@Test public void cleanupKeepsNewestThousandUserRowsAndAllBuiltIns() {
    database.insertBuiltIn(fixtureBuiltIn("seed"));
    for (int index = 0; index < 1001; index++) {
        database.insertReadyUser(fixtureUser("user_" + index, index));
    }
    database.trimUserExamples(1000);
    assertEquals(1000, database.countByOrigin("user"));
    assertNotNull(database.findById("seed"));
    assertNull(database.findById("user_0"));
    assertNotNull(database.findById("user_1000"));
}
```

- [ ] **Step 2: Run database tests and verify failure**

Run:

```powershell
android\gradle-jbr.bat -p android :app:testDebugUnitTest --tests '*SeedAssetReaderTest' --tests '*RagDatabaseTest'
```

Expected: compilation FAIL because the data classes do not exist.

- [ ] **Step 3: Implement the document model, asset reader, and database**

Use the exact schema from the approved design. `RagDocument` must contain ID, origin, title, content, metadata JSON, vector, embedding version, state, timestamps, and seed version. Defensive-copy vector arrays.

`SeedAssetReader` must verify the manifest hashes at runtime, parse UTF-8 JSONL with `org.json`, parse the exact little-endian binary format, and join vectors to documents by ID. Reject missing, duplicate, non-finite, or wrong-dimension vectors.

`RagDatabase` must expose transactional methods:

```java
void importBuiltIns(List<RagDocument> documents, int seedVersion)
void insertPendingUser(RagDocument document)
void markReady(String id, float[] vector, String embeddingVersion)
void markFailed(String id)
void markUserEmbeddingsPendingExcept(String embeddingVersion)
List<RagDocument> listPendingUsers()
List<RagDocument> listReady(String embeddingVersion)
void trimUserExamples(int maximum)
RagDocument findById(String id)
```

Use `SQLiteStatement.bindBlob` for vectors and `ByteBuffer` little-endian conversion. Import built-ins with `origin='built_in'` predicates so a colliding seed ID can never replace a user row.

- [ ] **Step 4: Run database tests**

Run the same database test command.

Expected: all seed and database tests PASS.

- [ ] **Step 5: Commit persistence**

```powershell
git add android/app/src/main/java/com/aigameengine/app/rag android/app/src/test/java/com/aigameengine/app/rag
git commit -m "feat: add persistent offline RAG store"
```

### Task 5: ONNX Embedding Adapter

**Files:**
- Create: `android/app/src/main/java/com/aigameengine/app/rag/EmbeddingModel.java`
- Create: `android/app/src/main/java/com/aigameengine/app/rag/OnnxEmbeddingModel.java`
- Create: `android/app/src/test/java/com/aigameengine/app/rag/OnnxEmbeddingModelContractTest.java`

- [ ] **Step 1: Write failing lifecycle and validation tests**

Define a fake session factory so JVM tests do not load an Android native library. Test lazy single initialization, query-prefix application only for queries, batch shapes, CLS extraction, normalization, non-finite rejection, wrong-dimension rejection, and idempotent close.

```java
public interface EmbeddingModel extends AutoCloseable {
    String version();
    int dimension();
    List<float[]> embedQueries(List<String> texts) throws Exception;
    List<float[]> embedDocuments(List<String> texts) throws Exception;
    @Override void close();
}
```

- [ ] **Step 2: Run the embedding contract test and verify failure**

Run:

```powershell
android\gradle-jbr.bat -p android :app:testDebugUnitTest --tests '*OnnxEmbeddingModelContractTest'
```

Expected: compilation FAIL because the embedding boundary and adapter are absent.

- [ ] **Step 3: Implement ONNX inference behind the injectable boundary**

Load `model-manifest.json`, `vocab.txt`, and `model.onnx` from assets. Copy the ONNX asset once to `context.getNoBackupFilesDir()/rag-model/<sha256>.onnx` because `OrtSession` requires a filesystem path; verify its hash before session creation. Feed `[batch, sequence]` int64 tensors for the three BERT inputs, read `last_hidden_state`, take `[batch][0][0..511]`, normalize, and close all `OnnxTensor` and `OrtSession.Result` objects with try-with-resources.

Use one lazily created `OrtEnvironment`, one session, and a synchronized inference block. `close()` closes the session but not the process-wide environment.

- [ ] **Step 4: Run embedding contract tests**

Run the same Gradle test command.

Expected: all fake-session lifecycle and shape tests PASS without loading native ONNX code.

- [ ] **Step 5: Commit the model adapter**

```powershell
git add android/app/src/main/java/com/aigameengine/app/rag/EmbeddingModel.java android/app/src/main/java/com/aigameengine/app/rag/OnnxEmbeddingModel.java android/app/src/test/java/com/aigameengine/app/rag/OnnxEmbeddingModelContractTest.java
git commit -m "feat: run BGE embeddings with ONNX Runtime"
```

### Task 6: Retrieval, Fallback, and Experience Indexing

**Files:**
- Create: `android/app/src/main/java/com/aigameengine/app/rag/LocalRagEngine.java`
- Create: `android/app/src/test/java/com/aigameengine/app/rag/LocalRagEngineTest.java`

- [ ] **Step 1: Write failing engine behavior tests with a fake embedder**

Cover lazy seed import, maximum similarity across three queries, 85/15 reranking, top-six order, coverage calculation, semantic runtime mode, keyword fallback after embedding failure, pending-first experience saving, pending recovery, model-version reindexing, failed indexing, and cleanup after ready commit.

```java
@Test public void semanticFailureReturnsLocalKeywordResults() throws Exception {
    FakeEmbeddingModel model = FakeEmbeddingModel.alwaysFailing();
    LocalRagEngine engine = fixtureEngine(model, documents("Boss 战斗", "农场经营"));
    JSONObject result = engine.retrieve(new JSONArray().put("Boss 战斗"), 6);
    assertEquals("native_lexical_fallback", result.getString("runtime_mode"));
    assertEquals("Boss 战斗", result.getJSONArray("documents").getJSONObject(0).getString("title"));
}
```

- [ ] **Step 2: Run engine tests and verify failure**

Run:

```powershell
android\gradle-jbr.bat -p android :app:testDebugUnitTest --tests '*LocalRagEngineTest'
```

Expected: compilation FAIL because `LocalRagEngine` is absent.

- [ ] **Step 3: Implement the engine state machine**

Use states `NEW`, `INITIALIZING`, `READY`, `SEMANTIC_FAILED`, and `CLOSED`. Provide `static LocalRagEngine create(Context context)` for production plus a package-private dependency-injected constructor for tests. `initialize()` verifies/imports seed assets exactly once, marks user rows from older embedding versions as pending, and queues them for re-embedding. Provide `health()`, `retrieve(JSONArray queries, int topK)`, and `saveExperience(JSONObject payload)`. Retrieval rejects empty input and clamps `topK` to 1-20. Semantic results search only ready vectors for the active embedding version. Coverage is the mean of returned clamped scores, or zero with no results.

`saveExperience(JSONObject payload)` must build stable ID `experience_<conversation_id>`, serialize request/intent/game DSL/feedback into content, insert `pending`, embed as a document, mark ready, then trim to 1,000. It returns `indexed=true` only after ready commit; on failure it returns `indexed=false` and preserves pending for retry unless the error is a deterministic input/model output failure. Retention cleanup runs only after the new or updated row reaches `ready`.

- [ ] **Step 4: Run all pure JVM RAG tests**

Run:

```powershell
android\gradle-jbr.bat -p android :app:testDebugUnitTest
```

Expected: all tokenizer, vector, asset, database, embedding-contract, and engine tests PASS.

- [ ] **Step 5: Commit the engine**

```powershell
git add android/app/src/main/java/com/aigameengine/app/rag/LocalRagEngine.java android/app/src/test/java/com/aigameengine/app/rag/LocalRagEngineTest.java
git commit -m "feat: retrieve and learn with offline RAG"
```

### Task 7: Asynchronous WebView Bridge

**Files:**
- Create: `android/app/src/main/java/com/aigameengine/app/rag/AndroidRagBridge.java`
- Create: `android/app/src/test/java/com/aigameengine/app/rag/AndroidRagBridgeTest.java`

- [ ] **Step 1: Write failing bridge tests**

Test immediate return, single-executor dispatch, payload limits, required request IDs, packaged-main-page enforcement, JSON-safe callback encoding, UI-thread delivery, engine-error rejection, and ignored callback after close.

Use exact callback forms:

```java
"window.AGE.NativeRAG.resolve(" + JSONObject.quote(requestId) + "," + JSONObject.quote(resultJson) + ");"
"window.AGE.NativeRAG.reject(" + JSONObject.quote(requestId) + "," + JSONObject.quote(errorJson) + ");"
```

- [ ] **Step 2: Run the bridge test and verify failure**

Run:

```powershell
android\gradle-jbr.bat -p android :app:testDebugUnitTest --tests '*AndroidRagBridgeTest'
```

Expected: compilation FAIL because the bridge is absent.

- [ ] **Step 3: Implement the bridge**

Expose `health(String requestId)`, `retrieve(String requestId, String payloadJson)`, and `saveExperience(String requestId, String payloadJson)` with `@JavascriptInterface`. Limit IDs to 128 characters and payloads to 1 MiB. Before dispatch and before callback, require `webView.getUrl().startsWith("file:///android_asset/web/")`. Use `webView.post` and `evaluateJavascript`; never perform model/database work on the UI thread. `close()` marks the bridge closed, shuts down the executor, and closes the engine.

- [ ] **Step 4: Run bridge and complete JVM tests**

Run:

```powershell
android\gradle-jbr.bat -p android :app:testDebugUnitTest
```

Expected: all tests PASS.

- [ ] **Step 5: Commit the bridge**

```powershell
git add android/app/src/main/java/com/aigameengine/app/rag/AndroidRagBridge.java android/app/src/test/java/com/aigameengine/app/rag/AndroidRagBridgeTest.java
git commit -m "feat: expose offline RAG to WebView"
```

### Task 8: JavaScript Native Transport and Response Compatibility

**Files:**
- Create: `tests/0811_android_offline_rag_client.test.js`
- Modify: `ai/research/RAGClient.js:1-23`

- [ ] **Step 1: Write failing Node tests for both transports**

Load `RAGClient.js` in a `vm` sandbox. Test native detection, unique request IDs, rewritten query construction, resolve/reject correlation, timeout cleanup, no localhost fetch in Android, result normalization, experience saving, and unchanged HTTP URLs when no bridge exists.

```javascript
assert.deepStrictEqual(nativePayload.queries, [
  '生成暗黑地牢亡灵 Boss',
  'dungeon dark_chinese_myth third_person',
  'souls_like hard boss skills'
]);
assert.strictEqual(fetchCalls[0].url, 'http://127.0.0.1:8765/api/rag/retrieve');
assert.strictEqual(nativeResult.web_search_used, false);
assert.deepStrictEqual(nativeResult.source_counts, { local: 2, web: 0 });
```

- [ ] **Step 2: Run the Node test and verify failure**

Run:

```powershell
node tests\0811_android_offline_rag_client.test.js
```

Expected: FAIL because `AGE.NativeRAG` and native transport selection do not exist.

- [ ] **Step 3: Refactor `RAGClient.js` behind a transport-neutral contract**

Create `AGE.NativeRAG` with a `Map` of pending promises and these exact callback signatures:

```javascript
A.NativeRAG={
  resolve:function(id,resultJson){ settle(id,true,resultJson); },
  reject:function(id,errorJson){ settle(id,false,errorJson); }
};
```

Build at most three non-empty, deduplicated query strings from the raw query and normalized Intent DSL. The native payload is `{queries, top_k:6}`. Normalize native results to include `available`, `plan.rewritten_queries`, `plan.limitations`, `documents`, `coverage`, `context_text`, `runtime_mode`, `source_counts`, `web_search_needed=false`, `web_search_used=false`, and `web_sources=[]`.

Use native timeouts of 45 seconds for first retrieval and 30 seconds for experience indexing. Preserve the existing HTTP paths and timeouts byte-for-byte where practical. Translate abort, native timeout, initialization, and fallback states to valid UTF-8 Chinese messages; replace the existing mojibake error literals while touching this file.

- [ ] **Step 4: Run JavaScript RAG regression tests**

Run:

```powershell
node tests\0811_android_offline_rag_client.test.js
node tests\0806_rag_ui_v1.test.js
```

Expected: the new transport test PASS; the existing RAG UI regression PASS with its localhost route stubs.

- [ ] **Step 5: Commit the compatible client**

```powershell
git add ai/research/RAGClient.js tests/0811_android_offline_rag_client.test.js
git commit -m "feat: select native offline RAG in Android"
```

### Task 9: Activity Lifecycle, CSP, and User Status

**Files:**
- Modify: `android/app/src/main/java/com/aigameengine/app/MainActivity.java:1-121`
- Modify: `android/app/build.gradle` in `verifyMainActivityContract`
- Modify: `AI-ENGINE启动.html` in `<head>`
- Modify: `game.html` in `<head>`
- Modify: `main.js:439-491`

- [ ] **Step 1: Extend failing build and UI contract checks**

Require these strings in `verifyMainActivityContract`:

```text
addJavascriptInterface
"AndroidRag"
new LocalRagEngine
ragBridge.close()
removeJavascriptInterface("AndroidRag")
```

Add Node assertions that native semantic mode displays “本机语义知识库”, initialization displays “正在初始化本机知识库”, and fallback displays “本机关键词降级检索”.

- [ ] **Step 2: Run contracts and verify failure**

Run:

```powershell
android\gradle-jbr.bat -p android :app:verifyMainActivityContract
node tests\0811_android_offline_rag_client.test.js
```

Expected: FAIL because MainActivity and status rendering do not yet contain the new contracts.

- [ ] **Step 3: Register and dispose the native engine safely**

In `MainActivity.onCreate`, after WebView settings are complete and before `loadUrl`, construct `LocalRagEngine`, construct `AndroidRagBridge`, and call:

```java
webView.addJavascriptInterface(ragBridge, "AndroidRag");
```

In `onDestroy`, call `removeJavascriptInterface("AndroidRag")`, then `ragBridge.close()`, then destroy the WebView. Preserve all existing navigation, lifecycle, runtime API key, and error-page behavior.

Add a CSP meta tag to both packaged application pages. It must block frames and objects while allowing packaged scripts/styles/images and the existing DeepSeek HTTPS connection:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self' file: data: blob:; script-src 'self' 'unsafe-inline' file:; style-src 'self' 'unsafe-inline' file:; img-src 'self' file: data: blob:; connect-src https://api.deepseek.com http://127.0.0.1:8765; frame-src 'none'; object-src 'none'; base-uri 'self'">
```

Update only RAG status copy in `main.js`; do not change generation flow or add a new settings surface.

- [ ] **Step 4: Run build and client contracts**

Run:

```powershell
android\gradle-jbr.bat -p android :app:verifyMainActivityContract :app:testDebugUnitTest
node tests\0811_android_offline_rag_client.test.js
```

Expected: all contracts and tests PASS.

- [ ] **Step 5: Commit lifecycle integration**

```powershell
git add android/app/src/main/java/com/aigameengine/app/MainActivity.java android/app/build.gradle AI-ENGINE启动.html game.html main.js
git commit -m "feat: integrate offline RAG with Android lifecycle"
```

### Task 10: Real-Model Instrumentation, APK Verification, and Documentation

**Files:**
- Create: `android/app/src/androidTest/java/com/aigameengine/app/rag/OfflineRagInstrumentedTest.java`
- Modify: `android/README.md`
- Modify: `README.md:50-76`

- [ ] **Step 1: Write the failing real-model instrumentation test**

The test must initialize the packaged model, retrieve “暗黑地牢亡灵 Boss”, assert semantic mode and at least one built-in hit, save a uniquely named successful example, retrieve a semantically similar phrase, and assert the new experience ID appears. A second test closes/reopens the engine with the same application database and asserts the experience remains ready.

```java
@Test public void packagedModelRetrievesAndLearnsOffline() throws Exception {
    LocalRagEngine engine = LocalRagEngine.create(context);
    JSONObject first = engine.retrieve(new JSONArray().put("暗黑地牢亡灵 Boss"), 6);
    assertEquals("native_semantic", first.getString("runtime_mode"));
    assertTrue(first.getJSONArray("documents").length() > 0);
    JSONObject saved = engine.saveExperience(experienceFixture("offline_instrumented"));
    assertTrue(saved.getBoolean("indexed"));
    JSONObject learned = engine.retrieve(new JSONArray().put("亡灵领主地牢战斗"), 20);
    assertTrue(containsDocument(learned, "experience_offline_instrumented"));
    engine.close();
}
```

- [ ] **Step 2: Run the instrumentation test and verify the first failure**

With an emulator connected, run:

```powershell
android\gradle-jbr.bat -p android :app:connectedDebugAndroidTest
```

Expected before final wiring: FAIL at model initialization, packaging, or semantic retrieval rather than silently passing through keyword fallback.

- [ ] **Step 3: Fix only integration defects exposed by the real model**

Align ONNX input/output names with the generated manifest, confirm `arm64-v8a` native libraries load, verify CLS output and tokenizer parity against Python fixture vectors, and keep the semantic-vs-fallback assertion strict. Add the exact fixture input and expected cosine tolerance to the manifest so future model rebuilds cannot drift unnoticed.

- [ ] **Step 4: Document runtime behavior and operational limits**

Update both READMEs to state:

- Android RAG is fully on-device and does not use `127.0.0.1`.
- DeepSeek consultation/generation still requires network access and a user-provided key.
- The APK includes the BGE model, supports API 26+, and targets ARM devices.
- User examples survive restart and replacement install, are capped at 1,000, and are removed on uninstall.
- Model preparation uses the locked local snapshot and the exact command from Task 1.
- Desktop/browser RAG still uses `server/run_rag.ps1`.

- [ ] **Step 5: Run the full verification matrix**

Run:

```powershell
& 'C:\Users\administered0\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest android.tools.test_prepare_offline_rag -v
node tests\0811_android_offline_rag_client.test.js
node tests\0806_rag_ui_v1.test.js
android\gradle-jbr.bat -p android :app:check :app:assembleDebug :app:connectedDebugAndroidTest
```

Expected: all Python, Node, JVM, Gradle contract, build, and device tests PASS. `android/app/build/outputs/apk/debug/app-debug.apk` exists, contains the five RAG assets and only approved ABIs, contains no credential-shaped value, and is no larger than 180 MB. The installed application with an empty user index uses no more than 300 MB.

Then enable airplane mode on the emulator/device and manually verify this sequence without starting `server/run_rag.ps1`:

1. Open the APK and perform a local RAG retrieval.
2. Confirm the research panel reports the on-device semantic knowledge base.
3. Save a successful example.
4. Search with different but semantically similar Chinese wording and confirm the example is returned.
5. Force-stop and reopen the application; repeat the search.
6. Install the newly built APK with `adb install -r`; repeat the search.

- [ ] **Step 6: Commit the verified offline APK feature**

```powershell
git add android/app/src/androidTest android/README.md README.md
git commit -m "test: verify Android offline RAG end to end"
```

Expected: final checkpoint with clean verification evidence. In the current no-`.git` workspace, report every verification result and the missing repository metadata instead of claiming commits were created.
