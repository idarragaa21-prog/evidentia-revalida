// Evidentia · Revalida — recebedor de eventos de pagamento.
//
// Atende dois provedores pela mesma porta:
//   POST .../webhook-pagamento/dlocalgo  (provedor de lançamento — passes de
//                                         30/90/180 dias, PIX ou cartão em reais)
//   POST .../webhook-pagamento/stripe    (quando houver entidade no exterior)
//
// dLocal Go: a notificação traz SÓ {"payment_id": "..."} e vem assinada com
// HMAC-SHA256 no cabeçalho `Authorization: V2-HMAC-SHA256, Signature: <hex>`,
// onde a mensagem é API_KEY + corpo cru. O estado NUNCA sai da notificação:
// buscamos o pagamento na API do dLocal Go e agimos pelo que ELA responde.
// A mesma notificação também dispara quando um reembolso muda de estado; por
// isso, além do pagamento, conferimos os reembolsos e encerramos o acesso se
// algum estiver SUCCESS.
//
// Um evento sem assinatura válida é recusado antes de tocar o banco; um evento
// repetido não aplica nada duas vezes, garantido pela restrição única de
// public.eventos_pagamento.
//
// Secrets: DLOCALGO_API_KEY, DLOCALGO_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REVALIDA_DIAS_PADRAO.
//          DLOCALGO_API_HOST (opcional; padrão https://api.dlocalgo.com —
//          use https://api-sbx.dlocalgo.com no sandbox).

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

async function hmacHex(segredo: string, mensagem: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(mensagem));
  return hexDeBytes(new Uint8Array(mac));
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
  clienteProvedor: string | null;
  eventoId: string;
  tipo: string;
}

function diasPadrao(): number {
  const n = Number(Deno.env.get("REVALIDA_DIAS_PADRAO") ?? "365");
  return Number.isFinite(n) && n > 0 ? n : 365;
}

// --------------------------------------------------------------------------
// Chamadas ao banco (service role)
// --------------------------------------------------------------------------

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

// --------------------------------------------------------------------------
// dLocal Go
// --------------------------------------------------------------------------

function dlocalHost(): string {
  return (Deno.env.get("DLOCALGO_API_HOST") ?? "https://api.dlocalgo.com").replace(/\/+$/, "");
}

/** Confere `Authorization: V2-HMAC-SHA256, Signature: <hex>` sobre API_KEY + corpo. */
async function dlocalgoValido(req: Request, carga: string): Promise<boolean> {
  const apiKey = Deno.env.get("DLOCALGO_API_KEY");
  const segredo = Deno.env.get("DLOCALGO_SECRET_KEY");
  const cabecalho = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  if (!apiKey || !segredo || !cabecalho) return false;

  const m = cabecalho.match(/V2-HMAC-SHA256,\s*Signature:\s*([0-9a-fA-F]+)/);
  if (!m) return false;
  const esperada = await hmacHex(segredo, apiKey + carga);
  return igualSeguro(m[1].toLowerCase(), esperada.toLowerCase());
}

async function dlocalgoApi(caminho: string): Promise<Record<string, any> | null> {
  const apiKey = Deno.env.get("DLOCALGO_API_KEY");
  const segredo = Deno.env.get("DLOCALGO_SECRET_KEY");
  const r = await fetch(`${dlocalHost()}${caminho}`, {
    headers: { Authorization: `Bearer ${apiKey}:${segredo}` },
  });
  if (!r.ok) return null;
  try {
    return await r.json();
  } catch {
    return null;
  }
}

/** Reembolsos deste pagamento. O dLocal Go não expõe «reembolsos de um pagamento»:
 * só a lista global, paginada e filtrável por estado. Filtrar por SUCCESS reduz o
 * universo ao que de fato revoga acesso, e a varredura vai até o fim das páginas
 * (com um teto de sanidade) — parar cedo, como se fazia antes, significava que a
 * partir de certo volume um estorno deixava de cortar o acesso em silêncio. */
async function reembolsosDoPagamento(paymentId: string): Promise<Record<string, any>[]> {
  const achados: Record<string, any>[] = [];
  const TETO_PAGINAS = 200;
  for (let pagina = 0; pagina < TETO_PAGINAS; pagina++) {
    const r = await dlocalgoApi(`/v1/refunds?status=SUCCESS&page=${pagina}`);
    if (!r) break;
    const dados = Array.isArray(r?.data) ? r.data : [];
    for (const reembolso of dados) {
      if (String(reembolso?.payment_id ?? "") === paymentId) achados.push(reembolso);
    }
    const totalPaginas = Number(r?.totalPages ?? 1);
    if (!Number.isFinite(totalPaginas) || pagina + 1 >= totalPaginas) break;
  }
  return achados;
}

