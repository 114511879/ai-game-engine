package com.aigameengine.app.rag;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayDeque;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

@RunWith(RobolectricTestRunner.class)
public final class AndroidRagBridgeTest {
    @Test
    public void retrieveReturnsImmediatelyThenResolvesEscapedCallback() {
        FakePage page = new FakePage();
        FakeOperations operations = new FakeOperations();
        QueuedExecutor executor = new QueuedExecutor();
        AndroidRagBridge bridge = new AndroidRagBridge(page, operations, executor);

        bridge.retrieve("request\"one", "{\"queries\":[\"Boss\"],\"top_k\":6}");

        assertEquals(0, operations.retrieveCalls);
        assertEquals(1, executor.queued());
        executor.runNext();
        assertEquals(1, operations.retrieveCalls);
        assertTrue(page.scripts.get(0).startsWith("window.AGE.NativeRAG.resolve("));
        assertTrue(page.scripts.get(0).contains("request\\\"one"));
        bridge.close();
    }

    @Test
    public void malformedAndOversizedPayloadsRejectWithoutCallingEngine() {
        FakePage page = new FakePage();
        FakeOperations operations = new FakeOperations();
        QueuedExecutor executor = new QueuedExecutor();
        AndroidRagBridge bridge = new AndroidRagBridge(page, operations, executor);

        bridge.retrieve("bad", "not-json");
        executor.runNext();
        bridge.saveExperience("large", String.join("", Collections.nCopies(1_048_577, "x")));

        assertEquals(0, operations.retrieveCalls);
        assertEquals(0, operations.saveCalls);
        assertEquals(2, page.scripts.size());
        assertTrue(page.scripts.get(0).contains("NativeRAG.reject"));
        assertTrue(page.scripts.get(1).contains("NativeRAG.reject"));
        bridge.close();
    }

    @Test
    public void untrustedPageAndClosedBridgeDoNotReachEngineOrCallback() {
        FakePage page = new FakePage();
        page.url = "https://example.com/";
        FakeOperations operations = new FakeOperations();
        QueuedExecutor executor = new QueuedExecutor();
        AndroidRagBridge bridge = new AndroidRagBridge(page, operations, executor);

        bridge.health("untrusted");
        assertEquals(0, executor.queued());
        assertTrue(page.scripts.isEmpty());

        page.url = "file:///android_asset/web/index.html";
        bridge.health("closed");
        bridge.close();
        executor.runAll();
        assertEquals(0, operations.healthCalls);
        assertTrue(page.scripts.isEmpty());
        assertTrue(operations.closed);
    }

    private static final class FakePage implements AndroidRagBridge.Page {
        private String url = "file:///android_asset/web/index.html";
        private final java.util.ArrayList<String> scripts = new java.util.ArrayList<>();

        @Override public String currentUrl() { return url; }
        @Override public void post(Runnable runnable) { runnable.run(); }
        @Override public void evaluate(String script) { scripts.add(script); }
    }

    private static final class FakeOperations implements RagOperations {
        private int healthCalls;
        private int retrieveCalls;
        private int saveCalls;
        private boolean closed;

        @Override public JSONObject health() throws Exception {
            healthCalls++;
            return new JSONObject().put("state", "ready");
        }

        @Override public JSONObject retrieve(JSONArray queries, int topK) throws Exception {
            retrieveCalls++;
            return new JSONObject().put("documents", new JSONArray());
        }

        @Override public JSONObject saveExperience(JSONObject payload) throws Exception {
            saveCalls++;
            return new JSONObject().put("indexed", true);
        }

        @Override public void close() { closed = true; }
    }

    private static final class QueuedExecutor extends AbstractExecutorService {
        private final ArrayDeque<Runnable> tasks = new ArrayDeque<>();
        private boolean shutdown;

        @Override public void shutdown() { shutdown = true; }
        @Override public List<Runnable> shutdownNow() {
            shutdown = true;
            java.util.ArrayList<Runnable> pending = new java.util.ArrayList<>(tasks);
            tasks.clear();
            return pending;
        }
        @Override public boolean isShutdown() { return shutdown; }
        @Override public boolean isTerminated() { return shutdown && tasks.isEmpty(); }
        @Override public boolean awaitTermination(long timeout, TimeUnit unit) {
            return isTerminated();
        }
        @Override public void execute(Runnable command) {
            if (!shutdown) tasks.add(command);
        }
        int queued() { return tasks.size(); }
        void runNext() {
            Runnable task = tasks.poll();
            if (task != null) task.run();
        }
        void runAll() { while (!tasks.isEmpty()) runNext(); }
    }
}
