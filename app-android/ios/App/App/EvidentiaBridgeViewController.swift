import Capacitor

/// Registers app-owned Capacitor plugins without relying on generated plugin metadata.
@objc(EvidentiaBridgeViewController)
final class EvidentiaBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // Capacitor 8 observes UIScene foreground notifications before the first
        // navigation has installed its document-start bridge. Seed only the initial
        // about:blank document; the real bridge replaces this object on page load.
        webView?.evaluateJavaScript(
            "window.Capacitor = window.Capacitor || { triggerEvent: function() {} };"
        )
        bridge?.registerPluginType(NativePurchasesPlugin.self)
        bridge?.registerPluginType(SecureSessionPlugin.self)
    }
}