/** O plano tem que existir no catálogo: `assinaturas.plano_id` é chave estrangeira.
 * Perguntamos à tabela em vez de manter uma lista no código — senão um plano novo
 * criado pelo painel entraria como nulo e a venda ficaria sem atribuição. */
async function planoDoCatalogo(bruto: unknown): Promise<string | null> {
  const id = String(bruto ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,40}$/.test(id)) return null;
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(
    `${url}/rest/v1/planos?id=eq.${encodeURIComponent(id)}&select=id`,
    { headers: { Authorization: `Bearer ${service}`, apikey: service ?? "" } },
  );
  if (!r.ok) return null;
  const linhas = await r.json();
  return linhas?.[0]?.id ? String(linhas[0].id) : null;
}

/** Trata a notificação do dLocal Go de ponta a ponta. Devolve a resposta HTTP. */
async function tratarDlocalgo(evento: Record<string, any>): Promise<Response> {
  const paymentId = String(evento?.payment_id ?? "").trim();
  if (!paymentId) return texto("notificacao sem payment_id", 400);

  // O estado vem da API, nunca da notificação.
  const pagamento = await dlocalgoApi(`/v1/payments/${encodeURIComponent(paymentId)}`);
  if (!pagamento) {
    // 500 faz o provedor reenviar em 10 minutos; melhor que perder o evento.
    return texto("nao foi possivel consultar o pagamento no provedor", 500);
  }

  const status = String(pagamento.status ?? "").toUpperCase();
  const orderId = String(pagamento.order_id ?? "").trim();

  // O que NÓS registramos na criação do pedido: email, plano e preço combinados.
  let checkout: Record<string, any> | null = null;
  if (orderId) {
    const r = await rpcServico("consultar_checkout", { p_order_id: orderId });
    if (r.ok) {
      try {
        checkout = await r.json();
      } catch {
        checkout = null;
      }
    }
  }

  if (status === "PAID") {
    // Só se ativa o que NÓS criamos. Sem a linha de `checkouts` não há preço, plano
    // nem prazo combinados para conferir — e ativar «no benefício da dúvida» daria a
    // qualquer cobrança avulsa criada no painel do provedor um acesso que ninguém
    // dimensionou. Fica anotado e sem efeito, em vez de virar acesso de graça.
    if (!orderId || !checkout) {
      if (orderId) {
        await rpcServico("anotar_checkout", {
          p_order_id: orderId,
          p_payment_id: paymentId,
          p_status: "sem_checkout",
        });
      }
      return texto("pagamento sem pedido correspondente; nao ativado", 200);
    }

    const email = String(checkout.email ?? "").toLowerCase().trim();
    const diasFinal = Number(checkout.dias);
    if (!email || !Number.isFinite(diasFinal) || diasFinal <= 0) {
      return texto("pedido incompleto; nao ativado", 200);
    }

    // Conferência de valor e de moeda, sem exceções: o preço foi fixado pelo servidor
    // na criação do pedido, então qualquer divergência aqui significa manipulação ou
    // erro grave — não ativa e fica registrada.
    const pagoCentavos = Math.round(Number(pagamento.amount ?? 0) * 100);
    const devido = Number(checkout.preco_centavos ?? 0);
    const moedaPaga = String(pagamento.currency ?? "").toUpperCase();
    const moedaDevida = String(checkout.moeda ?? "BRL").toUpperCase();
    if (pagoCentavos + 1 < devido || moedaPaga !== moedaDevida) {
      await rpcServico("anotar_checkout", {
        p_order_id: orderId,
        p_payment_id: paymentId,
        p_status: "valor_divergente",
      });
      return texto("valor ou moeda divergentes do pedido; nao ativado", 200);
    }

    const r = await rpcServico("registrar_pagamento", {
      p_provedor: "dlocalgo",
      p_evento_id: paymentId,
      p_tipo: "PAYMENT_PAID",
      p_email: email,
      p_plano_id: await planoDoCatalogo(checkout.plano_id),
      p_dias: diasFinal,
      p_assinatura_provedor: paymentId,
      p_cliente_provedor: orderId || null,
      p_carga: { tipo: "PAYMENT_PAID", metodo: pagamento.payment_method_type ?? null },
    });
    if (!r.ok) return texto(`falha ao registrar: ${await r.text()}`, 500);

    if (orderId) {
      await rpcServico("anotar_checkout", {
        p_order_id: orderId,
        p_payment_id: paymentId,
        p_status: "pago",
      });
    }
  } else if (["REJECTED", "CANCELLED", "EXPIRED"].includes(status)) {
    // Nada a ativar; só o registro do funil para o painel.
    if (orderId) {
      await rpcServico("anotar_checkout", {
        p_order_id: orderId,
        p_payment_id: paymentId,
        p_status: status.toLowerCase(),
      });
    }
  }

  // A mesma notificação cobre mudanças de reembolso: se algum reembolso deste
  // pagamento está SUCCESS, o acesso pago cai (a cortesia do dono sobrevive,
  // por desenho de encerrar_pagamento).
  const reembolsos = await reembolsosDoPagamento(paymentId);
  for (const reembolso of reembolsos) {
    if (String(reembolso?.status ?? "").toUpperCase() !== "SUCCESS") continue;
    const r = await rpcServico("encerrar_pagamento", {
      p_provedor: "dlocalgo",
      p_evento_id: String(reembolso.id ?? `${paymentId}-reembolso`),
      p_tipo: "REFUND_SUCCESS",
      // O identificador do pagamento é o que amarra o estorno à compra certa; o
      // e-mail é só um apoio. Sem isso, um estorno cancelaria a compra errada de
      // quem tem vários passes empilhados.
      p_email: String(checkout?.email ?? "").toLowerCase().trim(),
      p_assinatura_provedor: paymentId,
      p_cliente_provedor: orderId || null,
      p_carga: { tipo: "REFUND_SUCCESS", reembolso: String(reembolso.id ?? "") },
    });
    if (!r.ok) return texto(`falha ao encerrar: ${await r.text()}`, 500);
    if (orderId) {
      await rpcServico("anotar_checkout", {
        p_order_id: orderId,
        p_payment_id: paymentId,
        p_status: "reembolsado",
      });
    }
  }

  return texto("ok", 200);
}

