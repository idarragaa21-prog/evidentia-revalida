package com.evidentia.revalida;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Ponte mínima entre a interface Capacitor e Google Play Billing.
 *
 * O plugin nunca concede acesso. Ele devolve o purchaseToken ao JavaScript, que o
 * envia ao backend para validação com a Google Play Developer API. A compra só é
 * reconhecida/acknowledged por finishTransaction depois dessa validação.
 */
@CapacitorPlugin(name = "NativePurchases")
public class NativePurchasesPlugin extends Plugin implements PurchasesUpdatedListener {

    private BillingClient billingClient;
    private static final class ReadyAction {
        final PluginCall call;
        final Runnable action;

        ReadyAction(PluginCall call, Runnable action) {
            this.call = call;
            this.action = action;
        }
    }

    private final List<ReadyAction> readyQueue = new ArrayList<>();
    private final Map<String, ProductDetails> products = new HashMap<>();
    private final Map<String, Purchase> purchasesByToken = new HashMap<>();
    private PluginCall purchaseCall;
    private boolean connecting = false;

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .enablePrepaidPlans()
                .build())
            .enableAutoServiceReconnection()
            .build();
        connect();
    }

    private void connect() {
        if (billingClient == null || billingClient.isReady() || connecting) {
            if (billingClient != null && billingClient.isReady()) flushReadyQueue();
            return;
        }
        connecting = true;
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                connecting = false;
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    flushReadyQueue();
                    queryOwnedAndNotify(BillingClient.ProductType.SUBS);
                } else {
                    rejectReadyQueue("Google Play indisponível: " + result.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                connecting = false;
            }
        });
    }

    private void whenReady(PluginCall call, Runnable action) {
        if (billingClient != null && billingClient.isReady()) {
            getActivity().runOnUiThread(action);
            return;
        }
        readyQueue.add(new ReadyAction(call, () -> getActivity().runOnUiThread(action)));
        connect();
    }

    private void flushReadyQueue() {
        List<ReadyAction> copy = new ArrayList<>(readyQueue);
        readyQueue.clear();
        for (ReadyAction item : copy) item.action.run();
    }

    private void rejectReadyQueue(String message) {
        List<ReadyAction> copy = new ArrayList<>(readyQueue);
        readyQueue.clear();
        for (ReadyAction item : copy) item.call.reject(message);
        notifyListeners("billingUnavailable", new JSObject().put("message", message));
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        JSArray ids = call.getArray("productIds", new JSArray());
        String requestedType = call.getString("productType", "subs");
        String type = "inapp".equals(requestedType) ? BillingClient.ProductType.INAPP : BillingClient.ProductType.SUBS;
        List<QueryProductDetailsParams.Product> requested = new ArrayList<>();
        try {
            for (Object value : ids.toList()) {
                String productId = String.valueOf(value).trim();
                if (!NativePurchaseContract.isAllowedProductId(productId)) {
                    call.reject("Produto não permitido nesta compilação");
                    return;
                }
                requested.add(QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId)
                    .setProductType(type)
                    .build());
            }
        } catch (Exception error) {
            call.reject("productIds inválidos", error);
            return;
        }
        if (requested.isEmpty()) {
            call.reject("Informe ao menos um productId");
            return;
        }

        whenReady(call, () -> billingClient.queryProductDetailsAsync(
            QueryProductDetailsParams.newBuilder().setProductList(requested).build(),
            (result, detailsResult) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Não foi possível consultar os produtos: " + result.getDebugMessage());
                    return;
                }
                JSArray output = new JSArray();
                for (ProductDetails detail : detailsResult.getProductDetailsList()) {
                    products.put(detail.getProductId(), detail);
                    output.put(productToJson(detail));
                }
                call.resolve(new JSObject().put("platform", "android").put("products", output));
            }
        ));
    }

    private JSObject productToJson(ProductDetails detail) {
        JSObject out = new JSObject()
            .put("platform", "android")
            .put("productId", detail.getProductId())
            .put("name", detail.getName())
            .put("description", detail.getDescription())
            .put("productType", detail.getProductType());

        if (BillingClient.ProductType.SUBS.equals(detail.getProductType())) {
            List<ProductDetails.SubscriptionOfferDetails> offers = detail.getSubscriptionOfferDetails();
            if (offers != null && !offers.isEmpty()) {
                ProductDetails.SubscriptionOfferDetails offer = offers.get(0);
                for (ProductDetails.SubscriptionOfferDetails candidate : offers) {
                    if (candidate.getOfferId() == null) {
                        offer = candidate;
                        break;
                    }
                }
                List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
                if (!phases.isEmpty()) out.put("displayPrice", phases.get(phases.size() - 1).getFormattedPrice());
                out.put("offerToken", offer.getOfferToken());
                out.put("basePlanId", offer.getBasePlanId());
                if (offer.getOfferId() != null) out.put("offerId", offer.getOfferId());
            }
        } else {
            List<ProductDetails.OneTimePurchaseOfferDetails> offers = detail.getOneTimePurchaseOfferDetailsList();
            if (offers != null && !offers.isEmpty()) {
                ProductDetails.OneTimePurchaseOfferDetails offer = offers.get(0);
                out.put("displayPrice", offer.getFormattedPrice());
                out.put("offerToken", offer.getOfferToken());
            } else if (detail.getOneTimePurchaseOfferDetails() != null) {
                out.put("displayPrice", detail.getOneTimePurchaseOfferDetails().getFormattedPrice());
            }
        }
        return out;
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        String offerToken = call.getString("offerToken", "");
        String accountToken = call.getString("accountToken", "");
        if (productId == null || productId.isEmpty()) {
            call.reject("productId obrigatório");
            return;
        }
        if (!NativePurchaseContract.isAllowedProductId(productId)) {
            call.reject("Produto não permitido nesta compilação");
            return;
        }
        ProductDetails detail = products.get(productId);
        if (detail == null) {
            call.reject("Consulte getProducts antes de comprar");
            return;
        }
        if (purchaseCall != null) {
            call.reject("Já existe uma compra em andamento");
            return;
        }

        BillingFlowParams.ProductDetailsParams.Builder item = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(detail);
        if (offerToken != null && !offerToken.isEmpty()) item.setOfferToken(offerToken);
        BillingFlowParams.Builder params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(java.util.Collections.singletonList(item.build()));
        if (accountToken != null && !accountToken.isEmpty()) {
            try {
                params.setObfuscatedAccountId(NativePurchaseContract.obfuscatedAccountId(accountToken));
            } catch (IllegalArgumentException invalid) {
                call.reject("accountToken inválido", invalid);
                return;
            }
        }

        purchaseCall = call;
        whenReady(call, () -> {
            BillingResult result = billingClient.launchBillingFlow(getActivity(), params.build());
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                PluginCall pending = purchaseCall;
                purchaseCall = null;
                if (pending != null) pending.reject("Não foi possível abrir a compra: " + result.getDebugMessage());
            }
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            PluginCall pending = purchaseCall;
            purchaseCall = null;
            if (pending != null) pending.resolve(new JSObject().put("platform", "android").put("state", "cancelled").put("cancelled", true));
            return;
        }
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            PluginCall pending = purchaseCall;
            purchaseCall = null;
            if (pending != null) pending.reject("A compra não foi concluída: " + result.getDebugMessage());
            return;
        }

        JSObject first = null;
        for (Purchase purchase : purchases) {
            purchasesByToken.put(purchase.getPurchaseToken(), purchase);
            JSObject payload = purchaseToJson(purchase);
            if (first == null) first = payload;
            notifyListeners("transactionUpdated", payload, true);
        }
        PluginCall pending = purchaseCall;
        purchaseCall = null;
        if (pending != null && first != null) pending.resolve(first);
    }

    private JSObject purchaseToJson(Purchase purchase) {
        String state = purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED
            ? "purchased"
            : purchase.getPurchaseState() == Purchase.PurchaseState.PENDING ? "pending" : "unspecified";
        JSArray productIds = new JSArray(purchase.getProducts());
        return new JSObject()
            .put("platform", "android")
            .put("state", state)
            .put("productId", purchase.getProducts().isEmpty() ? "" : purchase.getProducts().get(0))
            .put("products", productIds)
            .put("purchaseToken", purchase.getPurchaseToken())
            .put("transactionId", purchase.getOrderId() == null ? purchase.getPurchaseToken() : purchase.getOrderId())
            .put("purchaseTime", purchase.getPurchaseTime())
            .put("acknowledged", purchase.isAcknowledged());
    }

    @PluginMethod
    public void restore(PluginCall call) {
        whenReady(call, () -> queryOwned(BillingClient.ProductType.SUBS, subs ->
            queryOwned(BillingClient.ProductType.INAPP, oneTime -> {
                JSArray all = new JSArray();
                for (Purchase purchase : subs) all.put(purchaseToJson(purchase));
                for (Purchase purchase : oneTime) all.put(purchaseToJson(purchase));
                call.resolve(new JSObject().put("platform", "android").put("transactions", all));
            }, call), call));
    }

    private interface PurchaseListCallback { void accept(List<Purchase> purchases); }

    private void queryOwned(String type, PurchaseListCallback callback, PluginCall call) {
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(type).build(),
            (result, list) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Não foi possível restaurar compras: " + result.getDebugMessage());
                    return;
                }
                for (Purchase item : list) purchasesByToken.put(item.getPurchaseToken(), item);
                callback.accept(list);
            }
        );
    }

    private void queryOwnedAndNotify(String type) {
        if (billingClient == null || !billingClient.isReady()) return;
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(type).build(),
            (result, list) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) return;
                for (Purchase purchase : list) {
                    purchasesByToken.put(purchase.getPurchaseToken(), purchase);
                    notifyListeners("transactionUpdated", purchaseToJson(purchase), true);
                }
            }
        );
    }

    @PluginMethod
    public void finishTransaction(PluginCall call) {
        String token = call.getString("purchaseToken", call.getString("transactionId", ""));
        if (token == null || token.isEmpty()) {
            call.reject("purchaseToken obrigatório no Android");
            return;
        }
        Purchase purchase = purchasesByToken.get(token);
        if (purchase != null && purchase.isAcknowledged()) {
            call.resolve(new JSObject().put("finished", true).put("alreadyAcknowledged", true));
            return;
        }
        whenReady(call, () -> billingClient.acknowledgePurchase(
            AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build(),
            result -> {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK ||
                    result.getResponseCode() == BillingClient.BillingResponseCode.ITEM_NOT_OWNED) {
                    call.resolve(new JSObject().put("finished", true));
                } else {
                    call.reject("Compra validada, mas não reconhecida pela Play Store: " + result.getDebugMessage());
                }
            }
        ));
    }

    @Override
    protected void handleOnResume() {
        connect();
        queryOwnedAndNotify(BillingClient.ProductType.SUBS);
    }

    @Override
    protected void handleOnDestroy() {
        if (billingClient != null) billingClient.endConnection();
    }
}
