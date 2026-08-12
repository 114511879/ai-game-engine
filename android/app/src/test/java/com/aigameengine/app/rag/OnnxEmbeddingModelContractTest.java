package com.aigameengine.app.rag;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public final class OnnxEmbeddingModelContractTest {
    private static final List<String> VOCABULARY = Arrays.asList(
            "[PAD]", "[UNK]", "[CLS]", "[SEP]", "为", "这", "个", "句", "子", "生",
            "成", "表", "示", "以", "用", "于", "检", "索", "相", "关", "文", "章",
            "：", "测", "试");

    @Test
    public void initializesOncePrefixesOnlyQueriesAndNormalizes() throws Exception {
        AtomicInteger creations = new AtomicInteger();
        RecordingBackend backend = new RecordingBackend(new float[][] {{3f, 4f}});
        OnnxEmbeddingModel model = new OnnxEmbeddingModel(
                BgeTokenizer.fromVocabulary(VOCABULARY, 32),
                () -> {
                    creations.incrementAndGet();
                    return backend;
                },
                "model-v1",
                2,
                "为这个句子生成表示以用于检索相关文章：");

        float[] query = model.embedQueries(Collections.singletonList("测试")).get(0);
        model.embedDocuments(Collections.singletonList("测试"));

        assertArrayEquals(new float[] {0.6f, 0.8f}, query, 0.0001f);
        assertEquals(1, creations.get());
        assertEquals(4, backend.firstTokens.get(0).longValue());
        assertEquals(23, backend.firstTokens.get(1).longValue());
        model.close();
        model.close();
        assertEquals(1, backend.closeCount);
    }

    @Test(expected = IllegalStateException.class)
    public void rejectsWrongOutputDimension() throws Exception {
        OnnxEmbeddingModel model = fixture(new float[][] {{1f, 2f, 3f}});
        try {
            model.embedDocuments(Collections.singletonList("测试"));
        } finally {
            model.close();
        }
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsNonFiniteOutput() throws Exception {
        OnnxEmbeddingModel model = fixture(new float[][] {{Float.NaN, 1f}});
        try {
            model.embedDocuments(Collections.singletonList("测试"));
        } finally {
            model.close();
        }
    }

    @Test(expected = IllegalStateException.class)
    public void cannotEmbedAfterClose() throws Exception {
        OnnxEmbeddingModel model = fixture(new float[][] {{1f, 0f}});
        model.close();
        model.embedDocuments(Collections.singletonList("测试"));
    }

    private static OnnxEmbeddingModel fixture(float[][] output) {
        return new OnnxEmbeddingModel(
                BgeTokenizer.fromVocabulary(VOCABULARY, 32),
                () -> new RecordingBackend(output),
                "model-v1",
                2,
                "为这个句子生成表示以用于检索相关文章：");
    }

    private static final class RecordingBackend implements OnnxEmbeddingModel.Backend {
        private final float[][] output;
        private final java.util.ArrayList<Long> firstTokens = new java.util.ArrayList<>();
        private int closeCount;

        private RecordingBackend(float[][] output) {
            this.output = output;
        }

        @Override
        public float[][] infer(long[][] inputIds, long[][] attentionMask, long[][] tokenTypeIds) {
            firstTokens.add(inputIds[0][1]);
            float[][] rows = new float[inputIds.length][];
            for (int index = 0; index < rows.length; index++) {
                rows[index] = Arrays.copyOf(output[Math.min(index, output.length - 1)],
                        output[Math.min(index, output.length - 1)].length);
            }
            return rows;
        }

        @Override
        public void close() {
            closeCount++;
        }
    }
}
