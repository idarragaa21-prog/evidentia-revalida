package com.evidentia.revalida;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.security.Key;
import java.security.KeyStore;

@RunWith(AndroidJUnit4.class)
public class SecureSessionStoreInstrumentedTest {
    private SecureSessionStore store;

    @Before
    public void setUp() {
        Context context = ApplicationProvider.getApplicationContext();
        store = new SecureSessionStore(context);
        store.clear();
    }

    @After
    public void tearDown() {
        store.clear();
    }

    @Test
    public void roundTripIsEncryptedAndClearIsIdempotent() throws Exception {
        String session = "{\"access_token\":\"secret-test-token\"}";
        store.set(session);

        assertEquals(session, store.get());
        String packed = store.preferences().getString(SecureSessionStore.ENTRY, "");
        assertFalse(packed.isEmpty());
        assertFalse(packed.contains("secret-test-token"));

        store.clear();
        store.clear();
        assertNull(store.get());
    }

    @Test
    public void keystoreKeyIsNonExportable() throws Exception {
        store.set("create-key");
        KeyStore keyStore = KeyStore.getInstance(SecureSessionStore.KEYSTORE);
        keyStore.load(null);
        Key key = keyStore.getKey(SecureSessionStore.KEY_ALIAS, null);
        assertNull(key.getEncoded());
    }
}
