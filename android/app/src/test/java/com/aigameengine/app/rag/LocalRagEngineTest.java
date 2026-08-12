package com.aigameengine.app.rag;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;

@RunWith(RobolectricTestRunner.class)
public final class LocalRagEngineTest {
    private Context context;
    private RagDatabase database;

    @Before
    public void setUp() {
        context = RuntimeEnvironment.getApplication();
        database = new RagDatabase(context, "engine-test-" + System.nanoTime() + ".db");
    }

    @After
    public void tearDown() {
        String name = database.getDatabaseName();
        database.close();
        context.deleteDatabase(name);
    }

    @Test
    public void retrievesMaximumAcrossQueriesAndReturnsTopSix() throws Exception {
        List<RagDocument> builtIns = new ArrayList<>();
        builtIns.add(builtIn("boss", "Boss 战斗", "观察攻击前摇", new float[] {1f, 0f}));
        builtIns.add(builtIn("farm", "农场经营", "种植与收获", new float[] {0f, 1f}));
        for (int index = 0; index < 6; index++) {
            builtIns.add(builtIn("extra_" + index, "其他 " + index, "通用设计",
                    VectorMath.normalize(new float[] {0.5f, 0.5f + index * 0.01f})));
        }
        LocalRagEngine engine = engine(new FakeEmbeddingModel(false), builtIns);

        JSONObject result = engine.retrieve(
                new JSONArray().put("亡灵 Boss").put("农场系统"), 6);

        assertEquals("native_semantic", result.getString("runtime_mode"));
        assertEquals(6, result.getJSONArray("documents").length());
        List<String> topTwo = Arrays.asList(
                result.getJSONArray("documents").getJSONObject(0).getString("id"),
                result.getJSONArray("documents").getJSONObject(1).getString("id"));
        assertTrue(topTwo.contains("boss"));
        assertTrue(topTwo.contains("farm"));
        engine.close();
    }

    @Test
    public void semanticFailureReturnsKeywordFallback() throws Exception {
        LocalRagEngine engine = engine(
                new FakeEmbeddingModel(true),
                Arrays.asList(
                        builtIn("boss", "Boss 战斗", "Boss 战斗阶段", new float[] {1f, 0f}),
                        builtIn("farm", "农场经营", "种植", new float[] {0f, 1f})));

        JSONObject result = engine.retrieve(new JSONArray().put("Boss 战斗"), 6);

        assertEquals("native_lexical_fallback", result.getString("runtime_mode"));
        assertEquals("boss", result.getJSONArray("documents").getJSONObject(0).getString("id"));
        engine.close();
    }

    @Test
    public void savesExperienceAndRetrievesItSemantically() throws Exception {
        LocalRagEngine engine = engine(new FakeEmbeddingModel(false),
                Collections.singletonList(builtIn("seed", "基础", "通用设计", new float[] {0f, 1f})));
        JSONObject payload = new JSONObject()
                .put("conversation_id", "saved")
                .put("title", "亡灵领主")
                .put("request", "亡灵 Boss 战斗")
                .put("intent", new JSONObject().put("game_type", "dungeon"))
                .put("game_dsl", new JSONObject().put("boss", "lord"));

        JSONObject saved = engine.saveExperience(payload);
        JSONObject retrieved = engine.retrieve(new JSONArray().put("类似的 Boss"), 20);

        assertTrue(saved.getBoolean("indexed"));
        assertTrue(contains(retrieved, "experience_saved"));
        engine.close();
    }

    @Test
    public void initializationRecoversPendingUserRows() throws Exception {
        long now = System.currentTimeMillis();
        database.insertPendingUser(new RagDocument(
                "experience_pending", RagDocument.ORIGIN_USER, "Boss", "Boss 战斗", "{}",
                null, null, RagDocument.STATE_PENDING, now, now, 0));
        LocalRagEngine engine = engine(new FakeEmbeddingModel(false),
                Collections.singletonList(builtIn("seed", "基础", "通用设计", new float[] {0f, 1f})));

        JSONObject health = engine.health();

        assertEquals("ready", health.getString("state"));
        assertEquals(RagDocument.STATE_READY, database.findById("experience_pending").state);
        assertFalse(database.listReady("model-v1").isEmpty());
        engine.close();
    }

    private LocalRagEngine engine(EmbeddingModel model, List<RagDocument> builtIns) {
        SeedAssetReader.SeedBundle bundle = new SeedAssetReader.SeedBundle(
                builtIns, 1, "model-v1");
        return new LocalRagEngine(database, model, () -> bundle);
    }

    private static RagDocument builtIn(String id, String title, String content, float[] vector) {
        return new RagDocument(id, RagDocument.ORIGIN_BUILT_IN, title, content, "{}", vector,
                "model-v1", RagDocument.STATE_READY, 0, 0, 1);
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

    private static final class FakeEmbeddingModel implements EmbeddingModel {
        private final boolean failQueries;

        private FakeEmbeddingModel(boolean failQueries) {
            this.failQueries = failQueries;
        }

        @Override public String version() { return "model-v1"; }
        @Override public int dimension() { return 2; }

        @Override
        public List<float[]> embedQueries(List<String> texts) throws Exception {
            if (failQueries) {
                throw new Exception("simulated inference failure");
            }
            return embed(texts);
        }

        @Override
        public List<float[]> embedDocuments(List<String> texts) {
            return embed(texts);
        }

        private List<float[]> embed(List<String> texts) {
            List<float[]> vectors = new ArrayList<>();
            for (String text : texts) {
                vectors.add(text.toLowerCase().contains("boss") || text.contains("亡灵")
                        ? new float[] {1f, 0f}
                        : new float[] {0f, 1f});
            }
            return vectors;
        }

        @Override public void close() {}
    }
}
