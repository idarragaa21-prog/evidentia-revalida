import {
  base64urlTexto,
  payloadJws,
  validarAppleDaApi,
  validarGoogleAssinatura,
  validarGoogleProduto,
} from "./compras_nativas.ts";

function checa(nome: string, condicao: boolean): void {
  if (!condicao) throw new Error(`falhou: ${nome}`);
}

function jws(payload: Record<string, unknown>): string {
  return `${base64urlTexto('{"alg":"ES256"}')}.${base64urlTexto(JSON.stringify(payload))}.assinatura`;
}

Deno.test("payload JWS exige tres partes", () => {
  checa("valido", payloadJws(jws({ a: 1 }))?.a === 1);
  checa("invalido", payloadJws("uma.duas") === null);
});

Deno.test("Apple so aceita resposta da API vinculada ao usuario", () => {
  const esperado = { transactionId: "2001", productId: "com.evidentia.revalida.access.30d", bundleId: "com.evidentia.revalida", userId: "11111111-1111-1111-1111-111111111111" };
  const base = { transactionId: "2001", originalTransactionId: "1001", productId: "com.evidentia.revalida.access.30d", bundleId: "com.evidentia.revalida", appAccountToken: esperado.userId, purchaseDate: 1_700_000_000_000 };
  checa("valida", validarAppleDaApi(jws(base), esperado).ok);
  checa("outra conta", validarAppleDaApi(jws({ ...base, appAccountToken: "22222222-2222-2222-2222-222222222222" }), esperado).motivo === "compra_nao_vinculada_a_conta");
  checa("revogada", validarAppleDaApi(jws({ ...base, revocationDate: 1 }), esperado).motivo === "compra_revogada");
});

Deno.test("Google produto exige compra concluida, order e conta ofuscada", () => {
  const esperado = { transactionId: "GPA.1", contaOfuscada: "hash-conta" };
  checa("valida", validarGoogleProduto({ purchaseState: 0, orderId: "GPA.1", obfuscatedExternalAccountId: "hash-conta" }, esperado).ok);
  checa("pendente", validarGoogleProduto({ purchaseState: 2 }, esperado).pendente === true);
  checa("outra conta", validarGoogleProduto({ purchaseState: 0, orderId: "GPA.1", obfuscatedExternalAccountId: "outra" }, esperado).motivo === "compra_nao_vinculada_a_conta");
});

Deno.test("Google assinatura exige produto, conta, estado e validade", () => {
  const futuro = new Date(Date.now() + 86_400_000).toISOString();
  const passado = new Date(Date.now() - 86_400_000).toISOString();
  const resposta = {
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    externalAccountIdentifiers: { obfuscatedExternalAccountId: "hash-conta" },
    lineItems: [{ productId: "com.evidentia.revalida.access.180d", expiryTime: futuro, latestSuccessfulOrderId: "GPA.2" }],
  };
  checa("valida", validarGoogleAssinatura(resposta, { productId: "com.evidentia.revalida.access.180d", contaOfuscada: "hash-conta" }).ok);
  checa("cancelada conserva acesso ate expirar", validarGoogleAssinatura(
    { ...resposta, subscriptionState: "SUBSCRIPTION_STATE_CANCELED" },
    { productId: "com.evidentia.revalida.access.180d", contaOfuscada: "hash-conta" },
  ).ok);
  checa("cancelada expirada perde acesso", validarGoogleAssinatura(
    { ...resposta, subscriptionState: "SUBSCRIPTION_STATE_CANCELED", lineItems: [{ ...resposta.lineItems[0], expiryTime: passado }] },
    { productId: "com.evidentia.revalida.access.180d", contaOfuscada: "hash-conta" },
  ).motivo === "compra_expirada");
  checa("produto divergente", validarGoogleAssinatura(resposta, { productId: "outro", contaOfuscada: "hash-conta" }).motivo === "produto_google_divergente");
});
