package com.aigameengine.app.rag;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class VectorMathTest {
    @Test
    public void normalizesAndScoresCosineIdentity() {
        float[] normalized = VectorMath.normalize(new float[] {3f, 4f});
        assertArrayEquals(new float[] {0.6f, 0.8f}, normalized, 0.0001f);
        assertEquals(1f, VectorMath.cosine(normalized, normalized), 0.0001f);
    }

    @Test(expected = IllegalArgumentException.class)
    public void normalizationRejectsZeroVector() {
        VectorMath.normalize(new float[] {0f, 0f});
    }

    @Test(expected = IllegalArgumentException.class)
    public void normalizationRejectsNonFiniteVector() {
        VectorMath.normalize(new float[] {Float.NaN, 1f});
    }

    @Test
    public void lexicalOverlapUsesLatinWordsAndChineseBigrams() {
        assertEquals(0.5f, VectorMath.lexicalOverlap("Boss 地牢战斗", "地牢 Boss 设计"), 0.0001f);
    }

    @Test
    public void blendUsesSemanticAndLexicalWeights() {
        assertEquals(0.71f, VectorMath.blend(0.8f, 0.2f), 0.0001f);
    }

    @Test
    public void clampHandlesBoundsAndInvalidValues() {
        assertEquals(0f, VectorMath.clamp01(-1f), 0f);
        assertEquals(1f, VectorMath.clamp01(2f), 0f);
        assertEquals(0f, VectorMath.clamp01(Float.NaN), 0f);
    }
}
