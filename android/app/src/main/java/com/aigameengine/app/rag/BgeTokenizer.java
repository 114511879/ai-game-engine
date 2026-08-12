package com.aigameengine.app.rag;

import android.content.res.AssetManager;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class BgeTokenizer {
    private static final String PAD = "[PAD]";
    private static final String UNKNOWN = "[UNK]";
    private static final String CLASSIFICATION = "[CLS]";
    private static final String SEPARATOR = "[SEP]";

    private final Map<String, Integer> vocabulary;
    private final int maxTokens;
    private final int padTokenId;
    private final int unknownTokenId;
    private final int clsTokenId;
    private final int sepTokenId;

    private BgeTokenizer(List<String> tokens, int maxTokens) {
        if (maxTokens < 2) {
            throw new IllegalArgumentException("maxTokens must allow special tokens");
        }
        this.vocabulary = new HashMap<>();
        for (int index = 0; index < tokens.size(); index++) {
            String token = tokens.get(index);
            if (!vocabulary.containsKey(token)) {
                vocabulary.put(token, index);
            }
        }
        this.maxTokens = maxTokens;
        this.padTokenId = requiredId(PAD);
        this.unknownTokenId = requiredId(UNKNOWN);
        this.clsTokenId = requiredId(CLASSIFICATION);
        this.sepTokenId = requiredId(SEPARATOR);
    }

    public static BgeTokenizer fromAsset(AssetManager assets, String path, int maxTokens)
            throws IOException {
        List<String> tokens = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                assets.open(path), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                tokens.add(line);
            }
        }
        return new BgeTokenizer(tokens, maxTokens);
    }

    static BgeTokenizer fromVocabulary(List<String> tokens, int maxTokens) {
        return new BgeTokenizer(tokens, maxTokens);
    }

    public Input encode(String text) {
        List<Integer> pieces = new ArrayList<>();
        for (String token : basicTokens(text == null ? "" : text)) {
            appendWordPieces(token, pieces);
            if (pieces.size() >= maxTokens - 2) {
                break;
            }
        }

        long[] inputIds = new long[maxTokens];
        long[] attentionMask = new long[maxTokens];
        long[] tokenTypeIds = new long[maxTokens];
        for (int index = 0; index < maxTokens; index++) {
            inputIds[index] = padTokenId;
        }
        inputIds[0] = clsTokenId;
        attentionMask[0] = 1;
        int outputIndex = 1;
        int pieceCount = Math.min(pieces.size(), maxTokens - 2);
        for (int index = 0; index < pieceCount; index++) {
            inputIds[outputIndex] = pieces.get(index);
            attentionMask[outputIndex] = 1;
            outputIndex++;
        }
        inputIds[outputIndex] = sepTokenId;
        attentionMask[outputIndex] = 1;
        return new Input(inputIds, attentionMask, tokenTypeIds);
    }

    public int clsTokenId() {
        return clsTokenId;
    }

    public int sepTokenId() {
        return sepTokenId;
    }

    private int requiredId(String token) {
        Integer identifier = vocabulary.get(token);
        if (identifier == null) {
            throw new IllegalArgumentException("vocabulary is missing " + token);
        }
        return identifier;
    }

    private void appendWordPieces(String token, List<Integer> output) {
        Integer exact = vocabulary.get(token);
        if (exact != null) {
            output.add(exact);
            return;
        }
        int start = 0;
        List<Integer> matched = new ArrayList<>();
        while (start < token.length()) {
            int end = token.length();
            Integer identifier = null;
            while (end > start) {
                String candidate = token.substring(start, end);
                if (start > 0) {
                    candidate = "##" + candidate;
                }
                identifier = vocabulary.get(candidate);
                if (identifier != null) {
                    break;
                }
                end--;
            }
            if (identifier == null) {
                output.add(unknownTokenId);
                return;
            }
            matched.add(identifier);
            start = end;
        }
        output.addAll(matched);
    }

    private static List<String> basicTokens(String text) {
        List<String> tokens = new ArrayList<>();
        StringBuilder word = new StringBuilder();
        String normalized = text.toLowerCase(Locale.ROOT);
        for (int offset = 0; offset < normalized.length(); ) {
            int codePoint = normalized.codePointAt(offset);
            offset += Character.charCount(codePoint);
            if (Character.isWhitespace(codePoint)) {
                flushWord(word, tokens);
            } else if (isCjk(codePoint) || isPunctuation(codePoint)) {
                flushWord(word, tokens);
                tokens.add(new String(Character.toChars(codePoint)));
            } else {
                word.appendCodePoint(codePoint);
            }
        }
        flushWord(word, tokens);
        return tokens;
    }

    private static void flushWord(StringBuilder word, List<String> tokens) {
        if (word.length() > 0) {
            tokens.add(word.toString());
            word.setLength(0);
        }
    }

    private static boolean isCjk(int codePoint) {
        Character.UnicodeScript script = Character.UnicodeScript.of(codePoint);
        return script == Character.UnicodeScript.HAN;
    }

    private static boolean isPunctuation(int codePoint) {
        int type = Character.getType(codePoint);
        return type == Character.CONNECTOR_PUNCTUATION
                || type == Character.DASH_PUNCTUATION
                || type == Character.START_PUNCTUATION
                || type == Character.END_PUNCTUATION
                || type == Character.INITIAL_QUOTE_PUNCTUATION
                || type == Character.FINAL_QUOTE_PUNCTUATION
                || type == Character.OTHER_PUNCTUATION;
    }

    public static final class Input {
        public final long[] inputIds;
        public final long[] attentionMask;
        public final long[] tokenTypeIds;

        private Input(long[] inputIds, long[] attentionMask, long[] tokenTypeIds) {
            this.inputIds = inputIds;
            this.attentionMask = attentionMask;
            this.tokenTypeIds = tokenTypeIds;
        }
    }
}
