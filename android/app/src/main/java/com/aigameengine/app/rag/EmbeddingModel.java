package com.aigameengine.app.rag;

import java.util.List;

public interface EmbeddingModel extends AutoCloseable {
    String version();

    int dimension();

    List<float[]> embedQueries(List<String> texts) throws Exception;

    List<float[]> embedDocuments(List<String> texts) throws Exception;

    @Override
    void close();
}
