package com.evidentia.revalida;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/**
 * Stores only the authentication session, encrypted with a non-exportable key in
 * Android Keystore. Study progress remains in the WebView's local storage.
 */
@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {
    @PluginMethod
    public void get(PluginCall call) {
        try {
            String value = store().get();
            if (value == null) {
                call.resolve(new JSObject().put("value", JSONObject.NULL));
                return;
            }
            call.resolve(new JSObject().put("value", value));
        } catch (Exception error) {
            // A restored preference cannot be decrypted on a different device because
            // the Keystore key is ThisDeviceOnly. Remove it and require a fresh login.
            store().clear();
            call.reject("Não foi possível ler a sessão protegida", error);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.isEmpty()) {
            call.reject("value obrigatório");
            return;
        }
        try {
            store().set(value);
            call.resolve(new JSObject().put("saved", true));
        } catch (Exception error) {
            call.reject("Não foi possível proteger a sessão", error);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        store().clear();
        call.resolve(new JSObject().put("cleared", true));
    }

    private SecureSessionStore store() {
        return new SecureSessionStore(getContext());
    }
}
