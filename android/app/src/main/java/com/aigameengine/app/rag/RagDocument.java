package com.aigameengine.app.rag;

import java.util.Arrays;

public final class RagDocument {
    public static final String ORIGIN_BUILT_IN = "built_in";
    public static final String ORIGIN_USER = "user";
    public static final String STATE_PENDING = "pending";
    public static final String STATE_READY = "ready";
    public static final String STATE_FAILED = "failed";

    public final String id;
    public final String origin;
    public final String title;
    public final String content;
    public final String metadataJson;
    private final float[] embedding;
    public final String embeddingVersion;
    public final String state;
    public final long createdAt;
    public final long updatedAt;
    public final int seedVersion;

    public RagDocument(
            String id,
            String origin,
            String title,
            String content,
            String metadataJson,
            float[] embedding,
            String embeddingVersion,
            String state,
            long createdAt,
            long updatedAt,
            int seedVersion) {
        if (isBlank(id) || isBlank(origin) || isBlank(title) || content == null
                || metadataJson == null || isBlank(state)) {
            throw new IllegalArgumentException("document has missing required fields");
        }
        this.id = id;
        this.origin = origin;
        this.title = title;
        this.content = content;
        this.metadataJson = metadataJson;
        this.embedding = embedding == null ? null : Arrays.copyOf(embedding, embedding.length);
        this.embeddingVersion = embeddingVersion;
        this.state = state;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.seedVersion = seedVersion;
    }

    public float[] embedding() {
        return embedding == null ? null : Arrays.copyOf(embedding, embedding.length);
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
