package com.aigameengine.app.rag;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.aigameengine.app.MainActivity;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class OfflineRagInstrumentedTest {
    @Test(timeout = 180000)
    public void packagedWebViewCallsNativeSemanticBridge() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = InstrumentationRegistry.getInstrumentation().startActivitySync(intent);
        try {
            ViewGroup content = activity.findViewById(android.R.id.content);
            WebView webView = (WebView) content.getChildAt(0);
            waitForJavaScript(webView, "typeof window.AGE==='object'&&typeof AGE.RAGClient==='object'?'ready':''", "ready");
            evaluate(webView,
                    "window.__offlineRagResult='';"
                            + "AGE.RAGClient.retrieve('暗黑地牢亡灵 Boss',{}).then(function(value){"
                            + "window.__offlineRagResult=JSON.stringify(value);});");
            String payload = waitForNonEmptyJavaScript(webView, "window.__offlineRagResult");
            JSONObject result = new JSONObject(payload);
            assertTrue(result.getBoolean("available"));
            assertEquals("native_semantic", result.getString("runtime_mode"));
            assertTrue(result.getJSONArray("documents").length() > 0);
        } finally {
            activity.runOnUiThread(activity::finish);
        }
    }

    @Test(timeout = 180000)
    public void replacementInstallCheckpointPersists() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String databaseName = "offline-rag-replacement-checkpoint.db";
        RagDatabase probe = new RagDatabase(context, databaseName);
        boolean alreadyIndexed;
        try {
            RagDocument existing = probe.findById("experience_replacement_checkpoint");
            alreadyIndexed = existing != null && RagDocument.STATE_READY.equals(existing.state);
        } finally {
            probe.close();
        }

        LocalRagEngine engine = createEngine(context, databaseName);
        try {
            if (!alreadyIndexed) {
                JSONObject saved = engine.saveExperience(new JSONObject()
                        .put("conversation_id", "replacement_checkpoint")
                        .put("title", "Replacement install checkpoint")
                        .put("request", "亡灵 Boss 检索检查点")
                        .put("intent", new JSONObject().put("game_type", "dungeon"))
                        .put("game_dsl", new JSONObject().put("boss", "checkpoint")));
                assertTrue(saved.getBoolean("indexed"));
            }
            JSONObject result = engine.retrieve(new JSONArray().put("亡灵 Boss 检索检查点"), 20);
            assertTrue(contains(result, "experience_replacement_checkpoint"));
        } finally {
            engine.close();
        }
    }

    @Test(timeout = 180000)
    public void packagedModelRetrievesLearnsAndPersistsOffline() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String databaseName = "offline-rag-instrumented.db";
        context.deleteDatabase(databaseName);
        try {
            LocalRagEngine first = createEngine(context, databaseName);
            JSONObject initial = first.retrieve(new JSONArray().put("暗黑地牢亡灵 Boss"), 6);
            assertEquals("native_semantic", initial.getString("runtime_mode"));
            assertTrue(initial.getJSONArray("documents").length() > 0);

            JSONObject saved = first.saveExperience(new JSONObject()
                    .put("conversation_id", "offline_instrumented")
                    .put("title", "亡灵领主地牢")
                    .put("request", "亡灵 Boss 战斗")
                    .put("intent", new JSONObject().put("game_type", "dungeon"))
                    .put("game_dsl", new JSONObject().put("boss", "undead_lord")));
            assertTrue(saved.getBoolean("indexed"));

            JSONObject learned = first.retrieve(new JSONArray().put("亡灵领主地牢战斗"), 20);
            assertTrue(contains(learned, "experience_offline_instrumented"));
            first.close();

            LocalRagEngine reopened = createEngine(context, databaseName);
            JSONObject persisted = reopened.retrieve(new JSONArray().put("类似的亡灵 Boss"), 20);
            assertTrue(contains(persisted, "experience_offline_instrumented"));
            RagDatabase verificationDatabase = new RagDatabase(context, databaseName);
            try {
                assertNotNull(verificationDatabase.findById("experience_offline_instrumented"));
            } finally {
                verificationDatabase.close();
            }
            reopened.close();
        } finally {
            context.deleteDatabase(databaseName);
        }
    }

    private static LocalRagEngine createEngine(Context context, String databaseName) throws Exception {
        return new LocalRagEngine(
                new RagDatabase(context, databaseName),
                OnnxEmbeddingModel.create(context),
                () -> new SeedAssetReader(context.getAssets()).read());
    }

    private static boolean contains(JSONObject result, String id) throws Exception {
        JSONArray documents = result.getJSONArray("documents");
        for (int index = 0; index < documents.length(); index++) {
            if (id.equals(documents.getJSONObject(index).getString("id"))) {
                return true;
            }
        }
        return false;
    }

    private static void waitForJavaScript(WebView webView, String expression, String expected)
            throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 30000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if (expected.equals(evaluate(webView, expression))) {
                return;
            }
            SystemClock.sleep(100);
        }
        throw new AssertionError("Timed out waiting for packaged WebView JavaScript");
    }

    private static String waitForNonEmptyJavaScript(WebView webView, String expression)
            throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 120000;
        while (SystemClock.elapsedRealtime() < deadline) {
            String value = evaluate(webView, expression);
            if (value != null && !value.isEmpty() && !"null".equals(value)) {
                return value;
            }
            SystemClock.sleep(100);
        }
        throw new AssertionError("Timed out waiting for native RAG JavaScript result");
    }

    private static String evaluate(WebView webView, String script) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        webView.post(() -> webView.evaluateJavascript(script, value -> {
            result.set(value);
            latch.countDown();
        }));
        assertTrue("JavaScript evaluation timed out", latch.await(10, TimeUnit.SECONDS));
        String encoded = result.get();
        if (encoded == null || "null".equals(encoded)) {
            return null;
        }
        return new JSONArray("[" + encoded + "]").getString(0);
    }
}