// --------------------------------------------------------------------------
// Stripe
// --------------------------------------------------------------------------

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

  const esperada = await hmacHex(segredo, `${timestamp}.${carga}`);
  return assinaturas.some((a) => igualSeguro(a, esperada));
}

// Um unico pagamento no Stripe dispara varios eventos (checkout.session.completed,
// invoice.paid, invoice.payment_succeeded). Se todos ativassem, a mesma compra
// somaria prazo tres vezes. Por isso `invoice.paid` e a unica porta de ativacao
// recorrente: ela cobre a primeira cobranca e todas as renovacoes. O checkout entra
// so quando e compra avulsa (mode = "payment"), que nao gera fatura.
const STRIPE_ENCERRA = new Set([
  "charge.refunded",
  "charge.dispute.created",
  "customer.subscription.deleted",
]);

function acaoStripe(tipo: string, objeto: Record<string, any>): Acao {
  if (tipo === "invoice.paid") return "ativar";
  if (tipo === "checkout.session.completed") {
    return objeto.mode === "payment" ? "ativar" : "ignorar";
  }
  return STRIPE_ENCERRA.has(tipo) ? "encerrar" : "ignorar";
}

/** Dias cobertos pela fatura, lidos do periodo que o proprio Stripe cobrou. */
function diasDaFatura(objeto: Record<string, any>): number | null {
  const linha = objeto?.lines?.data?.[0];
  const inicio = Number(linha?.period?.start ?? NaN);
  const fim = Number(linha?.period?.end ?? NaN);
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) return null;
  const dias = Math.round((fim - inicio) / 86400);
  return dias > 0 && dias <= 3650 ? dias : null;
}

function traduzirStripe(evento: Record<string, any>): Traduzido {
  const objeto = evento?.data?.object ?? {};
  const tipo = String(evento?.type ?? "");
  const linha = objeto?.lines?.data?.[0];

  const email = String(
    objeto.customer_email ?? objeto.customer_details?.email ??
      objeto.receipt_email ?? objeto.billing_details?.email ?? "",
  ).toLowerCase().trim();

  // O plano viaja em metadata para nao depender do catalogo de precos do provedor.
  const plano = objeto.metadata?.plano ?? linha?.metadata?.plano ?? null;

  // A fatura de renovacao e gerada pelo proprio Stripe e nao carrega o metadata da
  // compra original: sem ler o periodo cobrado, toda renovacao mensal viraria um ano.
  const diasMeta = Number(objeto.metadata?.dias ?? linha?.metadata?.dias ?? NaN);
  const dias = Number.isFinite(diasMeta) && diasMeta > 0
    ? diasMeta
    : (diasDaFatura(objeto) ?? diasPadrao());

  // O estorno chega como cobranca (ch_...), que nunca casa com o sub_/cs_ guardado na
  // ativacao. O cliente (cus_...) aparece nos dois lados e e o elo que permite achar a
  // assinatura a cancelar; por isso ele viaja sempre, separado do id da assinatura.
  return {
    acao: acaoStripe(tipo, objeto),
    email,
    // Validado contra o catalogo em tratarStripe: `planos.id` e chave estrangeira,
    // e um id inexistente derrubaria a ativacao inteira por erro de integridade.
    plano,
    dias,
    assinaturaProvedor: objeto.subscription ? String(objeto.subscription) : null,
    clienteProvedor: objeto.customer ? String(objeto.customer) : null,
    eventoId: String(evento?.id ?? ""),
    tipo,
  };
}

