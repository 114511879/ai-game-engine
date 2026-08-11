package com.aigameengine.app.rag;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class AndroidRagBridge implements AutoCloseable {
    private static final String APP_ASSET_PREFIX = "file:///android_asset/web/";
    private static final int MAX_REQUEST_ID_LENGTH = 128;
    private static final int MAX_PAYLOAD_BYTES = 1024 * 1024;

    private final Page page;
    private final RagOperations operations;
    private final ExecutorService executor;
    private volatile boolean closed;

    public AndroidRagBridge(WebView webView, RagOperations operations) {
        this(new WebViewPage(webView), operations, Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "offline-rag");
            thread.setDaemon(true);
            return thread;
        }));
    }

    AndroidRagBridge(Page page, RagOperations operations, ExecutorService executor) {
        this.page = page;
        this.operations = operations;
        this.executor = executor;
    }

    @JavascriptInterface
    public void health(String requestId) {
        dispatch(requestId, () -> operations.health());
    }

    @JavascriptInterface
    public void retrieve(String requestId, String payloadJson) {
        if (!validPayload(requestId, payloadJson)) {
            return;
        }
        dispatch(requestId, () -> {
            JSONObject payload = new JSONObject(payloadJson);
            JSONArray queries = payload.getJSONArray("queries");
            int topK = payload.optInt("top_k", 6);
            return operations.retrieve(queries, topK);
        });
    }

    @JavascriptInterface
    public void saveExperience(String requestId, String payloadJson) {
        if (!validPayload(requestId, payloadJson)) {
            return;
        }
        dispatch(requestId, () -> operations.saveExperience(new JSONObject(payloadJson)));
    }

    private boolean validPayload(String requestId, String payloadJson) {
        if (!validRequestId(requestId)) {
            return false;
        }
        if (payloadJson == null
                || payloadJson.getBytes(StandardCharsets.UTF_8).length > MAX_PAYLOAD_BYTES) {
            reject(requestId, "invalid_payload", "RAG payload exceeds the 1 MiB limit");
            return false;
        }
        return true;
    }

    private void dispatch(String requestId, Callable<JSONObject> work) {
        if (!validRequestId(requestId) || closed) {
            return;
        }
        page.post(() -> {
            if (!closed && trustedPage()) {
                executor.execute(() -> {
                    if (closed) {
                        return;
                    }
                    try {
                        resolve(requestId, work.call());
                    } catch (Exception error) {
                        String message = error.getMessage();
                        reject(requestId, "native_rag_error",
                                message == null ? error.getClass().getSimpleName() : message);
                    }
                });
            }
        });
    }

    private void resolve(String requestId, JSONObject result) {
        callback("resolve", requestId, result.toString());
    }

    private void reject(String requestId, String code, String message) {
        try {
            JSONObject error = new JSONObject().put("code", code).put("message", message);
            callback("reject", requestId, error.toString());
        } catch (JSONException impossible) {
            callback("reject", requestId, "{\"code\":\"native_rag_error\"}");
        }
    }

    private void callback(String method, String requestId, String payloadJson) {
        page.post(() -> {
            if (closed || !trustedPage()) {
                return;
            }
            String script = "window.AGE.NativeRAG." + method + "("
                    + JSONObject.quote(requestId) + "," + JSONObject.quote(payloadJson) + ");";
            page.evaluate(script);
        });
    }

    private boolean trustedPage() {
        String url = page.currentUrl();
        return url != null && url.startsWith(APP_ASSET_PREFIX);
    }

    private static boolean validRequestId(String requestId) {
        return requestId != null && !requestId.isEmpty()
                && requestId.length() <= MAX_REQUEST_ID_LENGTH;
    }

    @Override
    public void close() {
        if (closed) {
            return;
        }
        closed = true;
        executor.shutdownNow();
        operations.close();
    }

    interface Page {
        String currentUrl();

        void post(Runnable runnable);

        void evaluate(String script);
    }

    private static final class WebViewPage implements Page {
        private final WebView webView;

        private WebViewPage(WebView webView) {
            this.webView = webView;
        }

        @Override
        public String currentUrl() {
            return webView.getUrl();
        }

        @Override
        public void post(Runnable runnable) {
            webView.post(runnable);
        }

        @Override
        public void evaluate(String script) {
            webView.evaluateJavascript(script, null);
        }
    }
}
