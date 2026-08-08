// Google Play RTDN via Pub/Sub push autenticado. O envelope apenas localiza a
// compra; o estado e o estorno precisam ser confirmados na Developer API.

import { jwtGoogle } from "../_shared/compras_nativas.ts";
import { ErroHttp, lerJsonLimitado, sha256Hex } from "../_shared/http_security.ts";
import {
  decidirAssinaturaGoogle,
  extrairVinculoAssinaturaGoogle,
  lerMensagemRtdn,
  validarClaimsOidcGoogle,
  type AssinaturaGoogleVerificada,
  type MensagemRtdn,
} from "../_shared/notificacoes_lojas.ts";
import {
  configuracaoSupabaseWebhook,
  encerrarCompraNativa,
  finalizarNotificacao,
  reservarNotificacao,
  respostaWebhook,
  type ConfiguracaoSupabaseWebhook,
} from "../_shared/notificacoes_backend.ts";

type ContaServicoGoogle = {
  client_email: string;
  private_key: string;
  private_key_id?: string;
};

type ConfiguracaoGoogle = {
  conta: ContaServicoGoogle;
  packageName: string;
  audience: string;
  pushEmail: string;
  subscription: string;
};

let configCache: ConfiguracaoGoogle | null = null;
let acessoCache: { token: string; expiraEm: number } | null = null;

function configuracaoGoogle(): ConfiguracaoGoogle {
  if (configCache) return configCache;
  const cru = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") ?? "";
  const packageName = Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME") ?? "";
  const audience = Deno.env.get("GOOGLE_PUBSUB_AUDIENCE") ?? "";
  const pushEmail = Deno.env.get("GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL") ?? "";
  const subscription = Deno.env.get("GOOGLE_PUBSUB_SUBSCRIPTION") ?? "";
  let conta: ContaServicoGoogle;
  try { conta = JSON.parse(cru) as ContaServicoGoogle; } catch {
    throw new ErroHttp(503, "google_mal_configurada");
  }
  let audienceUrl: URL;
  try { audienceUrl = new URL(audience); } catch {
    throw new ErroHttp(503, "google_audience_invalida");
  }
  if (!conta.client_email || !conta.private_key ||
      !/^[a-zA-Z][a-zA-Z0-9_.]*(\.[a-zA-Z0-9_]+)+$/.test(packageName) ||
      audienceUrl.protocol !== "https:" || audienceUrl.username || audienceUrl.password || audienceUrl.hash ||
      !/^[^@\s]+@[^@\s]+$/.test(pushEmail) ||
      !/^projects\/[A-Za-z0-9_.:-]+\/subscriptions\/[A-Za-z0-9_.~-]+$/.test(subscription)) {
    throw new ErroHttp(503, "google_mal_configurada");
  }
  configCache = { conta, packageName, audience, pushEmail, subscription };
  return configCache;
}