async function tratarStripe(traduzido: Traduzido): Promise<Response> {
  if (traduzido.acao === "ignorar") return texto(`evento ignorado: ${traduzido.tipo}`, 200);
  if (!traduzido.eventoId) return texto("evento sem identificador", 400);

  // Ativar exige saber de quem e a compra. Encerrar, nao: o evento de estorno do
  // Stripe nao carrega e-mail, e o banco resolve o dono pelo id da assinatura ou
  // do cliente. Descartar aqui deixava todo reembolso sem efeito.
  if (traduzido.acao === "ativar" && !traduzido.email) {
    return texto("ativacao sem email do cliente", 200);
  }
  if (traduzido.acao === "encerrar" && !traduzido.email &&
      !traduzido.assinaturaProvedor && !traduzido.clienteProvedor) {
    return texto("encerramento sem nenhuma forma de identificar a assinatura", 200);
  }

  const ativando = traduzido.acao === "ativar";
  const rpc = ativando ? "registrar_pagamento" : "encerrar_pagamento";
  const corpo = ativando
    ? {
      p_provedor: "stripe",
      p_evento_id: traduzido.eventoId,
      p_tipo: traduzido.tipo,
      p_email: traduzido.email,
      p_plano_id: await planoDoCatalogo(traduzido.plano),
      p_dias: traduzido.dias,
      p_assinatura_provedor: traduzido.assinaturaProvedor,
      p_cliente_provedor: traduzido.clienteProvedor,
      p_carga: { tipo: traduzido.tipo },
    }
    : {
      p_provedor: "stripe",
      p_evento_id: traduzido.eventoId,
      p_tipo: traduzido.tipo,
      p_email: traduzido.email,
      p_assinatura_provedor: traduzido.assinaturaProvedor,
      p_cliente_provedor: traduzido.clienteProvedor,
      p_carga: { tipo: traduzido.tipo },
    };

  const resposta = await rpcServico(rpc, corpo);
  if (!resposta.ok) {
    // 500 faz o provedor reenviar; a idempotencia no banco cobre a repeticao.
    return texto(`falha ao registrar: ${await resposta.text()}`, 500);
  }
  return texto("ok", 200);
}

// --------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return texto("metodo nao suportado", 405);

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return texto("servidor mal configurado", 500);

  // Tope de tamanho antes de ler ou interpretar nada: a notificação do dLocal Go é
  // `{"payment_id":"..."}` e a do Stripe cabe de sobra em 64 KB. Sem isto, qualquer
  // um manda megabytes por uma porta que ainda não verificou assinatura nenhuma.
  const LIMITE_CARGA = 64 * 1024;
  const declarado = Number(req.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declarado) && declarado > LIMITE_CARGA) {
    return texto("corpo grande demais", 413);
  }

  // A carga crua tem que ser lida como texto: reserializar quebra o HMAC.
  const carga = await req.text();
  if (carga.length > LIMITE_CARGA) return texto("corpo grande demais", 413);
  const caminho = new URL(req.url).pathname;

  const pareceDlocalgo = caminho.endsWith("/dlocalgo") ||
    /V2-HMAC-SHA256/.test(req.headers.get("Authorization") ?? "");
  const pareceStripe = caminho.endsWith("/stripe") || req.headers.has("Stripe-Signature");

  let evento: Record<string, any>;
  try {
    evento = JSON.parse(carga);
  } catch {
    return texto("corpo ilegivel", 400);
  }

  if (pareceDlocalgo) {
    if (!(await dlocalgoValido(req, carga))) return texto("assinatura invalida", 400);
    return await tratarDlocalgo(evento);
  }
  if (pareceStripe) {
    if (!(await stripeValido(req, carga))) return texto("assinatura invalida", 400);
    return await tratarStripe(traduzirStripe(evento));
  }
  return texto("provedor nao identificado", 400);
});
