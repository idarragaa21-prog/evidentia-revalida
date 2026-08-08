// Valida compras Apple/Google no servidor. Nenhum dado enviado pelo cliente
// concede acesso sozinho; o entitlement nasce apenas depois da resposta oficial
// da App Store Server API ou Google Play Developer API.

import {
  jwtApple,
  jwtGoogle,
  payloadJws,
  validarAppleDaApi,
  validarGoogleAssinatura,
  validarGoogleProduto,
  type ValidacaoLoja,
} from "../_shared/compras_nativas.ts";
import {
  ErroHttp,
  lerJsonLimitado,
  origemAceita,
  respostaJson,
  respostaPreflight,
  sha256Hex,
} from "../_shared/http_security.ts";

type Usuario = { id: string; email?: string };
type ProdutoLoja = { plataforma: "apple" | "google"; produto_id: string; plano_id: string; tipo: "consumivel" | "nao_consumivel" | "assinatura" };

const PRODUTOS_NATIVOS = new Set([
  "com.evidentia.revalida.access.30d",
  "com.evidentia.revalida.access.90d",
  "com.evidentia.revalida.access.180d",
]);

function configuracaoSupabase(): { url: string; anon: string; service: string } {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !anon || !service) throw new ErroHttp(500, "servidor_mal_configurado");
  return { url, anon, service };
}

async function usuarioDaSessao(req: Request, cfg: ReturnType<typeof configuracaoSupabase>): Promise<Usuario> {
  const autorizacao = req.headers.get("authorization") ?? "";
  if (!autorizacao.toLowerCase().startsWith("bearer ")) throw new ErroHttp(401, "sessao_ausente");
  const resposta = await fetch(`${cfg.url}/auth/v1/user`, {
    headers: { authorization: autorizacao, apikey: cfg.anon },
    signal: AbortSignal.timeout(8_000),
  });
  if (!resposta.ok) throw new ErroHttp(401, "sessao_invalida_ou_expirada");
  const usuario = await resposta.json().catch(() => null);
  if (!usuario?.id) throw new ErroHttp(401, "sessao_invalida");
  return { id: String(usuario.id), email: usuario.email == null ? undefined : String(usuario.email) };
}

async function rpc<T>(
  cfg: ReturnType<typeof configuracaoSupabase>,
  nome: string,
  corpo: Record<string, unknown>,
): Promise<T> {
  const resposta = await fetch(`${cfg.url}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cfg.service}`,
      apikey: cfg.service,
      "content-type": "application/json",
    },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(10_000),
  });
  const texto = await resposta.text();
  let valor: unknown = null;
  try { valor = texto ? JSON.parse(texto) : null; } catch { /* mensagem generica abaixo */ }
  if (!resposta.ok) {
    const mensagem = String((valor as Record<string, unknown> | null)?.message ?? "");
    const codigo = String((valor as Record<string, unknown> | null)?.code ?? "");
    if (/outra conta|ja associado/i.test(mensagem)) throw new ErroHttp(409, "comprovante_ja_associado");
    if (/compra encerrada|transacao oficial esta encerrada/i.test(mensagem)) {
      throw new ErroHttp(422, "compra_encerrada");
    }
    if (codigo === "53400" || /muitas verificacoes/i.test(mensagem)) {
      throw new ErroHttp(429, "limite_de_verificacoes");
    }
    throw new ErroHttp(502, `rpc_${nome}_falhou`);
  }
  return valor as T;
}

async function marcar(
  cfg: ReturnType<typeof configuracaoSupabase>,
  compraId: string,
  status: "pendente_verificacao" | "rejeitada",
  motivo: string,
  detalhes: Record<string, unknown> = {},
): Promise<void> {
  await rpc(cfg, "marcar_compra_nativa", {
    p_compra_id: compraId,
    p_status: status,
    p_erro_codigo: motivo,
    p_detalhes: detalhes,
  }).catch(() => {});
}

