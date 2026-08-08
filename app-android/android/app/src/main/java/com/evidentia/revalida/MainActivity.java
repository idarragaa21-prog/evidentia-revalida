package com.evidentia.revalida;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativePurchasesPlugin.class);
        registerPlugin(SecureSessionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
