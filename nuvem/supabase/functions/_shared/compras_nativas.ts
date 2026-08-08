export type ValidacaoLoja = {
  ok: boolean;
  pendente?: boolean;
  motivo?: string;
  transacaoExternaId?: string;
  transacaoOriginalId?: string | null;
  ambiente?: string | null;
  expiraEm?: string | null;
  detalhes?: Record<string, unknown>;
};

export function base64url(bytes: Uint8Array): string {
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlTexto(valor: string): string {
  return base64url(new TextEncoder().encode(valor));
}

export function payloadJws(jws: string): Record<string, unknown> | null {
  try {
    const partes = jws.split(".");
    if (partes.length !== 3 || partes.some((p) => !p)) return null;
    let meio = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    while (meio.length % 4) meio += "=";
    const binario = atob(meio);
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    const valor = JSON.parse(new TextDecoder().decode(bytes));
    return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : null;
  } catch {
    return null;
  }
}

export function derDePem(pem: string): ArrayBuffer {
  const limpo = pem.replace(/\\n/g, "\n")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binario = atob(limpo);
  return Uint8Array.from(binario, (c) => c.charCodeAt(0)).buffer;
}

export async function jwtApple(config: {
  issuerId: string;
  keyId: string;
  privateKey: string;
  bundleId: string;
}): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64urlTexto(JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }));
  const carga = base64urlTexto(JSON.stringify({
    iss: config.issuerId,
    iat: agora,
    exp: agora + 300,
    aud: "appstoreconnect-v1",
    bid: config.bundleId,
    nonce: crypto.randomUUID(),
  }));
  const mensagem = `${cabecalho}.${carga}`;
  const chave = await crypto.subtle.importKey(
    "pkcs8",
    derDePem(config.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, chave, new TextEncoder().encode(mensagem),
  );
  return `${mensagem}.${base64url(new Uint8Array(assinatura))}`;
}

export async function jwtGoogle(config: {
  clientEmail: string;
  privateKey: string;
  privateKeyId?: string;
}): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64urlTexto(JSON.stringify({
    alg: "RS256", typ: "JWT", ...(config.privateKeyId ? { kid: config.privateKeyId } : {}),
  }));
  const carga = base64urlTexto(JSON.stringify({
    iss: config.clientEmail,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora,
    exp: agora + 3600,
  }));
  const mensagem = `${cabecalho}.${carga}`;
  const chave = await crypto.subtle.importKey(
    "pkcs8",
    derDePem(config.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", chave, new TextEncoder().encode(mensagem),
  );
  return `${mensagem}.${base64url(new Uint8Array(assinatura))}`;
}

// O argumento desta funcao DEVE ser signedTransactionInfo recebido por HTTPS da
// App Store Server API. Ela nunca torna autoritativo um JWS enviado pelo cliente.
export function validarAppleDaApi(
  signedTransactionInfo: string,
  esperado: { transactionId: string; productId: string; bundleId: string; userId: string },
  agoraMs = Date.now(),
): ValidacaoLoja {
  const p = payloadJws(signedTransactionInfo);
  if (!p) return { ok: false, motivo: "resposta_apple_invalida" };
  if (String(p.transactionId ?? "") !== esperado.transactionId) {
    return { ok: false, motivo: "transacao_apple_divergente" };
  }
  if (String(p.productId ?? "") !== esperado.productId || String(p.bundleId ?? "") !== esperado.bundleId) {
    return { ok: false, motivo: "produto_apple_divergente" };
  }
  if (String(p.appAccountToken ?? "").toLowerCase() !== esperado.userId.toLowerCase()) {
    return { ok: false, motivo: "compra_nao_vinculada_a_conta" };
  }
  if (p.revocationDate != null) return { ok: false, motivo: "compra_revogada" };
  const expiraMs = p.expiresDate == null ? null : Number(p.expiresDate);
  if (expiraMs != null && (!Number.isFinite(expiraMs) || expiraMs <= agoraMs)) {
    return { ok: false, motivo: "compra_expirada" };
  }
  return {
    ok: true,
    transacaoExternaId: String(p.transactionId),
    transacaoOriginalId: p.originalTransactionId == null ? null : String(p.originalTransactionId),
    ambiente: p.environment == null ? null : String(p.environment).toLowerCase(),
    expiraEm: expiraMs == null ? null : new Date(expiraMs).toISOString(),
    detalhes: {
      tipo: p.type == null ? null : String(p.type),
      compra_em: p.purchaseDate == null ? null : new Date(Number(p.purchaseDate)).toISOString(),
      propriedade: p.inAppOwnershipType == null ? null : String(p.inAppOwnershipType),
      storefront: p.storefront == null ? null : String(p.storefront),
    },
  };
}

