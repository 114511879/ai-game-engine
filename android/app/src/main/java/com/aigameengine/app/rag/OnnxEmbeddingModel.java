package com.aigameengine.app.rag;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OnnxValue;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;
import android.content.Context;
import android.content.res.AssetManager;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONObject;

public final class OnnxEmbeddingModel implements EmbeddingModel {
    private static final String MODEL_ROOT = "rag/";

    private final BgeTokenizer tokenizer;
    private final BackendFactory backendFactory;
    private final String version;
    private final int dimension;
    private final String queryPrefix;
    private final Object lock = new Object();
    private Backend backend;
    private boolean closed;

    OnnxEmbeddingModel(
            BgeTokenizer tokenizer,
            BackendFactory backendFactory,
            String version,
            int dimension,
            String queryPrefix) {
        this.tokenizer = tokenizer;
        this.backendFactory = backendFactory;
        this.version = version;
        this.dimension = dimension;
        this.queryPrefix = queryPrefix;
    }

    public static OnnxEmbeddingModel create(Context context) throws Exception {
        AssetManager assets = context.getAssets();
        JSONObject manifest = new JSONObject(readUtf8(assets, MODEL_ROOT + "model-manifest.json"));
        int dimension = manifest.getInt("dimension");
        int maxTokens = manifest.getInt("max_tokens");
        String revision = manifest.getString("model_revision");
        String modelHash = manifest.getJSONObject("artifacts").getString("model.onnx");
        String queryPrefix = manifest.getString("query_prefix");
        BgeTokenizer tokenizer = BgeTokenizer.fromAsset(assets, MODEL_ROOT + "vocab.txt", maxTokens);
        return new OnnxEmbeddingModel(
                tokenizer,
                () -> new OrtBackend(materializeModel(context, assets, modelHash)),
                revision + ":" + modelHash,
                dimension,
                queryPrefix);
    }

    @Override
    public String version() {
        return version;
    }

    @Override
    public int dimension() {
        return dimension;
    }

    @Override
    public List<float[]> embedQueries(List<String> texts) throws Exception {
        List<String> prefixed = new ArrayList<>(texts.size());
        for (String text : texts) {
            prefixed.add(queryPrefix + (text == null ? "" : text));
        }
        return embed(prefixed);
    }

    @Override
    public List<float[]> embedDocuments(List<String> texts) throws Exception {
        return embed(texts);
    }

    private List<float[]> embed(List<String> texts) throws Exception {
        if (texts.isEmpty()) {
            return Collections.emptyList();
        }
        long[][] inputIds = new long[texts.size()][];
        long[][] attentionMasks = new long[texts.size()][];
        long[][] tokenTypeIds = new long[texts.size()][];
        for (int index = 0; index < texts.size(); index++) {
            BgeTokenizer.Input input = tokenizer.encode(texts.get(index));
            inputIds[index] = input.inputIds;
            attentionMasks[index] = input.attentionMask;
            tokenTypeIds[index] = input.tokenTypeIds;
        }

        float[][] raw;
        synchronized (lock) {
            ensureOpen();
            if (backend == null) {
                backend = backendFactory.create();
            }
            raw = backend.infer(inputIds, attentionMasks, tokenTypeIds);
        }
        if (raw.length != texts.size()) {
            throw new IllegalStateException("embedding batch size mismatch");
        }
        List<float[]> embeddings = new ArrayList<>(raw.length);
        for (float[] vector : raw) {
            if (vector.length != dimension) {
                throw new IllegalStateException("embedding dimension mismatch");
            }
            embeddings.add(VectorMath.normalize(vector));
        }
        return embeddings;
    }

    @Override
    public void close() {
        synchronized (lock) {
            if (closed) {
                return;
            }
            closed = true;
            if (backend != null) {
                try {
                    backend.close();
                } catch (Exception error) {
                    throw new IllegalStateException("failed to close ONNX backend", error);
                } finally {
                    backend = null;
                }
            }
        }
    }

    private void ensureOpen() {
        if (closed) {
            throw new IllegalStateException("embedding model is closed");
        }
    }

