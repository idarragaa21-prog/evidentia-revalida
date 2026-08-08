package com.evidentia.revalida;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/** Shared constants and account binding expected by the purchase-verification backend. */
final class NativePurchaseContract {
    private static final Set<String> ALLOWED_PRODUCT_IDS = Collections.unmodifiableSet(
        new HashSet<>(Arrays.asList(
            "com.evidentia.revalida.access.30d",
            "com.evidentia.revalida.access.90d",
            "com.evidentia.revalida.access.180d"
        ))
    );

    private NativePurchaseContract() {}

    static boolean isAllowedProductId(String productId) {
        return productId != null && ALLOWED_PRODUCT_IDS.contains(productId);
    }

    static String obfuscatedAccountId(String accountToken) {
        final String normalized;
        try {
            normalized = UUID.fromString(accountToken).toString();
        } catch (RuntimeException invalid) {
            throw new IllegalArgumentException("accountToken must be a UUID", invalid);
        }

        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(normalized.getBytes(StandardCharsets.UTF_8));
            StringBuilder output = new StringBuilder(digest.length * 2);
            for (byte value : digest) output.append(String.format("%02x", value & 0xff));
            return output.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }
}
