package com.aigameengine.app.rag;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;

public final class RagDatabase extends SQLiteOpenHelper {
    private static final String DEFAULT_NAME = "offline-rag.db";
    private static final int VERSION = 1;

    public RagDatabase(Context context) {
        this(context, DEFAULT_NAME);
    }

    RagDatabase(Context context, String name) {
        super(context, name, null, VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase database) {
        database.execSQL("CREATE TABLE documents ("
                + "id TEXT PRIMARY KEY,"
                + "origin TEXT NOT NULL,"
                + "title TEXT NOT NULL,"
                + "content TEXT NOT NULL,"
                + "metadata_json TEXT NOT NULL,"
                + "embedding BLOB,"
                + "embedding_version TEXT,"
                + "state TEXT NOT NULL,"
                + "created_at INTEGER NOT NULL,"
                + "updated_at INTEGER NOT NULL,"
                + "seed_version INTEGER NOT NULL DEFAULT 0)");
        database.execSQL("CREATE INDEX documents_ready_version ON documents(state, embedding_version)");
        database.execSQL("CREATE INDEX documents_origin_created ON documents(origin, created_at DESC)");
        database.execSQL("CREATE TABLE rag_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion) {
        throw new IllegalStateException("Unsupported RAG database migration: " + oldVersion + " to " + newVersion);
    }

    public void importBuiltIns(List<RagDocument> documents, int seedVersion) {
        SQLiteDatabase database = getWritableDatabase();
        database.beginTransaction();
        try {
            for (RagDocument document : documents) {
                RagDocument existing = findById(database, document.id);
                if (existing != null && RagDocument.ORIGIN_USER.equals(existing.origin)) {
                    continue;
                }
                ContentValues values = valuesFor(document);
                values.put("origin", RagDocument.ORIGIN_BUILT_IN);
                values.put("seed_version", seedVersion);
                database.insertWithOnConflict(
                        "documents", null, values, SQLiteDatabase.CONFLICT_REPLACE);
            }
            ContentValues metadata = new ContentValues();
            metadata.put("key", "seed_version");
            metadata.put("value", Integer.toString(seedVersion));
            database.insertWithOnConflict("rag_meta", null, metadata, SQLiteDatabase.CONFLICT_REPLACE);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    public void insertPendingUser(RagDocument document) {
        ContentValues values = valuesFor(document);
        values.put("origin", RagDocument.ORIGIN_USER);
        values.put("state", RagDocument.STATE_PENDING);
        values.putNull("embedding");
        values.putNull("embedding_version");
        getWritableDatabase().insertWithOnConflict(
                "documents", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public void markReady(String id, float[] vector, String embeddingVersion) {
        ContentValues values = new ContentValues();
        values.put("embedding", encodeVector(vector));
        values.put("embedding_version", embeddingVersion);
        values.put("state", RagDocument.STATE_READY);
        values.put("updated_at", System.currentTimeMillis());
        updateRequired(id, values);
    }

    public void markFailed(String id) {
        ContentValues values = new ContentValues();
        values.put("state", RagDocument.STATE_FAILED);
        values.put("updated_at", System.currentTimeMillis());
        updateRequired(id, values);
    }

    public void markUserEmbeddingsPendingExcept(String embeddingVersion) {
        ContentValues values = new ContentValues();
        values.put("state", RagDocument.STATE_PENDING);
        values.putNull("embedding");
        values.putNull("embedding_version");
        values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().update(
                "documents",
                values,
                "origin=? AND (embedding_version IS NULL OR embedding_version<>?)",
                new String[] {RagDocument.ORIGIN_USER, embeddingVersion});
    }

    public List<RagDocument> listPendingUsers() {
        return query("origin=? AND state=?", new String[] {
                RagDocument.ORIGIN_USER, RagDocument.STATE_PENDING}, "created_at ASC, id ASC");
    }

    public List<RagDocument> listReady(String embeddingVersion) {
        return query("state=? AND embedding_version=?", new String[] {
                RagDocument.STATE_READY, embeddingVersion}, "id ASC");
    }

    public void trimUserExamples(int maximum) {
        if (maximum < 0) {
            throw new IllegalArgumentException("maximum must not be negative");
        }
        getWritableDatabase().execSQL(
                "DELETE FROM documents WHERE id IN ("
                        + "SELECT id FROM documents WHERE origin=? "
                        + "ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?)",
                new Object[] {RagDocument.ORIGIN_USER, maximum});
    }

    public RagDocument findById(String id) {
        return findById(getReadableDatabase(), id);
    }

    public int countByOrigin(String origin) {
        try (Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT COUNT(*) FROM documents WHERE origin=?", new String[] {origin})) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }

    private List<RagDocument> query(String selection, String[] arguments, String orderBy) {
        List<RagDocument> documents = new ArrayList<>();
        try (Cursor cursor = getReadableDatabase().query(
                "documents", null, selection, arguments, null, null, orderBy)) {
            while (cursor.moveToNext()) {
                documents.add(fromCursor(cursor));
            }
        }
        return documents;
    }

    private RagDocument findById(SQLiteDatabase database, String id) {
        try (Cursor cursor = database.query(
                "documents", null, "id=?", new String[] {id}, null, null, null)) {
            return cursor.moveToFirst() ? fromCursor(cursor) : null;
        }
    }

    private void updateRequired(String id, ContentValues values) {
        if (getWritableDatabase().update("documents", values, "id=?", new String[] {id}) != 1) {
            throw new IllegalArgumentException("Unknown RAG document: " + id);
        }
    }

    private static ContentValues valuesFor(RagDocument document) {
        ContentValues values = new ContentValues();
        values.put("id", document.id);
        values.put("origin", document.origin);
        values.put("title", document.title);
        values.put("content", document.content);
        values.put("metadata_json", document.metadataJson);
        float[] embedding = document.embedding();
        if (embedding == null) {
            values.putNull("embedding");
        } else {
            values.put("embedding", encodeVector(embedding));
        }
        if (document.embeddingVersion == null) {
            values.putNull("embedding_version");
        } else {
            values.put("embedding_version", document.embeddingVersion);
        }
        values.put("state", document.state);
        values.put("created_at", document.createdAt);
        values.put("updated_at", document.updatedAt);
        values.put("seed_version", document.seedVersion);
        return values;
    }

    private static RagDocument fromCursor(Cursor cursor) {
        byte[] blob = cursor.getBlob(cursor.getColumnIndexOrThrow("embedding"));
        return new RagDocument(
                cursor.getString(cursor.getColumnIndexOrThrow("id")),
                cursor.getString(cursor.getColumnIndexOrThrow("origin")),
                cursor.getString(cursor.getColumnIndexOrThrow("title")),
                cursor.getString(cursor.getColumnIndexOrThrow("content")),
                cursor.getString(cursor.getColumnIndexOrThrow("metadata_json")),
                blob == null ? null : decodeVector(blob),
                cursor.getString(cursor.getColumnIndexOrThrow("embedding_version")),
                cursor.getString(cursor.getColumnIndexOrThrow("state")),
                cursor.getLong(cursor.getColumnIndexOrThrow("created_at")),
                cursor.getLong(cursor.getColumnIndexOrThrow("updated_at")),
                cursor.getInt(cursor.getColumnIndexOrThrow("seed_version")));
    }

    private static byte[] encodeVector(float[] vector) {
        ByteBuffer buffer = ByteBuffer.allocate(vector.length * Float.BYTES)
                .order(ByteOrder.LITTLE_ENDIAN);
        for (float value : vector) {
            if (!Float.isFinite(value)) {
                throw new IllegalArgumentException("vector contains a non-finite value");
            }
            buffer.putFloat(value);
        }
        return buffer.array();
    }

    private static float[] decodeVector(byte[] blob) {
        if (blob.length % Float.BYTES != 0) {
            throw new IllegalStateException("stored vector has an invalid byte length");
        }
        ByteBuffer buffer = ByteBuffer.wrap(blob).order(ByteOrder.LITTLE_ENDIAN);
        float[] vector = new float[blob.length / Float.BYTES];
        for (int index = 0; index < vector.length; index++) {
            vector[index] = buffer.getFloat();
        }
        return vector;
    }
}
