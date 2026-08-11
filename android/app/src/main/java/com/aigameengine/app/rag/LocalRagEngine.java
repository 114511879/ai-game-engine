package com.aigameengine.app.rag;

import android.content.Context;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class LocalRagEngine implements AutoCloseable {
    private static final int MAX_TOP_K = 20;
    private static final int MAX_USER_EXAMPLES = 1000;

    private enum State {
        NEW,
        INITIALIZING,
        READY,
        SEMANTIC_FAILED,
        CLOSED
    }

    private final RagDatabase database;
    private final EmbeddingModel model;
    private final SeedProvider seedProvider;
    private State state = State.NEW;

    public static LocalRagEngine create(Context context) throws Exception {
        return new LocalRagEngine(
                new RagDatabase(context),
                OnnxEmbeddingModel.create(context),
                () -> new SeedAssetReader(context.getAssets()).read());
    }

    LocalRagEngine(RagDatabase database, EmbeddingModel model, SeedProvider seedProvider) {
        this.database = database;
        this.model = model;
        this.seedProvider = seedProvider;
    }

    public JSONObject health() throws Exception {
        initialize();
        return new JSONObject()
                .put("state", state == State.READY ? "ready" : "degraded")
                .put("runtime_mode", state == State.READY
                        ? "native_semantic" : "native_lexical_fallback")
                .put("knowledge_count", database.countAll())
                .put("embedding_version", model.version());
    }

    public JSONObject retrieve(JSONArray rawQueries, int requestedTopK) throws Exception {
        initialize();
        List<String> queries = normalizedQueries(rawQueries);
        int topK = Math.max(1, Math.min(MAX_TOP_K, requestedTopK));
        try {
            List<float[]> queryVectors = model.embedQueries(queries);
            List<ScoredDocument> scored = scoreSemantic(
                    database.listReady(model.version()), queries, queryVectors);
            state = State.READY;
            return result(scored, topK, "native_semantic");
        } catch (Exception error) {
            state = State.SEMANTIC_FAILED;
            return result(scoreLexical(database.listAll(), queries), topK,
                    "native_lexical_fallback").put("diagnostic", error.getClass().getSimpleName());
        }
    }

    public JSONObject saveExperience(JSONObject payload) throws Exception {
        initialize();
        String conversationId = payload.optString("conversation_id", "").trim();
        if (conversationId.isEmpty()) {
            throw new IllegalArgumentException("conversation_id is required");
        }
        String id = "experience_" + conversationId;
        String title = payload.optString("title", "Successful game example").trim();
        if (title.isEmpty()) {
            title = "Successful game example";
        }
        String content = experienceContent(payload);
        long now = System.currentTimeMillis();
        JSONObject metadata = new JSONObject()
                .put("type", "experience")
                .put("conversation_id", conversationId)
                .put("source", "on_device");
        database.insertPendingUser(new RagDocument(
                id,
                RagDocument.ORIGIN_USER,
                title,
                content,
                metadata.toString(),
                null,
                null,
                RagDocument.STATE_PENDING,
                now,
                now,
                0));
        try {
            float[] vector = model.embedDocuments(Collections.singletonList(content)).get(0);
            database.markReady(id, vector, model.version());
            database.trimUserExamples(MAX_USER_EXAMPLES);
            return new JSONObject()
                    .put("indexed", true)
                    .put("document_id", id)
                    .put("knowledge_count", database.countAll());
        } catch (IllegalArgumentException | IllegalStateException deterministicError) {
            database.markFailed(id);
            return new JSONObject()
                    .put("indexed", false)
                    .put("document_id", id)
                    .put("error", deterministicError.getMessage());
        } catch (Exception transientError) {
            return new JSONObject()
                    .put("indexed", false)
                    .put("document_id", id)
                    .put("error", transientError.getMessage());
        }
    }

    private synchronized void initialize() throws Exception {
        if (state == State.CLOSED) {
            throw new IllegalStateException("RAG engine is closed");
        }
        if (state != State.NEW) {
            return;
        }
        state = State.INITIALIZING;
        try {
            SeedAssetReader.SeedBundle bundle = seedProvider.read();
            if (!bundle.embeddingVersion.equals(model.version())) {
                throw new IllegalStateException("seed and model embedding versions differ");
            }
            database.importBuiltIns(bundle.documents, bundle.seedVersion);
            database.markUserEmbeddingsPendingExcept(model.version());
            recoverPendingUsers();
            state = State.READY;
        } catch (Exception error) {
            state = State.NEW;
            throw error;
        }
    }

    private void recoverPendingUsers() {
        for (RagDocument document : database.listPendingUsers()) {
            try {
                float[] vector = model.embedDocuments(
                        Collections.singletonList(document.content)).get(0);
                database.markReady(document.id, vector, model.version());
            } catch (IllegalArgumentException | IllegalStateException deterministicError) {
                database.markFailed(document.id);
            } catch (Exception ignored) {
                // Pending rows are retried at the next engine initialization.
            }
        }
        database.trimUserExamples(MAX_USER_EXAMPLES);
    }

    private static List<String> normalizedQueries(JSONArray rawQueries) throws JSONException {
        Set<String> unique = new LinkedHashSet<>();
        for (int index = 0; index < rawQueries.length(); index++) {
            String value = rawQueries.optString(index, "").trim();
            if (!value.isEmpty()) {
                unique.add(value);
            }
        }
        if (unique.isEmpty()) {
            throw new IllegalArgumentException("at least one query is required");
        }
        return new ArrayList<>(unique);
    }

    private static List<ScoredDocument> scoreSemantic(
            List<RagDocument> documents, List<String> queries, List<float[]> queryVectors) {
        List<ScoredDocument> scored = new ArrayList<>();
        for (RagDocument document : documents) {
            float[] documentVector = document.embedding();
            if (documentVector == null) {
                continue;
            }
            float semantic = -1f;
            for (float[] queryVector : queryVectors) {
                semantic = Math.max(semantic, VectorMath.cosine(queryVector, documentVector));
            }
            float lexical = lexicalScore(queries, document);
            scored.add(new ScoredDocument(document, VectorMath.blend(semantic, lexical)));
        }
        sort(scored);
        return scored;
    }

    private static List<ScoredDocument> scoreLexical(
            List<RagDocument> documents, List<String> queries) {
        List<ScoredDocument> scored = new ArrayList<>();
        for (RagDocument document : documents) {
            scored.add(new ScoredDocument(document, lexicalScore(queries, document)));
        }
        sort(scored);
        return scored;
    }

    private static float lexicalScore(List<String> queries, RagDocument document) {
        String text = document.title + " " + document.content;
        float score = 0f;
        for (String query : queries) {
            score = Math.max(score, VectorMath.lexicalOverlap(query, text));
        }
        return score;
    }

    private static void sort(List<ScoredDocument> scored) {
        scored.sort(Comparator
                .comparingDouble((ScoredDocument item) -> item.score)
                .reversed()
                .thenComparing(item -> item.document.id));
    }

    private static JSONObject result(List<ScoredDocument> scored, int topK, String runtimeMode)
            throws JSONException {
        JSONArray documents = new JSONArray();
        int count = Math.min(topK, scored.size());
        float total = 0f;
        for (int index = 0; index < count; index++) {
            ScoredDocument item = scored.get(index);
            total += item.score;
            JSONObject metadata;
            try {
                metadata = new JSONObject(item.document.metadataJson);
            } catch (JSONException error) {
                metadata = new JSONObject();
            }
            documents.put(new JSONObject()
                    .put("id", item.document.id)
                    .put("title", item.document.title)
                    .put("content", item.document.content)
                    .put("score", item.score)
                    .put("metadata", metadata));
        }
        return new JSONObject()
                .put("runtime_mode", runtimeMode)
                .put("documents", documents)
                .put("coverage", count == 0 ? 0 : total / count);
    }

    private static String experienceContent(JSONObject payload) {
        StringBuilder content = new StringBuilder();
        content.append(payload.optString("request", ""));
        JSONObject intent = payload.optJSONObject("intent");
        if (intent != null) {
            content.append("\nIntent: ").append(intent);
        }
        JSONObject gameDsl = payload.optJSONObject("game_dsl");
        if (gameDsl != null) {
            content.append("\nGame DSL: ").append(gameDsl);
        }
        String feedback = payload.optString("feedback", "").trim();
        if (!feedback.isEmpty()) {
            content.append("\nFeedback: ").append(feedback);
        }
        return content.toString();
    }

    @Override
    public synchronized void close() {
        if (state == State.CLOSED) {
            return;
        }
        state = State.CLOSED;
        model.close();
        database.close();
    }

    interface SeedProvider {
        SeedAssetReader.SeedBundle read() throws Exception;
    }

    private static final class ScoredDocument {
        private final RagDocument document;
        private final float score;

        private ScoredDocument(RagDocument document, float score) {
            this.document = document;
            this.score = score;
        }
    }
}
