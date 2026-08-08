// Cria checkout dLocal Go sem confiar em preco/dias do navegador. A funcao e
// publica, mas usa allowlist de origem, limite atomico no banco e Turnstile
// quando TURNSTILE_SECRET_KEY estiver configurado.

import {
  ErroHttp,
  lerJsonLimitado,
  origemAceita,
  respostaJson,
  respostaPreflight,
  urlHttpsPermitida,
  validarTurnstile,
} from "../_shared/http_security.ts";

const URL_ASSINAR_PADRAO = "https://idarragaa21-prog.github.io/evidentia-revalida/assinar/";

function urlAssinar(): string {
  const valor = Deno.env.get("REVALIDA_URL_ASSINAR") ?? URL_ASSINAR_PADRAO;
  const url = urlHttpsPermitida(valor, ["github.io", "evidentia.app", "evidentia.com.br"]);
  if (!url) throw new ErroHttp(500, "url_de_retorno_invalida");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function dlocalHost(): string {
  const valor = Deno.env.get("DLOCALGO_API_HOST") ?? "https://api.dlocalgo.com";
  const url = urlHttpsPermitida(valor, ["api.dlocalgo.com", "api-sbx.dlocalgo.com"]);
  if (!url || url.pathname !== "/") throw new ErroHttp(500, "host_dlocal_invalido");
  return url.origin;
}

function idAleatorio(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function rpcServico(
  nome: string,
  corpo: Record<string, unknown>,
  url: string,
  service: string,
): Promise<Response> {
  return fetch(`${url}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${service}`,
      apikey: service,
      "content-type": "application/json",
    },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(10_000),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return respostaPreflight(req);
  if (!origemAceita(req)) return respostaJson(req, { erro: "origem_nao_permitida" }, 403);
  if (req.method !== "POST") return respostaJson(req, { erro: "metodo_nao_suportado" }, 405);

  try {
    const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !service) throw new ErroHttp(500, "servidor_mal_configurado");

    const apiKey = Deno.env.get("DLOCALGO_API_KEY") ?? "";
    const segredo = Deno.env.get("DLOCALGO_SECRET_KEY") ?? "";
    if (!apiKey || !segredo) return respostaJson(req, { erro: "pagamentos_nao_ativados" }, 503);

    const corpo = await lerJsonLimitado(req, 2_048);
    const email = String(corpo.email ?? "").toLowerCase().trim();
    const planoId = String(corpo.plano_id ?? "").toLowerCase().trim();
    const turnstile = String(corpo.turnstile_token ?? "").trim();
    if (Object.keys(corpo).some((k) => !["email", "plano_id", "turnstile_token"].includes(k))) {
      throw new ErroHttp(400, "campos_desconhecidos");
    }
    if (!/^[^\s@]{1,120}@[^\s@]{1,120}\.[^\s@]{2,24}$/.test(email)) {
      throw new ErroHttp(400, "email_invalido");
    }
    if (!/^[a-z0-9_-]{2,40}$/.test(planoId)) throw new ErroHttp(400, "plano_invalido");
    if (!await validarTurnstile(turnstile)) throw new ErroHttp(403, "verificacao_antiabuso_falhou");

    // O trigger do banco serializa a contagem por e-mail, inclusive entre
    // instancias simultaneas desta Edge Function.
    const orderId = `ev-${planoId}-${idAleatorio()}`;
    const registro = await rpcServico("registrar_checkout", {
      p_order_id: orderId,
      p_email: email,
      p_plano_id: planoId,
    }, url, service);
    if (!registro.ok) {
      const detalhe = await registro.text();
      if (/53400|muitos pedidos/i.test(detalhe)) throw new ErroHttp(429, "limite_de_tentativas");
      if (/inexistente|fora de venda/i.test(detalhe)) throw new ErroHttp(404, "plano_fora_de_venda");
      throw new ErroHttp(502, "nao_foi_possivel_registrar");
    }
    const pedido = await registro.json();

    const retorno = urlAssinar();
    let resposta: Response;
    try {
      resposta = await fetch(`${dlocalHost()}/v1/payments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}:${segredo}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          amount: Number((Number(pedido.preco_centavos) / 100).toFixed(2)),
          currency: String(pedido.moeda ?? "BRL"),
          country: "BR",
          order_id: orderId,
          description: `Evidentia Revalida — ${pedido.nome} (${pedido.dias} dias)`.slice(0, 100),
          payer: { email },
          success_url: `${retorno}?compra=confirmada&pedido=${encodeURIComponent(orderId)}`,
          back_url: retorno,
          notification_url: `${url}/functions/v1/webhook-pagamento/dlocalgo`,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      await rpcServico("anotar_checkout", {
        p_order_id: orderId, p_payment_id: null, p_status: "falha_provedor",
      }, url, service).catch(() => {});
      throw new ErroHttp(502, "provedor_indisponivel");
    }

    if (!resposta.ok) {
      await rpcServico("anotar_checkout", {
        p_order_id: orderId, p_payment_id: null, p_status: "falha_provedor",
      }, url, service).catch(() => {});
      throw new ErroHttp(502, "provedor_indisponivel");
    }

    const pagamento = await resposta.json().catch(() => null);
    const redirect = urlHttpsPermitida(String(pagamento?.redirect_url ?? ""), ["dlocalgo.com"]);
    if (!redirect) {
      await rpcServico("anotar_checkout", {
        p_order_id: orderId, p_payment_id: String(pagamento?.id ?? ""), p_status: "falha_provedor",
      }, url, service).catch(() => {});
      throw new ErroHttp(502, "provedor_sem_redirect_valido");
    }

    await rpcServico("anotar_checkout", {
      p_order_id: orderId,
      p_payment_id: String(pagamento?.id ?? ""),
      p_status: "aguardando_pagamento",
    }, url, service);

    return respostaJson(req, {
      ok: true,
      pedido: orderId,
      plano: pedido.plano_id,
      preco_centavos: pedido.preco_centavos,
      redirect_url: redirect.toString(),
    });
  } catch (erro) {
    if (erro instanceof ErroHttp) return respostaJson(req, { erro: erro.codigo }, erro.status);
    return respostaJson(req, { erro: "erro_interno" }, 500);
  }
});