export function validarGoogleProduto(
  resposta: Record<string, unknown>,
  esperado: { transactionId: string; contaOfuscada: string },
): ValidacaoLoja {
  const estado = Number(resposta.purchaseState);
  if (estado === 2) return { ok: false, pendente: true, motivo: "pagamento_google_pendente" };
  if (estado !== 0) return { ok: false, motivo: "compra_google_invalida" };
  const conta = String(resposta.obfuscatedExternalAccountId ?? "");
  if (!conta || conta !== esperado.contaOfuscada) {
    return { ok: false, motivo: "compra_nao_vinculada_a_conta" };
  }
  const orderId = String(resposta.orderId ?? "");
  if (!orderId) return { ok: false, motivo: "transacao_google_ausente" };
  if (esperado.transactionId && orderId !== esperado.transactionId) {
    return { ok: false, motivo: "transacao_google_divergente" };
  }
  return {
    ok: true,
    transacaoExternaId: orderId,
    transacaoOriginalId: orderId,
    ambiente: resposta.purchaseType === 0 ? "test" : "production",
    expiraEm: null,
    detalhes: {
      compra_em: resposta.purchaseTimeMillis == null
        ? null
        : new Date(Number(resposta.purchaseTimeMillis)).toISOString(),
      acknowledgement_state: resposta.acknowledgementState ?? null,
    },
  };
}

export function validarGoogleAssinatura(
  resposta: Record<string, unknown>,
  esperado: { productId: string; contaOfuscada: string },
  agoraMs = Date.now(),
): ValidacaoLoja {
  const estado = String(resposta.subscriptionState ?? "");
  if (["SUBSCRIPTION_STATE_PENDING", "SUBSCRIPTION_STATE_PAUSED"].includes(estado)) {
    return { ok: false, pendente: true, motivo: "assinatura_google_pendente" };
  }
  // Google keeps paid access until expiry after a user turns renewal off. Rejecting
  // CANCELED immediately would violate the subscription policy; expiryTime remains
  // the authoritative cutoff. Prepaid plans normally stay ACTIVE until that cutoff.
  if (!["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"].includes(estado)) {
    return { ok: false, motivo: "assinatura_google_inativa" };
  }
  const externos = (resposta.externalAccountIdentifiers ?? {}) as Record<string, unknown>;
  if (String(externos.obfuscatedExternalAccountId ?? "") !== esperado.contaOfuscada) {
    return { ok: false, motivo: "compra_nao_vinculada_a_conta" };
  }
  const itens = Array.isArray(resposta.lineItems) ? resposta.lineItems as Record<string, unknown>[] : [];
  const item = itens.find((i) => String(i.productId ?? "") === esperado.productId);
  if (!item) return { ok: false, motivo: "produto_google_divergente" };
  const expira = Date.parse(String(item.expiryTime ?? ""));
  if (!Number.isFinite(expira) || expira <= agoraMs) return { ok: false, motivo: "compra_expirada" };
  const orderId = String(item.latestSuccessfulOrderId ?? resposta.latestOrderId ?? "");
  if (!orderId) return { ok: false, motivo: "transacao_google_ausente" };
  return {
    ok: true,
    transacaoExternaId: orderId,
    transacaoOriginalId: orderId,
    ambiente: resposta.testPurchase ? "test" : "production",
    expiraEm: new Date(expira).toISOString(),
    detalhes: {
      estado_assinatura: estado,
      acknowledgement_state: resposta.acknowledgementState ?? null,
      inicio_em: resposta.startTime ?? null,
    },
  };
}
