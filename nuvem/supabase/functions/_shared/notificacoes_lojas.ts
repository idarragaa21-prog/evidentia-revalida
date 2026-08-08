// Decisoes puras compartilhadas pelos webhooks das lojas. Este modulo nunca
// verifica assinaturas: ele so recebe objetos que o chamador ja obteve de uma
// verificacao oficial (Apple SignedDataVerifier / Google Play Developer API).

export const PRODUTOS_NATIVOS = new Set([
  "com.evidentia.revalida.access.30d",
  "com.evidentia.revalida.access.90d",
  "com.evidentia.revalida.access.180d",
]);

const UUID_CANONICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const ID_EXTERNO = /^.{1,240}$/s;

export type EncerramentoLoja = {
  acao: "encerrar";
  status: "reembolsada" | "revogada";
  motivo: string;
  transacaoId: string;
  produtoId: string;
  conta: string;
};

export type DecisaoLoja = EncerramentoLoja | {
  acao: "ignorar";
  motivo: string;
} | {
  acao: "reintentar";
  motivo: string;
};

export type TransacaoAppleVerificada = {
  transactionId?: unknown;
  originalTransactionId?: unknown;
  productId?: unknown;
  appAccountToken?: unknown;
};

/** Decide apenas depois de signedPayload e signedTransactionInfo serem verificados. */
export function decidirNotificacaoApple(
  notificationType: unknown,
  transacao?: TransacaoAppleVerificada | null,
): DecisaoLoja {
  const tipo = String(notificationType ?? "").toUpperCase();
  if (!["REFUND", "REVOKE"].includes(tipo)) {
    return { acao: "ignorar", motivo: "evento_apple_sem_encerramento" };
  }
  if (!transacao) return { acao: "reintentar", motivo: "transacao_apple_ausente" };

  const transacaoId = String(transacao.transactionId ?? "").trim();
  const produtoId = String(transacao.productId ?? "").trim();
  const conta = String(transacao.appAccountToken ?? "").trim().toLowerCase();
  if (!ID_EXTERNO.test(transacaoId)) {
    return { acao: "ignorar", motivo: "transacao_apple_invalida" };
  }
  if (!PRODUTOS_NATIVOS.has(produtoId)) {
    return { acao: "ignorar", motivo: "produto_apple_fora_da_allowlist" };
  }
  if (!UUID_CANONICO.test(conta)) {
    return { acao: "ignorar", motivo: "conta_apple_ausente_ou_invalida" };
  }
  return {
    acao: "encerrar",
    status: tipo === "REFUND" ? "reembolsada" : "revogada",
    motivo: tipo === "REFUND" ? "apple_refund" : "apple_revoke",
    transacaoId,
    produtoId,
    conta,
  };
}

export type ClaimsOidcGoogle = {
  aud?: unknown;
  email?: unknown;
  email_verified?: unknown;
  exp?: unknown;
  iss?: unknown;
};

export function validarClaimsOidcGoogle(
  claims: ClaimsOidcGoogle,
  esperado: { audience: string; serviceAccountEmail: string },
  agoraSegundos = Math.floor(Date.now() / 1000),
): { ok: true } | { ok: false; motivo: string } {
  const issuer = String(claims.iss ?? "");
  const verificado = claims.email_verified === true || String(claims.email_verified).toLowerCase() === "true";
  if (String(claims.aud ?? "") !== esperado.audience) return { ok: false, motivo: "oidc_audience_divergente" };
  if (String(claims.email ?? "").toLowerCase() !== esperado.serviceAccountEmail.toLowerCase()) {
    return { ok: false, motivo: "oidc_conta_divergente" };
  }
  if (!verificado) return { ok: false, motivo: "oidc_email_nao_verificado" };
  if (!["accounts.google.com", "https://accounts.google.com"].includes(issuer)) {
    return { ok: false, motivo: "oidc_issuer_invalido" };
  }
  const expira = Number(claims.exp);
  if (!Number.isFinite(expira) || expira <= agoraSegundos) return { ok: false, motivo: "oidc_expirado" };
  return { ok: true };
}

export type MensagemRtdn = {
  eventoId: string;
  payloadBase64: string;
  pacote: string;
  eventoEmMs: number;
  tipo: "teste" | "assinatura" | "estorno";
  notificationType: number | null;
  purchaseToken: string | null;
  orderId: string | null;
  subscriptionId: string | null;
  refundType: number | null;
};

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? valor as Record<string, unknown>
    : null;
}

