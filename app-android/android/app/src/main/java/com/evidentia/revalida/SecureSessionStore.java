package com.evidentia.revalida;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Encrypted, device-bound storage used exclusively for the Supabase session. */
final class SecureSessionStore {
    static final String KEYSTORE = "AndroidKeyStore";
    static final String KEY_ALIAS = "evidentia.session.aes.v1";
    static final String PREFS = "evidentia_secure";
    static final String ENTRY = "session_v1";
    private static final String CIPHER = "AES/GCM/NoPadding";

    private final Context context;

    SecureSessionStore(Context context) {
        this.context = context.getApplicationContext();
    }

    String get() throws Exception {
        String packed = preferences().getString(ENTRY, null);
        if (packed == null || packed.isEmpty()) return null;

        String[] parts = packed.split("\\.", 2);
        if (parts.length != 2) throw new IllegalStateException("invalid encrypted session");
        byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
        byte[] encrypted = Base64.decode(parts[1], Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.DECRYPT_MODE, sessionKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    void set(String value) throws Exception {
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.ENCRYPT_MODE, sessionKey());
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        String packed = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." +
            Base64.encodeToString(encrypted, Base64.NO_WRAP);
        if (!preferences().edit().putString(ENTRY, packed).commit()) {
            throw new IllegalStateException("encrypted session was not persisted");
        }
    }

    void clear() {
        preferences().edit().remove(ENTRY).commit();
    }

    SharedPreferences preferences() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey sessionKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }
}
