import Security
import XCTest
@testable import App

final class SecureSessionKeychainTests: XCTestCase {
    func testCapacitorContractNamesStayStable() {
        XCTAssertEqual(SecureSessionContract.pluginName, "SecureSession")
        XCTAssertEqual(SecureSessionContract.getMethod, "get")
        XCTAssertEqual(SecureSessionContract.setMethod, "set")
        XCTAssertEqual(SecureSessionContract.clearMethod, "clear")
    }

    func testAddQueryIsDeviceOnlyAndNeverSynchronizable() throws {
        let store = SecureSessionKeychainStore(service: "com.evidentia.revalida.tests.attributes")
        let query = try store.addQuery(for: "{}")

        XCTAssertEqual(
            query[kSecAttrAccessible as String] as? String,
            kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String
        )
        XCTAssertEqual(query[kSecAttrSynchronizable as String] as? Bool, false)
        XCTAssertEqual(query[kSecAttrAccount as String] as? String, "supabase-session")
    }

    func testKeychainRoundTripAndIdempotentClear() throws {
        let service = "com.evidentia.revalida.tests.\(UUID().uuidString)"
        let store = SecureSessionKeychainStore(service: service)
        defer { try? store.clear() }

        XCTAssertNil(try store.get())
        let opaqueSession = #"{"access_token":"opaque-for-test"}"#
        try store.set(opaqueSession)
        XCTAssertEqual(try store.get(), opaqueSession)

        try store.clear()
        XCTAssertNil(try store.get())
        XCTAssertNoThrow(try store.clear())
    }

    func testMissingValueHasStableErrorCode() {
        XCTAssertEqual(
            SecureSessionBridgeError.missingValue.code,
            "E_SECURE_SESSION_VALUE_REQUIRED"
        )
    }
}