async function verificarOidcPush(req: Request, cfg: ConfiguracaoGoogle): Promise<void> {
  const autorizacao = req.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._-]{20,10000})$/.exec(autorizacao);
  if (!match) throw new ErroHttp(401, "oidc_ausente");
  let resposta: Response;
  try {
    resposta = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(match[1])}`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) },
    );
  } catch {
    throw new ErroHttp(503, "oidc_google_temporariamente_indisponivel");
  }
  if (resposta.status === 429 || resposta.status >= 500) {
    throw new ErroHttp(503, "oidc_google_temporariamente_indisponivel");
  }
  const claims = await resposta.json().catch(() => null);
  if (!resposta.ok || !claims || typeof claims !== "object" || Array.isArray(claims)) {
    throw new ErroHttp(401, "oidc_invalido");
  }
  const validacao = validarClaimsOidcGoogle(claims, {
    audience: cfg.audience,
    serviceAccountEmail: cfg.pushEmail,
  });
  if (!validacao.ok) throw new ErroHttp(401, validacao.motivo);
}

async function tokenGoogle(cfg: ConfiguracaoGoogle): Promise<string> {
  if (acessoCache && acessoCache.expiraEm > Date.now() + 60_000) return acessoCache.token;
  let assertion: string;
  try {
    assertion = await jwtGoogle({
      clientEmail: cfg.conta.client_email,
      privateKey: cfg.conta.private_key,
      privateKeyId: cfg.conta.private_key_id,
    });
  } catch {
    throw new ErroHttp(503, "credenciais_google_invalidas");
  }
  let resposta: Response;
  try {
    resposta = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ErroHttp(503, "oauth_google_temporariamente_indisponivel");
  }
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok || !corpo?.access_token) throw new ErroHttp(503, "credenciais_google_recusadas");
  const expiraEm = Date.now() + Math.max(60, Number(corpo.expires_in) || 3600) * 1000;
  acessoCache = { token: String(corpo.access_token), expiraEm };
  return acessoCache.token;
}

async function obterAssinatura(
  cfg: ConfiguracaoGoogle,
  acesso: string,
  purchaseToken: string,
): Promise<AssinaturaGoogleVerificada> {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${
    encodeURIComponent(cfg.packageName)
  }/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      headers: { authorization: `Bearer ${acesso}`, accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new ErroHttp(503, "google_play_temporariamente_indisponivel");
  }
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok || !corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    const motivo = [401, 403].includes(resposta.status)
      ? "credenciais_google_recusadas"
      : resposta.status === 404 ? "assinatura_google_nao_encontrada" : "google_play_temporariamente_indisponivel";
    throw new ErroHttp(503, motivo);
  }
  return corpo as AssinaturaGoogleVerificada;
}

async function estornoConstaNaApi(
  cfg: ConfiguracaoGoogle,
  acesso: string,
  purchaseToken: string,
  orderId: string,
): Promise<boolean> {
  let pagina = "";
  const agora = Date.now();
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const url = new URL(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${
        encodeURIComponent(cfg.packageName)
      }/purchases/voidedpurchases`,
    );
    url.searchParams.set("startTime", String(agora - 29 * 86_400_000));
    url.searchParams.set("endTime", String(agora));
    url.searchParams.set("maxResults", "1000");
    url.searchParams.set("type", "1");
    if (pagina) url.searchParams.set("token", pagina);
    let resposta: Response;
    try {
      resposta = await fetch(url, {
        headers: { authorization: `Bearer ${acesso}`, accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new ErroHttp(503, "google_voided_temporariamente_indisponivel");
    }
    const corpo = await resposta.json().catch(() => null);
    if (!resposta.ok || !corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
      throw new ErroHttp(503, [401, 403].includes(resposta.status)
        ? "credenciais_google_recusadas" : "google_voided_temporariamente_indisponivel");
    }
    const compras = Array.isArray(corpo.voidedPurchases) ? corpo.voidedPurchases : [];
    if (compras.some((item: unknown) => {
      const valor = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return String(valor.purchaseToken ?? "") === purchaseToken && String(valor.orderId ?? "") === orderId;
    })) return true;
    const paginacao = corpo.tokenPagination && typeof corpo.tokenPagination === "object"
      ? corpo.tokenPagination as Record<string, unknown> : {};
    pagina = String(paginacao.nextPageToken ?? "");
    if (!pagina) return false;
  }
  throw new ErroHttp(503, "lista_google_voided_excedeu_limite");
}

async function encerrarEvento(
  supabase: ConfiguracaoSupabaseWebhook,
  eventoId: string,
  parametros: {
    transacaoId: string;
    produtoId: string;
    contaHash: string;
    status: "reembolsada" | "revogada";
    motivo: string;
    detalhes: Record<string, unknown>;
  },
): Promise<Response> {
  let encerramento: Awaited<ReturnType<typeof encerrarCompraNativa>>;
  try {
    encerramento = await encerrarCompraNativa(supabase, {
      plataforma: "google", ...parametros,
    });
  } catch (erro) {
    if (erro instanceof ErroHttp && erro.status === 422) {
      await finalizarNotificacao(supabase, {
        plataforma: "google", eventoId, status: "erro_permanente", erroCodigo: erro.codigo,
        transacaoId: parametros.transacaoId, produtoId: parametros.produtoId,
        detalhes: parametros.detalhes,
      });
      return respostaWebhook();
    }
    throw erro;
  }
  if (!encerramento.ok) {
    await finalizarNotificacao(supabase, {
      plataforma: "google", eventoId, status: "erro_temporario",
      erroCodigo: String(encerramento.motivo ?? "compra_nao_encontrada"),
      transacaoId: parametros.transacaoId, produtoId: parametros.produtoId,
      detalhes: parametros.detalhes,
    });
    return respostaWebhook(503, "compra_ainda_nao_encontrada");
  }
  await finalizarNotificacao(supabase, {
    plataforma: "google", eventoId, status: "processada",
    transacaoId: parametros.transacaoId, produtoId: parametros.produtoId,
    compraId: encerramento.compra_id ?? null, detalhes: parametros.detalhes,
  });
  return respostaWebhook();
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return respostaWebhook(405, "metodo_nao_suportado");

  let supabase: ConfiguracaoSupabaseWebhook | null = null;
  let eventoId = "";
  let reservado = false;
  try {
    const google = configuracaoGoogle();
    await verificarOidcPush(req, google);
    const corpo = await lerJsonLimitado(req, 300_000);
    const leitura = lerMensagemRtdn(corpo, google.subscription, google.packageName);
    if (!leitura.ok) throw new ErroHttp(400, leitura.motivo);
    const mensagem: MensagemRtdn = leitura.mensagem;
    eventoId = mensagem.eventoId;
    supabase = configuracaoSupabaseWebhook();
    const payloadHash = await sha256Hex(mensagem.payloadBase64);
    const reserva = await reservarNotificacao(
      supabase, "google", eventoId, payloadHash,
      mensagem.tipo === "assinatura" ? `subscription_${mensagem.notificationType}` : mensagem.tipo,
    );
    if (!reserva.processar) {
      return reserva.repetida ? respostaWebhook() : respostaWebhook(503, "evento_em_processamento");
    }
    reservado = true;

    if (mensagem.tipo === "teste") {
      await finalizarNotificacao(supabase, {
        plataforma: "google", eventoId, status: "ignorada",
        detalhes: { tipo_rtdn: "teste" },
      });
      return respostaWebhook();
    }
    if (!mensagem.purchaseToken) throw new ErroHttp(400, "purchase_token_ausente");
    const acesso = await tokenGoogle(google);
    const assinatura = await obterAssinatura(google, acesso, mensagem.purchaseToken);

    if (mensagem.tipo === "estorno") {
      const vinculo = extrairVinculoAssinaturaGoogle(assinatura, null);
      if (!vinculo.ok) {
        await finalizarNotificacao(supabase, {
          plataforma: "google", eventoId,
          status: vinculo.reintentar ? "erro_temporario" : "erro_permanente",
          erroCodigo: vinculo.motivo,
          detalhes: { tipo_rtdn: "voided" },
        });
        return vinculo.reintentar ? respostaWebhook(503, vinculo.motivo) : respostaWebhook();
      }
      if (mensagem.refundType !== 1 || !mensagem.orderId) {
        await finalizarNotificacao(supabase, {
          plataforma: "google", eventoId, status: "erro_permanente",
          erroCodigo: "estorno_parcial_ou_sem_order_id",
          detalhes: { tipo_rtdn: "voided" },
        });
        return respostaWebhook();
      }
      const confirmado = await estornoConstaNaApi(
        google, acesso, mensagem.purchaseToken, mensagem.orderId,
      );
      if (!confirmado) {
        const recente = Date.now() - mensagem.eventoEmMs < 24 * 60 * 60 * 1000;
        await finalizarNotificacao(supabase, {
          plataforma: "google", eventoId,
          status: recente ? "erro_temporario" : "erro_permanente",
          erroCodigo: "estorno_nao_confirmado_na_api",
          detalhes: { tipo_rtdn: "voided" },
        });
        return recente ? respostaWebhook(503, "estorno_ainda_nao_confirmado") : respostaWebhook();
      }
      return await encerrarEvento(supabase, eventoId, {
        transacaoId: mensagem.orderId, produtoId: vinculo.produtoId,
        contaHash: vinculo.conta, status: "reembolsada", motivo: "google_voided_purchase",
        detalhes: { tipo_rtdn: "voided" },
      });
    }

    const decisao = decidirAssinaturaGoogle(
      assinatura, mensagem.notificationType!, mensagem.subscriptionId,
    );
    const detalhes = {
      tipo_rtdn: "subscription", notification_type: mensagem.notificationType,
      estado_assinatura: String(assinatura.subscriptionState ?? ""),
    };
    if (decisao.acao === "reintentar") {
      await finalizarNotificacao(supabase, {
        plataforma: "google", eventoId, status: "erro_temporario",
        erroCodigo: decisao.motivo, detalhes,
      });
      return respostaWebhook(503, decisao.motivo);
    }
    if (decisao.acao === "ignorar") {
      const normal = ["assinatura_google_ativa", "cancelada_google_ainda_ativa", "assinatura_google_pendente"]
        .includes(decisao.motivo);
      await finalizarNotificacao(supabase, {
        plataforma: "google", eventoId, status: normal ? "ignorada" : "erro_permanente",
        erroCodigo: normal ? null : decisao.motivo, detalhes,
      });
      return respostaWebhook();
    }
    return await encerrarEvento(supabase, eventoId, {
      transacaoId: decisao.transacaoId, produtoId: decisao.produtoId,
      contaHash: decisao.conta, status: decisao.status, motivo: decisao.motivo, detalhes,
    });
  } catch (erro) {
    const http = erro instanceof ErroHttp ? erro : new ErroHttp(500, "falha_interna");
    if (reservado && supabase && eventoId) {
      await finalizarNotificacao(supabase, {
        plataforma: "google", eventoId, status: "erro_temporario", erroCodigo: http.codigo,
      }).catch(() => {});
    }
    return respostaWebhook(http.status === 422 ? 400 : http.status, http.codigo);
  }
});
