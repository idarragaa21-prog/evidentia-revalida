import {
  decidirAssinaturaGoogle,
  decidirNotificacaoApple,
  lerMensagemRtdn,
  validarClaimsOidcGoogle,
} from "./notificacoes_lojas.ts";

function checa(nome: string, condicao: boolean): void {
  if (!condicao) throw new Error(`falhou: ${nome}`);
}

const SKU = "com.evidentia.revalida.access.30d";
const UUID = "11111111-1111-4111-8111-111111111111";
const HASH = "a".repeat(64);

Deno.test("Apple encerra somente REFUND/REVOKE com transacao permitida", () => {
  const tx = { transactionId: "2000001", productId: SKU, appAccountToken: UUID };
  checa("refund", decidirNotificacaoApple("REFUND", tx).acao === "encerrar");
  const revoke = decidirNotificacaoApple("REVOKE", tx);
  checa("revoke", revoke.acao === "encerrar" && revoke.status === "revogada");
  checa("renovacao ignorada", decidirNotificacaoApple("DID_RENEW", tx).acao === "ignorar");
  checa("sku fechado", decidirNotificacaoApple("REFUND", { ...tx, productId: "malicioso" }).acao === "ignorar");
  checa("conta obrigatoria", decidirNotificacaoApple("REFUND", { ...tx, appAccountToken: "x" }).acao === "ignorar");
});

Deno.test("claims OIDC do push Google tem audience, issuer e conta exatos", () => {
  const esperado = { audience: "https://edge.test/google", serviceAccountEmail: "push@p.iam.gserviceaccount.com" };
  const base = { aud: esperado.audience, email: esperado.serviceAccountEmail,
    email_verified: "true", iss: "https://accounts.google.com", exp: 2_000_000_000 };
  checa("valido", validarClaimsOidcGoogle(base, esperado, 1_900_000_000).ok);
  checa("audience", !validarClaimsOidcGoogle({ ...base, aud: "outra" }, esperado, 1_900_000_000).ok);
  checa("email", !validarClaimsOidcGoogle({ ...base, email: "outra@p.iam.gserviceaccount.com" }, esperado, 1_900_000_000).ok);
  checa("exp", !validarClaimsOidcGoogle({ ...base, exp: 1 }, esperado, 1_900_000_000).ok);
});

Deno.test("envelope Pub/Sub e estritamente vinculado a subscription e pacote", () => {
  const dados = btoa(JSON.stringify({
    version: "1.0", packageName: "com.evidentia.revalida", eventTimeMillis: "1700000000000",
    subscriptionNotification: { version: "1.0", notificationType: 13,
      purchaseToken: "token-comprido-123", subscriptionId: SKU },
  }));
  const corpo = { subscription: "projects/p/subscriptions/revalida",
    message: { messageId: "evt-1", data: dados } };
  const ok = lerMensagemRtdn(corpo, "projects/p/subscriptions/revalida", "com.evidentia.revalida");
  checa("valido", ok.ok && ok.mensagem.tipo === "assinatura" && ok.mensagem.notificationType === 13);
  checa("subscription", !lerMensagemRtdn(corpo, "projects/p/subscriptions/outra", "com.evidentia.revalida").ok);
  checa("pacote", !lerMensagemRtdn(corpo, "projects/p/subscriptions/revalida", "com.outro").ok);
});

Deno.test("Google pre-pago conserva CANCELED ate expiry e encerra depois", () => {
  const futuro = new Date(Date.now() + 86_400_000).toISOString();
  const passado = new Date(Date.now() - 86_400_000).toISOString();
  const base = {
    subscriptionState: "SUBSCRIPTION_STATE_CANCELED",
    externalAccountIdentifiers: { obfuscatedExternalAccountId: HASH },
    lineItems: [{ productId: SKU, expiryTime: futuro, latestSuccessfulOrderId: "GPA.1" }],
  };
  checa("canceled futuro", decidirAssinaturaGoogle(base, 3, SKU).acao === "ignorar");
  checa("revoke aguarda API", decidirAssinaturaGoogle(base, 12, SKU).acao === "reintentar");
  const encerrada = decidirAssinaturaGoogle({ ...base,
    lineItems: [{ ...base.lineItems[0], expiryTime: passado }] }, 13, SKU);
  checa("expirada", encerrada.acao === "encerrar" && encerrada.status === "revogada");
});

Deno.test("Google nunca encerra usando apenas RTDN se API diz ativa", () => {
  const resposta = {
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    externalAccountIdentifiers: { obfuscatedExternalAccountId: HASH },
    lineItems: [{ productId: SKU, expiryTime: new Date(Date.now() + 86_400_000).toISOString(),
      latestSuccessfulOrderId: "GPA.2" }],
  };
  checa("ativa normal", decidirAssinaturaGoogle(resposta, 2, SKU).acao === "ignorar");
  checa("rtdn terminal diverge", decidirAssinaturaGoogle(resposta, 12, SKU).acao === "reintentar");
  checa("hash invalido", decidirAssinaturaGoogle({ ...resposta,
    externalAccountIdentifiers: { obfuscatedExternalAccountId: "uuid-nao-hash" } }, 13, SKU).acao === "ignorar");
});