    private static File materializeModel(Context context, AssetManager assets, String expectedHash)
            throws IOException {
        File directory = new File(context.getNoBackupFilesDir(), "rag-model");
        if (!directory.isDirectory() && !directory.mkdirs()) {
            throw new IOException("could not create RAG model directory");
        }
        File target = new File(directory, expectedHash + ".onnx");
        if (target.isFile() && expectedHash.equals(sha256(target))) {
            return target;
        }
        File temporary = new File(directory, expectedHash + ".tmp");
        try (InputStream input = assets.open(MODEL_ROOT + "model.onnx");
                FileOutputStream output = new FileOutputStream(temporary)) {
            byte[] chunk = new byte[1024 * 1024];
            int length;
            while ((length = input.read(chunk)) != -1) {
                output.write(chunk, 0, length);
            }
            output.getFD().sync();
        }
        if (!expectedHash.equals(sha256(temporary))) {
            temporary.delete();
            throw new IOException("packaged ONNX model hash mismatch");
        }
        if (target.exists() && !target.delete()) {
            temporary.delete();
            throw new IOException("could not replace stale ONNX model");
        }
        if (!temporary.renameTo(target)) {
            temporary.delete();
            throw new IOException("could not publish ONNX model");
        }
        return target;
    }

    private static String readUtf8(AssetManager assets, String path) throws IOException {
        try (InputStream input = assets.open(path);
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            int length;
            while ((length = input.read(chunk)) != -1) {
                output.write(chunk, 0, length);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static String sha256(File file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = new FileInputStream(file)) {
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

    interface BackendFactory {
        Backend create() throws Exception;
    }

    interface Backend extends AutoCloseable {
        float[][] infer(long[][] inputIds, long[][] attentionMask, long[][] tokenTypeIds)
                throws Exception;

        @Override
        void close() throws Exception;
    }

    private static final class OrtBackend implements Backend {
        private final OrtEnvironment environment;
        private final OrtSession session;

        private OrtBackend(File modelFile) throws OrtException {
            environment = OrtEnvironment.getEnvironment();
            try (OrtSession.SessionOptions options = new OrtSession.SessionOptions()) {
                options.setIntraOpNumThreads(Math.max(1, Math.min(2,
                        Runtime.getRuntime().availableProcessors())));
                session = environment.createSession(modelFile.getAbsolutePath(), options);
            }
            Set<String> inputs = session.getInputNames();
            if (!inputs.contains("input_ids") || !inputs.contains("attention_mask")
                    || !inputs.contains("token_type_ids") || inputs.size() != 3
                    || !session.getOutputNames().contains("last_hidden_state")) {
                session.close();
                throw new OrtException("unexpected ONNX model contract");
            }
        }

        @Override
        public float[][] infer(long[][] inputIds, long[][] attentionMask, long[][] tokenTypeIds)
                throws OrtException {
            try (OnnxTensor ids = OnnxTensor.createTensor(environment, inputIds);
                    OnnxTensor masks = OnnxTensor.createTensor(environment, attentionMask);
                    OnnxTensor types = OnnxTensor.createTensor(environment, tokenTypeIds)) {
                Map<String, OnnxTensor> inputs = new HashMap<>();
                inputs.put("input_ids", ids);
                inputs.put("attention_mask", masks);
                inputs.put("token_type_ids", types);
                try (OrtSession.Result result = session.run(inputs)) {
                    OnnxValue value = result.get("last_hidden_state")
                            .orElseThrow(() -> new IllegalStateException("missing ONNX output"));
                    Object raw = value.getValue();
                    if (!(raw instanceof float[][][])) {
                        throw new IllegalStateException("unexpected ONNX output type");
                    }
                    float[][][] hidden = (float[][][]) raw;
                    float[][] cls = new float[hidden.length][];
                    for (int index = 0; index < hidden.length; index++) {
                        if (hidden[index].length == 0) {
                            throw new IllegalStateException("empty ONNX sequence output");
                        }
                        cls[index] = hidden[index][0].clone();
                    }
                    return cls;
                }
            }
        }

        @Override
        public void close() throws OrtException {
            session.close();
        }
    }
}
