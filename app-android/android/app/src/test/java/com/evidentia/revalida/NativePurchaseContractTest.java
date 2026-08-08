package com.evidentia.revalida;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class NativePurchaseContractTest {
    @Test
    public void productAllowListMatchesStoreAndBackendContract() {
        assertTrue(NativePurchaseContract.isAllowedProductId("com.evidentia.revalida.access.30d"));
        assertTrue(NativePurchaseContract.isAllowedProductId("com.evidentia.revalida.access.90d"));
        assertTrue(NativePurchaseContract.isAllowedProductId("com.evidentia.revalida.access.180d"));
        assertFalse(NativePurchaseContract.isAllowedProductId("com.evidentia.revalida.access.365d"));
    }

    @Test
    public void accountIdUsesTheSameLowercaseSha256AsBackend() {
        assertEquals(
            "986c0dc956dc822b5d8f698661b9eb1ef880786ff9043c16744d2a420e99e9bb",
            NativePurchaseContract.obfuscatedAccountId("123E4567-E89B-12D3-A456-426614174000")
        );
    }

    @Test
    public void accountIdRejectsNonUuidInput() {
        assertThrows(IllegalArgumentException.class, () ->
            NativePurchaseContract.obfuscatedAccountId("email@example.com")
        );
    }
}
