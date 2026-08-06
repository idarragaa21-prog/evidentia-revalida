// Evidentia · Revalida — cria o pedido e devolve a URL de pagamento do dLocal Go.
//
// Chamada pela página de venda, sem sessão: a pessoa informa e-mail e plano, e
// recebe de volta o link do checkout (PIX ou cartão, em reais). O PREÇO NUNCA
// VEM DO NAVEGADOR: sai da tabela `planos`, que o dono edita pelo painel. O
// pedido fica congelado em `checkouts` — se o preço mudar depois, quem já abriu
// o checkout paga o que viu.
//
// A ativação NÃO acontece aqui nem no redirect de sucesso: só o webhook, depois
// de conferir o pagamento na API do provedor, ativa o acesso.
//
// Secrets: DLOCALGO_API_KEY, DLOCALGO_SECRET_KEY,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//          DLOCALGO_API_HOST (opcional; https://api-sbx.dlocalgo.com no sandbox).
//          REVALIDA_URL_ASSINAR (opcional; padrão: página de venda no Pages).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const URL_ASSINAR_PADRAO = "https://idarragaa21-prog.github.io/evidentia-revalida/assinar/";

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
  });
}

function urlAssinar(): string {
  return (Deno.env.get("REVALIDA_URL_ASSINAR") ?? URL_ASSINAR_PADRAO).replace(/\/+$/, "/");
}

function dlocalHost(): string {
  return (Deno.env.get("DLOCALGO_API_HOST") ?? "https://api.dlocalgo.com").replace(/\/+$/, "");
}

function idAleatorio(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function rpcServico(nome: string, corpo: Record<string, unknown>): Promise<Response> {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${url}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${service}`,
      apikey: service ?? "",
      "content-type": "application/json",
    },
    body: JSON.stringify(corpo),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "metodo nao suportado" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json({ erro: "servidor mal configurado" }, 500);

  const apiKey = Deno.env.get("DLOCALGO_API_KEY");
  const segredo = Deno.env.get("DLOCALGO_SECRET_KEY");
  if (!apiKey || !segredo) {
    // Deploy sem as credenciais do provedor: a página de venda mostra este aviso
    // em vez de um botão quebrado.
    return json({ erro: "pagamentos_nao_ativados" }, 503);
  }

  // Corpo pequeno e estrito: e-mail + plano, nada mais.
  const cru = await req.text();
  if (cru.length > 2048) return json({ erro: "corpo grande demais" }, 413);
  let corpo: Record<string, unknown>;
  try {
    corpo = JSON.parse(cru);
  } catch {
    return json({ erro: "corpo ilegivel" }, 400);
  }

  const email = String(corpo?.email ?? "").toLowerCase().trim();
  const planoId = String(corpo?.plano_id ?? "").toLowerCase().trim();
  if (!/^[^\s@]{1,120}@[^\s@]{1,120}\.[^\s@]{2,24}$/.test(email)) {
    return json({ erro: "email invalido" }, 400);
  }
  if (!/^[a-z0-9_-]{2,40}$/.test(planoId)) {
    return json({ erro: "plano invalido" }, 400);
  }

  // 1. Registra o pedido. O banco valida o plano (existe, ativo, preço > 0) e
  //    congela e-mail, dias e preço.
  const orderId = `ev-${planoId}-${idAleatorio()}`;
  const registro = await rpcServico("registrar_checkout", {
    p_order_id: orderId,
    p_email: email,
    p_plano_id: planoId,
  });
  if (!registro.ok) {
    const detalhe = await registro.text();
    const foraDeVenda = /inexistente|fora de venda/i.test(detalhe);
    return json({ erro: foraDeVenda ? "plano_fora_de_venda" : "nao_foi_possivel_registrar" },
      foraDeVenda ? 404 : 502);
  }
  const pedido = await registro.json();

  // 2. Cria o pagamento no dLocal Go. O comprador paga em reais, como transação
  //    doméstica no Brasil (PIX ou cartão), e volta para a página de venda.
  const resposta = await fetch(`${dlocalHost()}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}:${segredo}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount: Number((Number(pedido.preco_centavos) / 100).toFixed(2)),
      currency: String(pedido.moeda ?? "BRL"),
      country: "BR",
      order_id: orderId,
      description: `Evidentia Revalida — ${pedido.nome} (${pedido.dias} dias)`.slice(0, 100),
      payer: { email },
      success_url: `${urlAssinar()}?compra=confirmada&pedido=${orderId}`,
      back_url: urlAssinar(),
      notification_url: `${url}/functions/v1/webhook-pagamento/dlocalgo`,
    }),
  });

  if (!resposta.ok) {
    await rpcServico("anotar_checkout", {
      p_order_id: orderId,
      p_payment_id: null,
      p_status: "falha_provedor",
    });
    return json({ erro: "provedor_indisponivel" }, 502);
  }

  const pagamento = await resposta.json();
  const redirect = String(pagamento?.redirect_url ?? "");
  if (!redirect) return json({ erro: "provedor_sem_redirect" }, 502);

  await rpcServico("anotar_checkout", {
    p_order_id: orderId,
    p_payment_id: String(pagamento?.id ?? ""),
    p_status: "aguardando_pagamento",
  });

  return json({
    ok: true,
    pedido: orderId,
    plano: pedido.plano_id,
    preco_centavos: pedido.preco_centavos,
    redirect_url: redirect,
  });
});