function base64Json(valor: string): Record<string, unknown> | null {
  try {
    if (!valor || valor.length > 256_000 || !/^[A-Za-z0-9+/=_-]+$/.test(valor)) return null;
    let normalizado = valor.replace(/-/g, "+").replace(/_/g, "/");
    while (normalizado.length % 4) normalizado += "=";
    const binario = atob(normalizado);
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    if (bytes.byteLength > 192_000) return null;
    return objeto(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch {
    return null;
  }
}

/**
 * Valida a forma do envelope depois da autenticacao OIDC do push. O token de
 * compra continua sendo apenas um localizador e nunca se torna autoritativo.
 */
export function lerMensagemRtdn(
  corpo: Record<string, unknown>,
  subscriptionEsperada: string,
  pacoteEsperado: string,
): { ok: true; mensagem: MensagemRtdn } | { ok: false; motivo: string } {
  if (String(corpo.subscription ?? "") !== subscriptionEsperada) {
    return { ok: false, motivo: "subscription_pubsub_divergente" };
  }
  const envelope = objeto(corpo.message);
  const eventoId = String(envelope?.messageId ?? envelope?.message_id ?? "").trim();
  const payloadBase64 = String(envelope?.data ?? "");
  if (!ID_EXTERNO.test(eventoId)) return { ok: false, motivo: "message_id_invalido" };
  const evento = base64Json(payloadBase64);
  if (!evento) return { ok: false, motivo: "dados_pubsub_invalidos" };
  const pacote = String(evento.packageName ?? "");
  if (pacote !== pacoteEsperado) return { ok: false, motivo: "pacote_google_divergente" };

  const teste = objeto(evento.testNotification);
  const assinatura = objeto(evento.subscriptionNotification);
  const estorno = objeto(evento.voidedPurchaseNotification);
  const quantidade = Number(Boolean(teste)) + Number(Boolean(assinatura)) + Number(Boolean(estorno));
  if (quantidade !== 1) return { ok: false, motivo: "tipo_rtdn_invalido" };

  const eventoEmMs = Number(evento.eventTimeMillis);
  if (!Number.isFinite(eventoEmMs) || eventoEmMs <= 0) {
    return { ok: false, motivo: "event_time_invalido" };
  }
  if (teste) {
    return { ok: true, mensagem: {
      eventoId, payloadBase64, pacote, eventoEmMs, tipo: "teste",
      notificationType: null, purchaseToken: null, orderId: null, subscriptionId: null, refundType: null,
    } };
  }

  const notificacao = assinatura ?? estorno!;
  const purchaseToken = String(notificacao.purchaseToken ?? "").trim();
  if (purchaseToken.length < 10 || purchaseToken.length > 8_000) {
    return { ok: false, motivo: "purchase_token_invalido" };
  }
  if (assinatura) {
    const notificationType = Number(assinatura.notificationType);
    if (!Number.isInteger(notificationType) || notificationType < 1 || notificationType > 22) {
      return { ok: false, motivo: "notification_type_invalido" };
    }
    const subscriptionId = String(assinatura.subscriptionId ?? "").trim() || null;
    return { ok: true, mensagem: {
      eventoId, payloadBase64, pacote, eventoEmMs, tipo: "assinatura",
      notificationType, purchaseToken, orderId: null, subscriptionId, refundType: null,
    } };
  }

  const orderId = String(estorno!.orderId ?? "").trim();
  if (!ID_EXTERNO.test(orderId)) return { ok: false, motivo: "order_id_invalido" };
  if (Number(estorno!.productType) !== 1) return { ok: false, motivo: "produto_rtdn_nao_e_assinatura" };
  const refundType = Number(estorno!.refundType);
  if (![1, 2].includes(refundType)) return { ok: false, motivo: "refund_type_invalido" };
  return { ok: true, mensagem: {
    eventoId, payloadBase64, pacote, eventoEmMs, tipo: "estorno",
    notificationType: null, purchaseToken, orderId, subscriptionId: null, refundType,
  } };
}

type ItemAssinaturaGoogle = {
  productId?: unknown;
  expiryTime?: unknown;
  latestSuccessfulOrderId?: unknown;
};

export type AssinaturaGoogleVerificada = {
  subscriptionState?: unknown;
  externalAccountIdentifiers?: unknown;
  lineItems?: unknown;
  latestOrderId?: unknown;
};

export type VinculoAssinaturaGoogle = {
  ok: true;
  conta: string;
  produtoId: string;
  transacaoId: string;
  expiraMs: number;
  estado: string;
};

export function extrairVinculoAssinaturaGoogle(
  resposta: AssinaturaGoogleVerificada,
  subscriptionId: string | null,
): VinculoAssinaturaGoogle | { ok: false; reintentar: boolean; motivo: string } {
  const externos = objeto(resposta.externalAccountIdentifiers);
  const conta = String(externos?.obfuscatedExternalAccountId ?? "").trim().toLowerCase();
  if (!SHA256_HEX.test(conta)) {
    return { ok: false, reintentar: false, motivo: "conta_google_ausente_ou_invalida" };
  }

  const itens = Array.isArray(resposta.lineItems)
    ? resposta.lineItems.map(objeto).filter(Boolean) as ItemAssinaturaGoogle[]
    : [];
  const candidatos = itens.filter((item) => PRODUTOS_NATIVOS.has(String(item.productId ?? "")));
  const item = subscriptionId
    ? candidatos.find((i) => String(i.productId ?? "") === subscriptionId)
    : candidatos.length === 1 ? candidatos[0] : undefined;
  if (!item || (subscriptionId && !PRODUTOS_NATIVOS.has(subscriptionId))) {
    return { ok: false, reintentar: false, motivo: "produto_google_fora_da_allowlist" };
  }
  if (!subscriptionId && candidatos.length !== 1) {
    return { ok: false, reintentar: true, motivo: "produto_google_ambiguo" };
  }

  const produtoId = String(item.productId);
  const transacaoId = String(item.latestSuccessfulOrderId ?? resposta.latestOrderId ?? "").trim();
  if (!ID_EXTERNO.test(transacaoId)) {
    return { ok: false, reintentar: true, motivo: "order_id_google_ausente" };
  }
  const expiraMs = Date.parse(String(item.expiryTime ?? ""));
  if (!Number.isFinite(expiraMs)) {
    return { ok: false, reintentar: true, motivo: "expiry_google_invalido" };
  }
  return { ok: true, conta, produtoId, transacaoId, expiraMs,
    estado: String(resposta.subscriptionState ?? "") };
}

/** Decide usando exclusivamente a resposta autoritativa subscriptionsv2.get. */
export function decidirAssinaturaGoogle(
  resposta: AssinaturaGoogleVerificada,
  notificationType: number,
  subscriptionId: string | null,
  agoraMs = Date.now(),
): DecisaoLoja {
  const vinculo = extrairVinculoAssinaturaGoogle(resposta, subscriptionId);
  if (!vinculo.ok) {
    if (vinculo.reintentar) return { acao: "reintentar", motivo: vinculo.motivo };
    return { acao: "ignorar", motivo: vinculo.motivo };
  }
  const { conta, produtoId, transacaoId, expiraMs, estado } = vinculo;
  const terminalRtdn = [12, 13].includes(notificationType);
  if (estado === "SUBSCRIPTION_STATE_CANCELED" && expiraMs > agoraMs) {
    // Planos pre-pagos mantem o acesso pago ate expiryTime.
    return terminalRtdn
      ? { acao: "reintentar", motivo: "estado_google_ainda_nao_propagado" }
      : { acao: "ignorar", motivo: "cancelada_google_ainda_ativa" };
  }
  if (["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"].includes(estado) && expiraMs > agoraMs) {
    return terminalRtdn
      ? { acao: "reintentar", motivo: "estado_google_ainda_nao_propagado" }
      : { acao: "ignorar", motivo: "assinatura_google_ativa" };
  }
  if (estado === "SUBSCRIPTION_STATE_PENDING") {
    return { acao: "ignorar", motivo: "assinatura_google_pendente" };
  }

  const estadosSemAcesso = new Set([
    "SUBSCRIPTION_STATE_EXPIRED",
    "SUBSCRIPTION_STATE_ON_HOLD",
    "SUBSCRIPTION_STATE_PAUSED",
    "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED",
  ]);
  if (expiraMs <= agoraMs || estadosSemAcesso.has(estado) || estado === "SUBSCRIPTION_STATE_CANCELED") {
    return {
      acao: "encerrar",
      status: "revogada",
      motivo: notificationType === 12 ? "google_revoked" : "google_sem_acesso",
      transacaoId,
      produtoId,
      conta,
    };
  }
  return { acao: "reintentar", motivo: "estado_google_desconhecido" };
}
