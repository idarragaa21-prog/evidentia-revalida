import Capacitor
import Foundation
import Security

enum SecureSessionContract {
    static let pluginName = "SecureSession"
    static let getMethod = "get"
    static let setMethod = "set"
    static let clearMethod = "clear"
}

enum SecureSessionBridgeError: LocalizedError, Equatable {
    case missingValue
    case invalidEncoding
    case invalidStoredValue
    case keychain(OSStatus)

    var code: String {
        switch self {
        case .missingValue: return "E_SECURE_SESSION_VALUE_REQUIRED"
        case .invalidEncoding: return "E_SECURE_SESSION_ENCODING"
        case .invalidStoredValue: return "E_SECURE_SESSION_CORRUPT"
        case .keychain: return "E_SECURE_SESSION_KEYCHAIN"
        }
    }

    var errorDescription: String? {
        switch self {
        case .missingValue:
            return "value es obligatorio y debe ser texto."
        case .invalidEncoding:
            return "No fue posible codificar la sesión como UTF-8."
        case .invalidStoredValue:
            return "La sesión guardada no contiene texto UTF-8 válido."
        case .keychain(let status):
            let description = SecCopyErrorMessageString(status, nil) as String?
            return description ?? "Keychain devolvió el estado \(status)."
        }
    }
}

/// Stores a single opaque session string in the local, data-protection Keychain.
/// `ThisDeviceOnly` plus an explicit non-synchronizable query prevents iCloud sync.
struct SecureSessionKeychainStore {
    static let account = "supabase-session"

    let service: String

    init(service: String? = nil) {
        let bundleIdentifier = Bundle.main.bundleIdentifier ?? "com.evidentia.revalida"
        self.service = service ?? "\(bundleIdentifier).secure-session"
    }

    static func baseQuery(service: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: false
        ]
    }

    func addQuery(for value: String) throws -> [String: Any] {
        guard let data = value.data(using: .utf8) else {
            throw SecureSessionBridgeError.invalidEncoding
        }
        var query = Self.baseQuery(service: service)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        query[kSecValueData as String] = data
        return query
    }

    func get() throws -> String? {
        var query = Self.baseQuery(service: service)
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        query[kSecReturnData as String] = true

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            guard let data = result as? Data,
                  let value = String(data: data, encoding: .utf8) else {
                throw SecureSessionBridgeError.invalidStoredValue
            }
            return value
        case errSecItemNotFound:
            return nil
        default:
            throw SecureSessionBridgeError.keychain(status)
        }
    }

    func set(_ value: String) throws {
        let addQuery = try addQuery(for: value)
        guard let data = addQuery[kSecValueData as String] as? Data else {
            throw SecureSessionBridgeError.invalidEncoding
        }

        let updateAttributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        let updateStatus = SecItemUpdate(
            Self.baseQuery(service: service) as CFDictionary,
            updateAttributes as CFDictionary
        )

        switch updateStatus {
        case errSecSuccess:
            return
        case errSecItemNotFound:
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw SecureSessionBridgeError.keychain(addStatus)
            }
        default:
            throw SecureSessionBridgeError.keychain(updateStatus)
        }
    }

    func clear() throws {
        let status = SecItemDelete(Self.baseQuery(service: service) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw SecureSessionBridgeError.keychain(status)
        }
    }
}

@objc(SecureSessionPlugin)
final class SecureSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "SecureSessionPlugin"
    let jsName = SecureSessionContract.pluginName
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: SecureSessionContract.getMethod, returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: SecureSessionContract.setMethod, returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: SecureSessionContract.clearMethod, returnType: CAPPluginReturnPromise)
    ]

    private let store = SecureSessionKeychainStore()

    @objc func get(_ call: CAPPluginCall) {
        do {
            let value = try store.get()
            call.resolve(["value": value ?? NSNull()])
        } catch {
            reject(call, with: error)
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let value = call.getString("value") else {
            reject(call, with: SecureSessionBridgeError.missingValue)
            return
        }

        do {
            try store.set(value)
            call.resolve(["saved": true])
        } catch {
            reject(call, with: error)
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        do {
            try store.clear()
            call.resolve(["cleared": true])
        } catch {
            reject(call, with: error)
        }
    }

    private func reject(_ call: CAPPluginCall, with error: Error) {
        let bridgeError = error as? SecureSessionBridgeError
        call.reject(
            error.localizedDescription,
            bridgeError?.code ?? "E_SECURE_SESSION",
            error,
            ["platform": "apple", "state": "failed"]
        )
    }
}