function segredosApple(): null | {
  issuerId: string; keyId: string; privateKey: string; bundleId: string; ambiente: string;
} {
  const valor = {
    issuerId: Deno.env.get("APPLE_APP_STORE_ISSUER_ID") ?? "",
    keyId: Deno.env.get("APPLE_APP_STORE_KEY_ID") ?? "",
    privateKey: Deno.env.get("APPLE_APP_STORE_PRIVATE_KEY") ?? "",
    bundleId: Deno.env.get("APPLE_BUNDLE_ID") ?? "",
    ambiente: (Deno.env.get("APPLE_APP_STORE_ENVIRONMENT") ?? "production").toLowerCase(),
  };
  return valor.issuerId && valor.keyId && valor.privateKey && valor.bundleId ? valor : null;
}

async function obterJwsApple(
  transactionId: string,
  segredo: NonNullable<ReturnType<typeof segredosApple>>,
): Promise<{ jws?: string; ambiente?: string; pendente?: string; invalida?: string }> {
  let bearer: string;
  try { bearer = await jwtApple(segredo); } catch { return { pendente: "credenciais_apple_invalidas" }; }
  if (!["production", "sandbox", "both"].includes(segredo.ambiente)) return { pendente: "ambiente_apple_invalido" };
  const ambientes = segredo.ambiente === "both" ? ["production", "sandbox"] : [segredo.ambiente];
  for (const ambiente of ambientes) {
    const host = ambiente === "sandbox" ? "https://api.storekit-sandbox.apple.com" : "https://api.storekit.apple.com";
    let resposta: Response;
    try {
      resposta = await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
        headers: { authorization: `Bearer ${bearer}`, accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
    } catch { return { pendente: "apple_temporariamente_indisponivel" }; }
    const corpo = await resposta.json().catch(() => null);
    if (resposta.ok && corpo?.signedTransactionInfo) {
      return { jws: String(corpo.signedTransactionInfo), ambiente };
    }
    const codigo = String(corpo?.errorCode ?? "");
    if (resposta.status === 404 && codigo === "4040010" && ambiente === "production" && segredo.ambiente === "both") continue;
    if (resposta.status === 401) return { pendente: "credenciais_apple_recusadas" };
    if (resposta.status === 429 || resposta.status >= 500) return { pendente: "apple_temporariamente_indisponivel" };
    return { invalida: "transacao_apple_nao_encontrada" };
  }
  return { invalida: "transacao_apple_nao_encontrada" };
}

type ContaGoogle = { client_email: string; private_key: string; private_key_id?: string };
function segredosGoogle(): { conta: ContaGoogle; packageName: string } | null {
  const cru = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") ?? "";
  const packageName = Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME") ?? "";
  if (!cru || !packageName) return null;
  try {
    const conta = JSON.parse(cru) as ContaGoogle;
    return conta.client_email && conta.private_key ? { conta, packageName } : null;
  } catch { return null; }
}

async function tokenGoogle(segredo: NonNullable<ReturnType<typeof segredosGoogle>>): Promise<string | null> {
  try {
    const assertion = await jwtGoogle({
      clientEmail: segredo.conta.client_email,
      privateKey: segredo.conta.private_key,
      privateKeyId: segredo.conta.private_key_id,
    });
    const resposta = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const corpo = await resposta.json().catch(() => null);
    return resposta.ok && corpo?.access_token ? String(corpo.access_token) : null;
  } catch { return null; }
}

async function verificarGoogle(
  tokenCompra: string,
  produto: ProdutoLoja,
  segredo: NonNullable<ReturnType<typeof segredosGoogle>>,
  transactionId: string,
  contaOfuscada: string,
): Promise<ValidacaoLoja> {
  const acesso = await tokenGoogle(segredo);
  if (!acesso) return { ok: false, pendente: true, motivo: "credenciais_google_recusadas" };
  const pacote = encodeURIComponent(segredo.packageName);
  const token = encodeURIComponent(tokenCompra);
  const produtoId = encodeURIComponent(produto.produto_id);
  const url = produto.tipo === "assinatura"
    ? `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pacote}/purchases/subscriptionsv2/tokens/${token}`
    : `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pacote}/purchases/products/${produtoId}/tokens/${token}`;
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      headers: { authorization: `Bearer ${acesso}`, accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch { return { ok: false, pendente: true, motivo: "google_temporariamente_indisponivel" }; }
  const corpo = await resposta.json().catch(() => null);
  if (resposta.status === 401 || resposta.status === 403) {
    return { ok: false, pendente: true, motivo: "credenciais_google_recusadas" };
  }
  if (resposta.status === 429 || resposta.status >= 500) {
    return { ok: false, pendente: true, motivo: "google_temporariamente_indisponivel" };
  }
  if (!resposta.ok || !corpo || typeof corpo !== "object") {
    return { ok: false, motivo: "transacao_google_nao_encontrada" };
  }
  return produto.tipo === "assinatura"
    ? validarGoogleAssinatura(corpo, { productId: produto.produto_id, contaOfuscada })
    : validarGoogleProduto(corpo, { transactionId, contaOfuscada });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return respostaPreflight(req);
  if (!origemAceita(req)) return respostaJson(req, { ativo: false, motivo: "origem_nao_permitida" }, 403);
  if (req.method !== "POST") return respostaJson(req, { ativo: false, motivo: "metodo_nao_suportado" }, 405);

  let cfg: ReturnType<typeof configuracaoSupabase>;
  let compraId = "";
  try {
    cfg = configuracaoSupabase();
    const usuario = await usuarioDaSessao(req, cfg);
    const corpo = await lerJsonLimitado(req, 40_960);
    const permitidas = new Set(["platform", "productId", "transactionId", "signedTransaction", "purchaseToken"]);
    if (Object.keys(corpo).some((k) => !permitidas.has(k))) throw new ErroHttp(400, "campos_desconhecidos");

    const plataforma = String(corpo.platform ?? "").toLowerCase();
    const productId = String(corpo.productId ?? "").trim();
    const transactionId = String(corpo.transactionId ?? "").trim();
    const signedTransaction = String(corpo.signedTransaction ?? "").trim();
    const purchaseToken = String(corpo.purchaseToken ?? "").trim();
    if (!["apple", "google"].includes(plataforma)) throw new ErroHttp(400, "plataforma_invalida");
    if (productId.length < 2 || productId.length > 200 || transactionId.length < 1 || transactionId.length > 240) {
      throw new ErroHttp(400, "identificadores_invalidos");
    }
    if (!PRODUTOS_NATIVOS.has(productId)) throw new ErroHttp(422, "produto_nao_permitido");
    if (plataforma === "apple" && (signedTransaction.length < 20 || signedTransaction.length > 32_000)) {
      throw new ErroHttp(400, "signed_transaction_ausente");
    }
    if (plataforma === "google" && (purchaseToken.length < 10 || purchaseToken.length > 8_000)) {
      throw new ErroHttp(400, "purchase_token_ausente");
    }

    // O payload do JWS do cliente serve apenas para detectar erro de transporte.
    // Mesmo coincidindo, ele jamais e usado para conceder acesso.
    if (plataforma === "apple") {
      const candidato = payloadJws(signedTransaction);
      if (!candidato || String(candidato.transactionId ?? "") !== transactionId ||
          String(candidato.productId ?? "") !== productId) {
        throw new ErroHttp(400, "signed_transaction_divergente");
      }
    }

    const credencialHash = await sha256Hex(plataforma === "apple" ? signedTransaction : purchaseToken);
    const solicitacao = await rpc<Record<string, unknown>>(cfg, "registrar_solicitacao_compra_nativa", {
      p_user_id: usuario.id,
      p_plataforma: plataforma,
      p_produto_id: productId,
      p_transacao_informada: transactionId,
      p_credencial_hash: credencialHash,
    });
    compraId = String(solicitacao.id ?? "");
    if (solicitacao.ativo === true) return respostaJson(req, { ativo: true });

    const produto = await rpc<ProdutoLoja | null>(cfg, "consultar_produto_loja", {
      p_plataforma: plataforma,
      p_produto_id: productId,
    });
    if (!produto) {
      await marcar(cfg, compraId, "rejeitada", "produto_nao_configurado");
      return respostaJson(req, { ativo: false, motivo: "produto_nao_configurado" }, 422);
    }

    let validacao: ValidacaoLoja;
    if (plataforma === "apple") {
      const segredo = segredosApple();
      if (!segredo) {
        await marcar(cfg, compraId, "pendente_verificacao", "credenciais_apple_ausentes");
        return respostaJson(req, { ativo: false, pendente: true, motivo: "credenciais_apple_ausentes" }, 202);
      }
      const api = await obterJwsApple(transactionId, segredo);
      if (api.pendente) {
        await marcar(cfg, compraId, "pendente_verificacao", api.pendente);
        return respostaJson(req, { ativo: false, pendente: true, motivo: api.pendente }, 202);
      }
      if (!api.jws) {
        const motivo = api.invalida ?? "transacao_apple_invalida";
        await marcar(cfg, compraId, "rejeitada", motivo);
        return respostaJson(req, { ativo: false, motivo }, 422);
      }
      validacao = validarAppleDaApi(api.jws, {
        transactionId, productId, bundleId: segredo.bundleId, userId: usuario.id,
      });
      if (validacao.ok) validacao.ambiente = api.ambiente ?? validacao.ambiente;
    } else {
      const segredo = segredosGoogle();
      if (!segredo) {
        await marcar(cfg, compraId, "pendente_verificacao", "credenciais_google_ausentes");
        return respostaJson(req, { ativo: false, pendente: true, motivo: "credenciais_google_ausentes" }, 202);
      }
      const contaOfuscada = await sha256Hex(usuario.id.toLowerCase());
      validacao = await verificarGoogle(purchaseToken, produto, segredo, transactionId, contaOfuscada);
    }

    if (!validacao.ok) {
      const motivo = validacao.motivo ?? "compra_invalida";
      const estado = validacao.pendente ? "pendente_verificacao" : "rejeitada";
      await marcar(cfg, compraId, estado, motivo);
      return respostaJson(req,
        { ativo: false, ...(validacao.pendente ? { pendente: true } : {}), motivo },
        validacao.pendente ? 202 : 422);
    }

    const confirmacao = await rpc<Record<string, unknown>>(cfg, "confirmar_compra_nativa", {
      p_compra_id: compraId,
      p_transacao_externa_id: validacao.transacaoExternaId,
      p_transacao_original_id: validacao.transacaoOriginalId ?? null,
      p_ambiente: validacao.ambiente ?? null,
      p_expira_em: validacao.expiraEm ?? null,
      p_detalhes: validacao.detalhes ?? {},
    });
    if (confirmacao.ativo !== true) throw new ErroHttp(502, "confirmacao_sem_entitlement");
    return respostaJson(req, { ativo: true });
  } catch (erro) {
    if (erro instanceof ErroHttp) {
      return respostaJson(req, { ativo: false, motivo: erro.codigo }, erro.status);
    }
    if (compraId) {
      try {
        const cfgFalha = configuracaoSupabase();
        await marcar(cfgFalha, compraId, "pendente_verificacao", "erro_temporario_backend");
      } catch { /* sem acao */ }
      return respostaJson(req, { ativo: false, pendente: true, motivo: "erro_temporario_backend" }, 202);
    }
    return respostaJson(req, { ativo: false, motivo: "erro_interno" }, 500);
  }
});
