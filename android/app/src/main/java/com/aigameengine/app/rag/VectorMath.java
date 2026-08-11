package com.aigameengine.app.rag;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

public final class VectorMath {
    private VectorMath() {}

    public static float[] normalize(float[] values) {
        if (values == null || values.length == 0) {
            throw new IllegalArgumentException("vector is empty");
        }
        double squaredNorm = 0;
        for (float value : values) {
            if (!Float.isFinite(value)) {
                throw new IllegalArgumentException("vector contains a non-finite value");
            }
            squaredNorm += (double) value * value;
        }
        double norm = Math.sqrt(squaredNorm);
        if (!Double.isFinite(norm) || norm == 0) {
            throw new IllegalArgumentException("vector has no finite norm");
        }
        float[] normalized = new float[values.length];
        for (int index = 0; index < values.length; index++) {
            normalized[index] = (float) (values[index] / norm);
        }
        return normalized;
    }

    public static float cosine(float[] normalizedLeft, float[] normalizedRight) {
        if (normalizedLeft == null || normalizedRight == null
                || normalizedLeft.length == 0 || normalizedLeft.length != normalizedRight.length) {
            throw new IllegalArgumentException("vectors must have the same non-zero dimension");
        }
        double score = 0;
        for (int index = 0; index < normalizedLeft.length; index++) {
            float left = normalizedLeft[index];
            float right = normalizedRight[index];
            if (!Float.isFinite(left) || !Float.isFinite(right)) {
                throw new IllegalArgumentException("vector contains a non-finite value");
            }
            score += (double) left * right;
        }
        return (float) Math.max(-1d, Math.min(1d, score));
    }

    public static float lexicalOverlap(String query, String document) {
        Set<String> queryTokens = lexicalTokens(query);
        if (queryTokens.isEmpty()) {
            return 0f;
        }
        Set<String> documentTokens = lexicalTokens(document);
        int intersection = 0;
        for (String token : queryTokens) {
            if (documentTokens.contains(token)) {
                intersection++;
            }
        }
        return (float) intersection / queryTokens.size();
    }

    public static float blend(float semantic, float lexical) {
        return clamp01(semantic * 0.85f + lexical * 0.15f);
    }

    public static float clamp01(float value) {
        if (!Float.isFinite(value) || value <= 0f) {
            return 0f;
        }
        return Math.min(1f, value);
    }

    private static Set<String> lexicalTokens(String text) {
        Set<String> tokens = new HashSet<>();
        String normalized = text == null ? "" : text.toLowerCase(Locale.ROOT);
        StringBuilder latin = new StringBuilder();
        StringBuilder cjk = new StringBuilder();
        for (int offset = 0; offset < normalized.length(); ) {
            int codePoint = normalized.codePointAt(offset);
            offset += Character.charCount(codePoint);
            if (Character.UnicodeScript.of(codePoint) == Character.UnicodeScript.HAN) {
                flushLatin(latin, tokens);
                cjk.appendCodePoint(codePoint);
            } else {
                flushCjk(cjk, tokens);
                if (Character.isLetterOrDigit(codePoint)) {
                    latin.appendCodePoint(codePoint);
                } else {
                    flushLatin(latin, tokens);
                }
            }
        }
        flushLatin(latin, tokens);
        flushCjk(cjk, tokens);
        return tokens;
    }

    private static void flushLatin(StringBuilder latin, Set<String> tokens) {
        if (latin.length() > 0) {
            tokens.add("w:" + latin);
            latin.setLength(0);
        }
    }

    private static void flushCjk(StringBuilder cjk, Set<String> tokens) {
        int[] codePoints = cjk.codePoints().toArray();
        if (codePoints.length == 1) {
            tokens.add("c:" + new String(codePoints, 0, 1));
        } else {
            for (int index = 0; index + 1 < codePoints.length; index++) {
                tokens.add("c:" + new String(codePoints, index, 2));
            }
        }
        cjk.setLength(0);
    }
}
