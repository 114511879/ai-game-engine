package com.aigameengine.app.rag;

import org.json.JSONArray;
import org.json.JSONObject;

public interface RagOperations extends AutoCloseable {
    JSONObject health() throws Exception;

    JSONObject retrieve(JSONArray queries, int topK) throws Exception;

    JSONObject saveExperience(JSONObject payload) throws Exception;

    @Override
    void close();
}
