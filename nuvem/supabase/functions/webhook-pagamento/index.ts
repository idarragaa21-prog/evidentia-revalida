// Evidentia · Revalida — recebedor de eventos de pagamento.
//
// Atende dois provedores pela mesma porta:
//   POST .../webhook-pagamento/hotmart   (provedor de lancamento)
//   POST .../webhook-pagamento/stripe    (quando houver entidade no exterior)
//
// Sem sufixo, o provedor e deduzido pelos cabecalhos. Um evento sem assinatura
// valida e recusado antes de tocar o banco; um evento repetido nao aplica nada
// duas vezes, garantido pela restricao unica de public.eventos_pagamento.
//
// Secrets: HOTMART_HOTTOK, STRIPE_WEBHOOK_SECRET,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REVALIDA_DIAS_PADRAO.

const TOLERANCIA_SEGUNDOS = 300;

function texto(corpo: string, status = 200): Response {
  return new Response(corpo, { status, headers: { "content-type": "text/plain" } });
}

function hexDeBytes(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparacao em tempo constante: nao vaza onde as cadeias divergem. */
function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

// --------------------------------------------------------------------------
// O que o banco precisa saber, independente de quem mandou
// --------------------------------------------------------------------------

type Acao = "ativar" | "encerrar" | "ignorar";

interface Traduzido {
  acao: Acao;
  email: string;
  plano: string | null;
  dias: number;
  assinaturaProvedor: string | null;
  eventoId: string;
  tipo: string;
}

function diasPadrao(): number {
  const n = Number(Deno.env.get("REVALIDA_DIAS_PADRAO") ?? "365");
  return Number.isFinite(n) && n > 0 ? n : 365;
}

// --------------------------------------------------------------------------
// Hotmart
// --------------------------------------------------------------------------

// A Hotmart autentica com um token compartilhado no cabecalho, nao com HMAC.
function hotmartValido(req: Request): boolean {
  const esperado = Deno.env.get("HOTMART_HOTTOK");
  if (!esperado) return false;
  const recebido = req.headers.get("X-HOTMART-HOTTOK") ?? req.headers.get("x-hotmart-hottok");
  return !!recebido && igualSeguro(recebido, esperado);
}

const HOTMART_ATIVA = new Set([
  "PURCHASE_APPROVED",
  "PURCHASE_COMPLETE",
  "SUBSCRIPTION_REACTIVATION",
]);
const HOTMART_ENCERRA = new Set([
  "PURCHASE_REFUNDED",
  "PURCHASE_CHARGEBACK",
  "PURCHASE_PROTEST",
  "SUBSCRIPTION_CANCELLATION",
  "PURCHASE_EXPIRED",
]);

// Periodicidade do plano da Hotmart -> dias de acesso.
const PERIODO_EM_DIAS: Record<string, number> = {
  WEEKLY: 7, MONTHLY: 30, BIMONTHLY: 60, QUARTERLY: 91,
  SEMIANNUALLY: 182, SEMESTERLY: 182, YEARLY: 365, ANNUALLY: 365,
};

function traduzirHotmart(evento: Record<string, any>): Traduzido {
  const dados = evento?.data ?? {};
  const tipo = String(evento?.event ?? "");

  const email = String(
    dados?.buyer?.email ?? dados?.subscriber?.email ?? dados?.subscription?.subscriber?.email ?? "",
  ).toLowerCase().trim();

  const recorrencia = String(
    dados?.subscription?.plan?.recurrency_period ??
      dados?.purchase?.recurrence_period ??
      dados?.plan?.recurrency_period ?? "",
  ).toUpperCase();

  const acao: Acao = HOTMART_ATIVA.has(tipo)
    ? "ativar"
    : HOTMART_ENCERRA.has(tipo)
    ? "encerrar"
    : "ignorar";

  return {
    acao,
    email,
    plano: dados?.subscription?.plan?.name ?? dados?.product?.name ?? null,
    dias: PERIODO_EM_DIAS[recorrencia] ?? diasPadrao(),
    assinaturaProvedor: dados?.subscription?.subscriber_code
      ? String(dados.subscription.subscriber_code)
      : (dados?.purchase?.transaction ? String(dados.purchase.transaction) : null),
    eventoId: String(evento?.id ?? dados?.purchase?.transaction ?? ""),
    tipo,
  };
}

// --------------------------------------------------------------------------
// Stripe
// --------------------------------------------------------------------------

async function assinaturaEsperada(carga: string, timestamp: string, segredo: string) {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    chave,
    new TextEncoder().encode(`${timestamp}.${carga}`),
  );
  return hexDeBytes(new Uint8Array(mac));
}

