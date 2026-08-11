package com.aigameengine.app.rag;

import android.content.res.AssetManager;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONException;
import org.json.JSONObject;

public final class SeedAssetReader {
    private static final String ROOT = "rag/";
    private static final byte[] MAGIC = new byte[] {'A', 'G', 'E', 'R', 'A', 'G', '1', 0};
    private static final int DIMENSION = 512;

    private final AssetManager assets;

    public SeedAssetReader(AssetManager assets) {
        this.assets = assets;
    }

    public SeedBundle read() throws IOException, JSONException {
        JSONObject manifest = new JSONObject(readUtf8(ROOT + "model-manifest.json"));
        JSONObject hashes = manifest.getJSONObject("artifacts");
        for (String name : new String[] {
                "model.onnx", "vocab.txt", "seed-documents.jsonl", "seed-vectors.bin"}) {
            String expected = hashes.getString(name);
            String actual = sha256(ROOT + name);
            if (!expected.equals(actual)) {
                throw new IOException("RAG asset hash mismatch: " + name);
            }
        }
        int dimension = manifest.getInt("dimension");
        if (dimension != DIMENSION || manifest.getInt("max_tokens") != 256
                || !"cls".equals(manifest.getString("pooling"))
                || !manifest.getBoolean("l2_normalize")) {
            throw new IOException("Unsupported RAG model contract");
        }
        String revision = manifest.getString("model_revision");
        String embeddingVersion = revision + ":" + hashes.getString("model.onnx");
        int seedVersion = manifest.getInt("artifact_format_version");

        List<JSONObject> rawDocuments = readDocuments();
        Map<String, float[]> vectors = readVectors(rawDocuments.size(), dimension);
        List<RagDocument> documents = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (JSONObject raw : rawDocuments) {
            String id = raw.getString("id");
            if (!ids.add(id)) {
                throw new IOException("Duplicate seed document ID: " + id);
            }
            float[] embedding = vectors.remove(id);
            if (embedding == null) {
                throw new IOException("Missing seed vector: " + id);
            }
            JSONObject metadata = raw.optJSONObject("metadata");
            documents.add(new RagDocument(
                    id,
                    RagDocument.ORIGIN_BUILT_IN,
                    raw.getString("title"),
                    raw.getString("content"),
                    metadata == null ? "{}" : metadata.toString(),
                    embedding,
                    embeddingVersion,
                    RagDocument.STATE_READY,
                    0,
                    0,
                    seedVersion));
        }
        if (!vectors.isEmpty()) {
            throw new IOException("Seed vectors contain unknown document IDs");
        }
        return new SeedBundle(documents, seedVersion, embeddingVersion);
    }

    private List<JSONObject> readDocuments() throws IOException, JSONException {
        List<JSONObject> documents = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                assets.open(ROOT + "seed-documents.jsonl"), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.trim().isEmpty()) {
                    documents.add(new JSONObject(line));
                }
            }
        }
        if (documents.isEmpty()) {
            throw new IOException("RAG seed document file is empty");
        }
        return documents;
    }

    private Map<String, float[]> readVectors(int expectedCount, int expectedDimension)
            throws IOException {
        byte[] payload = readBytes(ROOT + "seed-vectors.bin");
        ByteBuffer buffer = ByteBuffer.wrap(payload).order(ByteOrder.LITTLE_ENDIAN);
        if (buffer.remaining() < MAGIC.length + 8) {
            throw new IOException("Truncated RAG vector header");
        }
        byte[] magic = new byte[MAGIC.length];
        buffer.get(magic);
        for (int index = 0; index < MAGIC.length; index++) {
            if (magic[index] != MAGIC[index]) {
                throw new IOException("Invalid RAG vector magic");
            }
        }
        int count = buffer.getInt();
        int dimension = buffer.getInt();
        if (count != expectedCount || dimension != expectedDimension) {
            throw new IOException("RAG vector header does not match documents");
        }
        Map<String, float[]> vectors = new HashMap<>();
        for (int row = 0; row < count; row++) {
            if (buffer.remaining() < 2) {
                throw new IOException("Truncated RAG vector ID");
            }
            int idLength = Short.toUnsignedInt(buffer.getShort());
            if (idLength == 0 || buffer.remaining() < idLength + dimension * Float.BYTES) {
                throw new IOException("Truncated RAG vector row");
            }
            byte[] idBytes = new byte[idLength];
            buffer.get(idBytes);
            String id = new String(idBytes, StandardCharsets.UTF_8);
            float[] vector = new float[dimension];
            for (int column = 0; column < dimension; column++) {
                float value = buffer.getFloat();
                if (!Float.isFinite(value)) {
                    throw new IOException("RAG vector contains a non-finite value");
                }
                vector[column] = value;
            }
            if (vectors.put(id, vector) != null) {
                throw new IOException("Duplicate RAG vector ID: " + id);
            }
        }
        if (buffer.hasRemaining()) {
            throw new IOException("Unexpected trailing RAG vector bytes");
        }
        return vectors;
    }

    private String sha256(String path) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = assets.open(path)) {
                byte[] chunk = new byte[1024 * 1024];
                int length;
                while ((length = input.read(chunk)) != -1) {
                    digest.update(chunk, 0, length);
                }
            }
            StringBuilder value = new StringBuilder();
            for (byte item : digest.digest()) {
                value.append(String.format("%02x", item & 0xff));
            }
            return value.toString();
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is unavailable", error);
        }
    }

    private String readUtf8(String path) throws IOException {
        return new String(readBytes(path), StandardCharsets.UTF_8);
    }

    private byte[] readBytes(String path) throws IOException {
        try (InputStream input = assets.open(path);
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            int length;
            while ((length = input.read(chunk)) != -1) {
                output.write(chunk, 0, length);
            }
            return output.toByteArray();
        }
    }

    public static final class SeedBundle {
        public final List<RagDocument> documents;
        public final int seedVersion;
        public final String embeddingVersion;

        private SeedBundle(List<RagDocument> documents, int seedVersion, String embeddingVersion) {
            this.documents = Collections.unmodifiableList(new ArrayList<>(documents));
            this.seedVersion = seedVersion;
            this.embeddingVersion = embeddingVersion;
        }
    }
}
