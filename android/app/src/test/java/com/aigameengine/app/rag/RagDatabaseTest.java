package com.aigameengine.app.rag;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import android.content.Context;
import java.util.Arrays;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;

@RunWith(RobolectricTestRunner.class)
public final class RagDatabaseTest {
    private Context context;
    private RagDatabase database;

    @Before
    public void setUp() {
        context = RuntimeEnvironment.getApplication();
        database = new RagDatabase(context, "rag-test-" + System.nanoTime() + ".db");
    }

    @After
    public void tearDown() {
        String path = database.getDatabaseName();
        database.close();
        context.deleteDatabase(path);
    }

    @Test
    public void builtInImportIsIdempotentAndCannotReplaceUserCollision() {
        database.insertPendingUser(user("collision", 1));
        database.importBuiltIns(Arrays.asList(
                builtIn("seed", 1, 1), builtIn("collision", 1, 1)), 1);
        database.importBuiltIns(Arrays.asList(
                builtIn("seed", 2, 2), builtIn("collision", 2, 2)), 2);

        assertEquals(1, database.countByOrigin(RagDocument.ORIGIN_BUILT_IN));
        assertEquals(1, database.countByOrigin(RagDocument.ORIGIN_USER));
        assertEquals(2, database.findById("seed").seedVersion);
        assertEquals(RagDocument.ORIGIN_USER, database.findById("collision").origin);
    }

    @Test
    public void pendingUserTransitionsToReadyForActiveVersion() {
        database.insertPendingUser(user("experience", 10));
        assertEquals(1, database.listPendingUsers().size());

        database.markReady("experience", new float[] {1f, 0f}, "model-v1");

        assertEquals(0, database.listPendingUsers().size());
        assertEquals(1, database.listReady("model-v1").size());
        assertEquals(0, database.listReady("model-v2").size());
    }

    @Test
    public void modelVersionChangeMarksOnlyUserRowsPending() {
        database.importBuiltIns(Arrays.asList(builtIn("seed", 1, 1)), 1);
        database.insertPendingUser(user("experience", 10));
        database.markReady("experience", new float[] {1f, 0f}, "old");

        database.markUserEmbeddingsPendingExcept("new");

        assertEquals(RagDocument.STATE_READY, database.findById("seed").state);
        assertEquals(RagDocument.STATE_PENDING, database.findById("experience").state);
        assertNull(database.findById("experience").embedding());
    }

    @Test
    public void cleanupKeepsNewestThousandUsersAndAllBuiltIns() {
        database.importBuiltIns(Arrays.asList(builtIn("seed", 1, 1)), 1);
        for (int index = 0; index < 1001; index++) {
            RagDocument document = user(String.format("user_%04d", index), index);
            database.insertPendingUser(document);
            database.markReady(document.id, new float[] {1f, 0f}, "model-v1");
        }

        database.trimUserExamples(1000);

        assertEquals(1000, database.countByOrigin(RagDocument.ORIGIN_USER));
        assertNotNull(database.findById("seed"));
        assertNull(database.findById("user_0000"));
        assertNotNull(database.findById("user_1000"));
    }

    private static RagDocument builtIn(String id, int seedVersion, long timestamp) {
        return new RagDocument(id, RagDocument.ORIGIN_BUILT_IN, id, "content", "{}",
                new float[] {1f, 0f}, "model-v1", RagDocument.STATE_READY,
                timestamp, timestamp, seedVersion);
    }

    private static RagDocument user(String id, long timestamp) {
        return new RagDocument(id, RagDocument.ORIGIN_USER, id, "content", "{}",
                null, null, RagDocument.STATE_PENDING, timestamp, timestamp, 0);
    }
}