/** Confere o cabecalho `Stripe-Signature`: `t=<unix>,v1=<hex>[,v1=<hex>...]`. */
async function stripeValido(req: Request, carga: string): Promise<boolean> {
  const segredo = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const cabecalho = req.headers.get("Stripe-Signature");
  if (!segredo || !cabecalho) return false;

  const partes = Object.create(null) as Record<string, string[]>;
  for (const item of cabecalho.split(",")) {
    const [k, v] = item.split("=", 2);
    if (k && v) (partes[k.trim()] ??= []).push(v.trim());
  }
  const timestamp = partes["t"]?.[0];
  const assinaturas = partes["v1"] ?? [];
  if (!timestamp || assinaturas.length === 0) return false;

  // Rejeita evento antigo: sem isso, uma captura de rede vira ataque de repeticao.
  const idade = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(idade) || idade > TOLERANCIA_SEGUNDOS) return false;

  const esperada = await assinaturaEsperada(carga, timestamp, segredo);
  return assinaturas.some((a) => igualSeguro(a, esperada));
}

const STRIPE_ATIVA = new Set([
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_succeeded",
]);
const STRIPE_ENCERRA = new Set([
  "charge.refunded",
  "charge.dispute.created",
  "customer.subscription.deleted",
]);

function traduzirStripe(evento: Record<string, any>): Traduzido {
  const objeto = evento?.data?.object ?? {};
  const tipo = String(evento?.type ?? "");

  const email = String(
    objeto.customer_email ?? objeto.customer_details?.email ?? objeto.receipt_email ?? "",
  ).toLowerCase().trim();

  // O plano viaja em metadata para nao depender do catalogo de precos do provedor.
  const plano = objeto.metadata?.plano ??
    evento?.data?.object?.lines?.data?.[0]?.metadata?.plano ?? null;
  const diasMeta = Number(objeto.metadata?.dias ?? NaN);

  return {
    acao: STRIPE_ATIVA.has(tipo) ? "ativar" : STRIPE_ENCERRA.has(tipo) ? "encerrar" : "ignorar",
    email,
    plano,
    dias: Number.isFinite(diasMeta) && diasMeta > 0 ? diasMeta : diasPadrao(),
    assinaturaProvedor: objeto.subscription
      ? String(objeto.subscription)
      : (objeto.id ? String(objeto.id) : null),
    eventoId: String(evento?.id ?? ""),
    tipo,
  };
}

// --------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return texto("metodo nao suportado", 405);

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return texto("servidor mal configurado", 500);

  // A carga crua tem que ser lida como texto: reserializar quebra o HMAC do Stripe.
  const carga = await req.text();
  const caminho = new URL(req.url).pathname;

  const pareceHotmart = caminho.endsWith("/hotmart") ||
    req.headers.has("X-HOTMART-HOTTOK") || req.headers.has("x-hotmart-hottok");
  const pareceStripe = caminho.endsWith("/stripe") || req.headers.has("Stripe-Signature");

  let provedor: string;
  let traduzido: Traduzido;
  let evento: Record<string, any>;

  try {
    evento = JSON.parse(carga);
  } catch {
    return texto("corpo ilegivel", 400);
  }

  if (pareceHotmart) {
    if (!hotmartValido(req)) return texto("assinatura invalida", 400);
    provedor = "hotmart";
    traduzido = traduzirHotmart(evento);
  } else if (pareceStripe) {
    if (!(await stripeValido(req, carga))) return texto("assinatura invalida", 400);
    provedor = "stripe";
    traduzido = traduzirStripe(evento);
  } else {
    return texto("provedor nao identificado", 400);
  }

  if (traduzido.acao === "ignorar") return texto(`evento ignorado: ${traduzido.tipo}`, 200);
  if (!traduzido.eventoId) return texto("evento sem identificador", 400);
  if (!traduzido.email) return texto("evento sem email do cliente", 200);

  const ativando = traduzido.acao === "ativar";
  const rpc = ativando ? "registrar_pagamento" : "encerrar_pagamento";
  const corpo = ativando
    ? {
      p_provedor: provedor,
      p_evento_id: traduzido.eventoId,
      p_tipo: traduzido.tipo,
      p_email: traduzido.email,
      p_plano_id: traduzido.plano,
      p_dias: traduzido.dias,
      p_assinatura_provedor: traduzido.assinaturaProvedor,
      p_carga: { tipo: traduzido.tipo },
    }
    : {
      p_provedor: provedor,
      p_evento_id: traduzido.eventoId,
      p_tipo: traduzido.tipo,
      p_email: traduzido.email,
      p_assinatura_provedor: traduzido.assinaturaProvedor,
      p_carga: { tipo: traduzido.tipo },
    };

  const resposta = await fetch(`${url}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${service}`,
      apikey: service,
      "content-type": "application/json",
    },
    body: JSON.stringify(corpo),
  });

  if (!resposta.ok) {
    // 500 faz o provedor reenviar; a idempotencia no banco cobre a repeticao.
    return texto(`falha ao registrar: ${await resposta.text()}`, 500);
  }
  return texto("ok", 200);
});
