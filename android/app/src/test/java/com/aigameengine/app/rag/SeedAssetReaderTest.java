package com.aigameengine.app.rag;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;

@RunWith(RobolectricTestRunner.class)
public final class SeedAssetReaderTest {
    @Test
    public void readsVerifiedPackagedSeedBundle() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        SeedAssetReader.SeedBundle bundle = new SeedAssetReader(context.getAssets()).read();

        assertEquals(19, bundle.documents.size());
        assertEquals(1, bundle.seedVersion);
        assertTrue(bundle.embeddingVersion.startsWith("7999e1d3359715c523056ef9478215996d62a620:"));
        for (RagDocument document : bundle.documents) {
            assertEquals(RagDocument.ORIGIN_BUILT_IN, document.origin);
            assertEquals(RagDocument.STATE_READY, document.state);
            assertEquals(512, document.embedding().length);
        }
    }
}
