package com.aigameengine.app.rag;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

public final class BgeTokenizerTest {
    private static BgeTokenizer tokenizer(int maxTokens) {
        return BgeTokenizer.fromVocabulary(Arrays.asList(
                "[PAD]", "[UNK]", "[CLS]", "[SEP]", "游", "戏", "boss", "战", "斗",
                "play", "##ing", "!"), maxTokens);
    }

    @Test
    public void encodesChineseLatinWordPieceAndPunctuation() {
        BgeTokenizer.Input input = tokenizer(12).encode("游戏 PLAYING boss!");

        assertArrayEquals(new long[] {2, 4, 5, 9, 10, 6, 11, 3, 0, 0, 0, 0}, input.inputIds);
        assertArrayEquals(new long[] {1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0}, input.attentionMask);
        assertArrayEquals(new long[12], input.tokenTypeIds);
    }

    @Test
    public void usesUnknownTokenWhenWordPieceCannotMatch() {
        assertArrayEquals(
                new long[] {2, 1, 3, 0, 0},
                tokenizer(5).encode("missing").inputIds);
    }

    @Test
    public void truncationPreservesFinalSeparator() {
        BgeTokenizer tokenizer = tokenizer(6);
        BgeTokenizer.Input input = tokenizer.encode(
                String.join("", Collections.nCopies(10, "游戏")));

        assertEquals(6, input.inputIds.length);
        assertEquals(tokenizer.clsTokenId(), input.inputIds[0]);
        assertEquals(tokenizer.sepTokenId(), input.inputIds[5]);
        assertArrayEquals(new long[] {1, 1, 1, 1, 1, 1}, input.attentionMask);
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsVocabularyWithoutRequiredTokens() {
        BgeTokenizer.fromVocabulary(Collections.singletonList("[PAD]"), 8);
    }
}
