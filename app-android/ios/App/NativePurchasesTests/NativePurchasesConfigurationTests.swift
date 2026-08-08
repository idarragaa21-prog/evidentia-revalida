import XCTest
@testable import App

final class NativePurchasesConfigurationTests: XCTestCase {
    func testCapacitorContractNamesStayAlignedAcrossPlatforms() {
        XCTAssertEqual(NativePurchasesContract.platform, "apple")
        XCTAssertEqual(NativePurchasesContract.pluginName, "NativePurchases")
        XCTAssertEqual(NativePurchasesContract.getProductsMethod, "getProducts")
        XCTAssertEqual(NativePurchasesContract.purchaseMethod, "purchase")
        XCTAssertEqual(NativePurchasesContract.restoreMethod, "restore")
        XCTAssertEqual(NativePurchasesContract.finishTransactionMethod, "finishTransaction")
        XCTAssertEqual(NativePurchasesContract.transactionUpdatedEvent, "transactionUpdated")
    }

    func testNormalizationTrimsRemovesEmptyValuesAndPreservesOrder() {
        let normalized = NativePurchasesConfiguration.normalizedProductIDs([
            "  com.evidentia.access.30d ",
            "",
            "com.evidentia.access.90d",
            "com.evidentia.access.30d",
            "   "
        ])

        XCTAssertEqual(normalized, [
            "com.evidentia.access.30d",
            "com.evidentia.access.90d"
        ])
    }

    func testEmptyRequestReturnsEveryConfiguredProduct() throws {
        let resolved = try NativePurchasesConfiguration.resolveProductIDs(
            requested: nil,
            configured: ["product.a", "product.b"]
        )

        XCTAssertEqual(resolved, ["product.a", "product.b"])
    }

    func testRequestedProductsMustBelongToAllowList() {
        XCTAssertThrowsError(
            try NativePurchasesConfiguration.resolveProductIDs(
                requested: ["product.a", "product.unknown"],
                configured: ["product.a", "product.b"]
            )
        ) { error in
            XCTAssertEqual(
                error as? NativePurchasesBridgeError,
                .invalidProductIdentifiers(["product.unknown"])
            )
        }
    }

    func testMissingConfigurationHasStableBridgeCode() {
        XCTAssertThrowsError(
            try NativePurchasesConfiguration.resolveProductIDs(
                requested: ["product.a"],
                configured: []
            )
        ) { error in
            let bridgeError = error as? NativePurchasesBridgeError
            XCTAssertEqual(bridgeError, .missingConfiguration)
            XCTAssertEqual(bridgeError?.code, "E_PRODUCTS_NOT_CONFIGURED")
        }
    }
}
