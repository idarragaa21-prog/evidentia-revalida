import Capacitor
import Foundation
import StoreKit

enum NativePurchasesBridgeError: LocalizedError, Equatable {
    case storeKitUnavailable
    case missingConfiguration
    case invalidProductIdentifiers([String])
    case missingProductIdentifier
    case productNotFound(String)
    case invalidAccountToken
    case invalidTransactionIdentifier
    case transactionNotFound(String)
    case transactionUnverified(String)

    var code: String {
        switch self {
        case .storeKitUnavailable: return "E_STOREKIT_UNAVAILABLE"
        case .missingConfiguration: return "E_PRODUCTS_NOT_CONFIGURED"
        case .invalidProductIdentifiers: return "E_PRODUCT_NOT_ALLOWED"
        case .missingProductIdentifier: return "E_PRODUCT_ID_REQUIRED"
        case .productNotFound: return "E_PRODUCT_NOT_FOUND"
        case .invalidAccountToken: return "E_ACCOUNT_TOKEN_INVALID"
        case .invalidTransactionIdentifier: return "E_TRANSACTION_ID_INVALID"
        case .transactionNotFound: return "E_TRANSACTION_NOT_FOUND"
        case .transactionUnverified: return "E_TRANSACTION_UNVERIFIED"
        }
    }

    var errorDescription: String? {
        switch self {
        case .storeKitUnavailable:
            return "Las compras requieren iOS 15 o posterior."
        case .missingConfiguration:
            return "No hay identificadores de productos StoreKit configurados."
        case .invalidProductIdentifiers(let identifiers):
            return "Los productos no están permitidos por la configuración: \(identifiers.joined(separator: ", "))."
        case .missingProductIdentifier:
            return "productId es obligatorio."
        case .productNotFound(let identifier):
            return "StoreKit no devolvió el producto \(identifier)."
        case .invalidAccountToken:
            return "accountToken debe ser un UUID estable y válido."
        case .invalidTransactionIdentifier:
            return "transactionId debe ser un entero UInt64 representado como texto."
        case .transactionNotFound(let identifier):
            return "No existe una transacción pendiente con ID \(identifier)."
        case .transactionUnverified(let identifier):
            return "StoreKit no pudo verificar la transacción \(identifier)."
        }
    }
}

enum NativePurchasesConfiguration {
    static let productIDsInfoKey = "EvidentiaStoreKitProductIDs"

    static func normalizedProductIDs(_ identifiers: [String]) -> [String] {
        var seen = Set<String>()
        return identifiers.compactMap { rawIdentifier in
            let identifier = rawIdentifier.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !identifier.isEmpty, seen.insert(identifier).inserted else { return nil }
            return identifier
        }
    }

    static func configuredProductIDs(in bundle: Bundle = .main) -> [String] {
        let identifiers = bundle.object(forInfoDictionaryKey: productIDsInfoKey) as? [String] ?? []
        return normalizedProductIDs(identifiers)
    }

    static func resolveProductIDs(requested: [String]?, configured: [String]) throws -> [String] {
        let allowed = normalizedProductIDs(configured)
        guard !allowed.isEmpty else { throw NativePurchasesBridgeError.missingConfiguration }

        let requested = normalizedProductIDs(requested ?? [])
        guard !requested.isEmpty else { return allowed }

        let allowedSet = Set(allowed)
        let invalid = requested.filter { !allowedSet.contains($0) }
        guard invalid.isEmpty else {
            throw NativePurchasesBridgeError.invalidProductIdentifiers(invalid)
        }
        return requested
    }
}

enum NativePurchasesContract {
    static let platform = "apple"
    static let pluginName = "NativePurchases"
    static let getProductsMethod = "getProducts"
    static let purchaseMethod = "purchase"
    static let restoreMethod = "restore"
    static let finishTransactionMethod = "finishTransaction"
    static let transactionUpdatedEvent = "transactionUpdated"
}

@objc(NativePurchasesPlugin)
final class NativePurchasesPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NativePurchasesPlugin"
    let jsName = NativePurchasesContract.pluginName
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: NativePurchasesContract.getProductsMethod, returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: NativePurchasesContract.purchaseMethod, returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: NativePurchasesContract.restoreMethod, returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: NativePurchasesContract.finishTransactionMethod, returnType: CAPPluginReturnPromise)
    ]

    private var transactionUpdatesTask: Task<Void, Never>?

    override func load() {
        super.load()
        guard #available(iOS 15.0, *) else { return }
        startObservingTransactions()
    }

    deinit {
        transactionUpdatesTask?.cancel()
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            reject(call, with: NativePurchasesBridgeError.storeKitUnavailable)
            return
        }

        let requested = call.getArray("productIds", String.self)
        Task {
            do {
                let identifiers = try NativePurchasesConfiguration.resolveProductIDs(
                    requested: requested,
                    configured: NativePurchasesConfiguration.configuredProductIDs()
                )
                let products = try await Product.products(for: identifiers)
                let productsByID = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })
                let payloads = identifiers.compactMap { productsByID[$0] }.map(productPayload)
                let missing = identifiers.filter { productsByID[$0] == nil }

                await resolve(call, with: [
                    "platform": NativePurchasesContract.platform,
                    "state": "ready",
                    "products": payloads,
                    "missingProductIds": missing
                ])
            } catch {
                await rejectOnMain(call, with: error)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            reject(call, with: NativePurchasesBridgeError.storeKitUnavailable)
            return
        }

        guard let rawProductID = call.getString("productId") else {
            reject(call, with: NativePurchasesBridgeError.missingProductIdentifier)
            return
        }
        let productID = rawProductID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !productID.isEmpty else {
            reject(call, with: NativePurchasesBridgeError.missingProductIdentifier)
            return
        }

        let rawAccountToken = call.getString("accountToken")
        Task {
            do {
                _ = try NativePurchasesConfiguration.resolveProductIDs(
                    requested: [productID],
                    configured: NativePurchasesConfiguration.configuredProductIDs()
                )
                guard let product = try await Product.products(for: [productID]).first else {
                    throw NativePurchasesBridgeError.productNotFound(productID)
                }

                let result: Product.PurchaseResult
                if let rawAccountToken {
                    guard let accountToken = UUID(uuidString: rawAccountToken) else {
                        throw NativePurchasesBridgeError.invalidAccountToken
                    }
                    result = try await product.purchase(options: [.appAccountToken(accountToken)])
                } else {
                    result = try await product.purchase()
                }

                switch result {
                case .success(let verification):
                    await resolve(call, with: transactionPayload(from: verification, needsFinish: true))
                case .userCancelled:
                    await resolve(call, with: emptyTransactionPayload(productID: productID, state: "cancelled"))
                case .pending:
                    await resolve(call, with: emptyTransactionPayload(productID: productID, state: "pending"))
                @unknown default:
                    await rejectOnMain(call, message: "StoreKit devolvió un resultado desconocido.", code: "E_PURCHASE_UNKNOWN")
                }
            } catch StoreKitError.userCancelled {
                await resolve(call, with: emptyTransactionPayload(productID: productID, state: "cancelled"))
            } catch {
                await rejectOnMain(call, with: error)
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            reject(call, with: NativePurchasesBridgeError.storeKitUnavailable)
            return
        }

        Task {
            do {
                let configured = try NativePurchasesConfiguration.resolveProductIDs(
                    requested: nil,
                    configured: NativePurchasesConfiguration.configuredProductIDs()
                )
                try await AppStore.sync()

                let configuredSet = Set(configured)
                var unfinishedTransactionIDs = Set<UInt64>()
                for await verification in Transaction.unfinished {
                    switch verification {
                    case .verified(let transaction), .unverified(let transaction, _):
                        unfinishedTransactionIDs.insert(transaction.id)
                    }
                }
                var transactions: [[String: Any]] = []
                for await verification in Transaction.currentEntitlements {
                    let payload = transactionPayload(
                        from: verification,
                        needsFinish: transactionID(from: verification).map(unfinishedTransactionIDs.contains) ?? false
                    )
                    guard let productID = payload["productId"] as? String,
                          configuredSet.contains(productID) else { continue }
                    transactions.append(payload)
                }
                transactions.sort {
                    ($0["purchaseDate"] as? String ?? "") > ($1["purchaseDate"] as? String ?? "")
                }

                await resolve(call, with: [
                    "platform": NativePurchasesContract.platform,
                    "state": "restored",
                    "transactions": transactions
                ])
            } catch StoreKitError.userCancelled {
                await resolve(call, with: [
                    "platform": NativePurchasesContract.platform,
                    "state": "cancelled",
                    "transactions": []
                ])
            } catch {
                await rejectOnMain(call, with: error)
            }
        }
    }

    /// Finishes only a locally verified, unfinished transaction. Call this after the backend ACK.
    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            reject(call, with: NativePurchasesBridgeError.storeKitUnavailable)
            return
        }

        guard let rawTransactionID = call.getString("transactionId"),
              let transactionID = UInt64(rawTransactionID) else {
            reject(call, with: NativePurchasesBridgeError.invalidTransactionIdentifier)
            return
        }

        Task {
            do {
                for await verification in Transaction.unfinished {
                    switch verification {
                    case .verified(let transaction) where transaction.id == transactionID:
                        await transaction.finish()
                        await resolve(call, with: [
                            "platform": NativePurchasesContract.platform,
                            "productId": transaction.productID,
                            "transactionId": String(transaction.id),
                            "signedTransaction": verification.jwsRepresentation,
                            "state": "finished",
                            "needsFinish": false
                        ])
                        return
                    case .unverified(let transaction, _) where transaction.id == transactionID:
                        throw NativePurchasesBridgeError.transactionUnverified(rawTransactionID)
                    default:
                        continue
                    }
                }
                throw NativePurchasesBridgeError.transactionNotFound(rawTransactionID)
            } catch {
                await rejectOnMain(call, with: error)
            }
        }
    }

    @available(iOS 15.0, *)
    private func startObservingTransactions() {
        transactionUpdatesTask?.cancel()
        transactionUpdatesTask = Task { [weak self] in
            for await verification in Transaction.updates {
                guard !Task.isCancelled else { return }
                let payload = self?.transactionPayload(from: verification, needsFinish: true) ?? [:]
                guard !payload.isEmpty else { continue }
                await MainActor.run { [weak self] in
                    self?.notifyListeners(
                        NativePurchasesContract.transactionUpdatedEvent,
                        data: payload,
                        retainUntilConsumed: true
                    )
                }
            }
        }
    }

    @available(iOS 15.0, *)
    private func productPayload(_ product: Product) -> [String: Any] {
        var payload: [String: Any] = [
            "platform": NativePurchasesContract.platform,
            "productId": product.id,
            "state": "available",
            "type": product.type.rawValue,
            "displayName": product.displayName,
            "description": product.description,
            "displayPrice": product.displayPrice,
            "price": NSDecimalNumber(decimal: product.price).stringValue,
            "isFamilyShareable": product.isFamilyShareable
        ]

        if let period = product.subscription?.subscriptionPeriod {
            payload["subscriptionPeriod"] = [
                "unit": subscriptionUnit(period.unit),
                "value": period.value
            ]
        }
        return payload
    }

    @available(iOS 15.0, *)
    private func transactionPayload(
        from verification: VerificationResult<Transaction>,
        needsFinish: Bool
    ) -> [String: Any] {
        switch verification {
        case .verified(let transaction):
            return transactionPayload(
                transaction,
                signedTransaction: verification.jwsRepresentation,
                state: "verified",
                needsFinish: needsFinish
            )
        case .unverified(let transaction, let error):
            var payload = transactionPayload(
                transaction,
                signedTransaction: verification.jwsRepresentation,
                state: "unverified",
                needsFinish: needsFinish
            )
            payload["error"] = error.localizedDescription
            return payload
        }
    }

    @available(iOS 15.0, *)
    private func transactionPayload(
        _ transaction: Transaction,
        signedTransaction: String,
        state: String,
        needsFinish: Bool
    ) -> [String: Any] {
        var payload: [String: Any] = [
            "platform": NativePurchasesContract.platform,
            "productId": transaction.productID,
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "signedTransaction": signedTransaction,
            "state": state,
            "needsFinish": needsFinish,
            "productType": transaction.productType.rawValue,
            "purchaseDate": iso8601(transaction.purchaseDate),
            "originalPurchaseDate": iso8601(transaction.originalPurchaseDate),
            "quantity": transaction.purchasedQuantity,
            "ownershipType": transaction.ownershipType.rawValue,
            "isUpgraded": transaction.isUpgraded
        ]
        if let expirationDate = transaction.expirationDate {
            payload["expirationDate"] = iso8601(expirationDate)
        }
        if let revocationDate = transaction.revocationDate {
            payload["revocationDate"] = iso8601(revocationDate)
        }
        if let revocationReason = transaction.revocationReason {
            payload["revocationReason"] = revocationReason.rawValue
        }
        if let accountToken = transaction.appAccountToken {
            payload["accountToken"] = accountToken.uuidString.lowercased()
        }
        return payload
    }

    private func emptyTransactionPayload(productID: String, state: String) -> [String: Any] {
        [
            "platform": NativePurchasesContract.platform,
            "productId": productID,
            "transactionId": "",
            "signedTransaction": "",
            "state": state,
            "needsFinish": false
        ]
    }

    @available(iOS 15.0, *)
    private func transactionID(from verification: VerificationResult<Transaction>) -> UInt64? {
        switch verification {
        case .verified(let transaction), .unverified(let transaction, _):
            return transaction.id
        }
    }

    @available(iOS 15.0, *)
    private func subscriptionUnit(_ unit: Product.SubscriptionPeriod.Unit) -> String {
        switch unit {
        case .day: return "day"
        case .week: return "week"
        case .month: return "month"
        case .year: return "year"
        @unknown default: return "unknown"
        }
    }

    private func iso8601(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    private func reject(_ call: CAPPluginCall, with error: Error) {
        let bridgeError = error as? NativePurchasesBridgeError
        call.reject(
            error.localizedDescription,
            bridgeError?.code ?? storeKitErrorCode(error),
            error,
            ["platform": NativePurchasesContract.platform, "state": "failed"]
        )
    }

    private func storeKitErrorCode(_ error: Error) -> String {
        guard #available(iOS 15.0, *), let storeKitError = error as? StoreKitError else {
            return "E_STOREKIT"
        }
        switch storeKitError {
        case .userCancelled: return "E_USER_CANCELLED"
        case .networkError: return "E_NETWORK"
        case .notAvailableInStorefront: return "E_STOREFRONT_UNAVAILABLE"
        case .notEntitled: return "E_NOT_ENTITLED"
        case .systemError: return "E_STOREKIT_SYSTEM"
        case .unsupported: return "E_STOREKIT_UNSUPPORTED"
        case .unknown: return "E_STOREKIT_UNKNOWN"
        @unknown default: return "E_STOREKIT"
        }
    }

    private func resolve(_ call: CAPPluginCall, with payload: [String: Any]) async {
        await MainActor.run { call.resolve(payload) }
    }

    private func rejectOnMain(_ call: CAPPluginCall, with error: Error) async {
        await MainActor.run { reject(call, with: error) }
    }

    private func rejectOnMain(_ call: CAPPluginCall, message: String, code: String) async {
        await MainActor.run {
            call.reject(
                message,
                code,
                nil,
                ["platform": NativePurchasesContract.platform, "state": "failed"]
            )
        }
    }
}
