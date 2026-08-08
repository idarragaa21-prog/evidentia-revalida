import { ErroHttp } from "./http_security.ts";

export type ConfiguracaoSupabaseWebhook = { url: string; service: string };

export function configuracaoSupabaseWebhook(): ConfiguracaoSupabaseWebhook {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !service) throw new ErroHttp(503, "backend_mal_configurado");
  return { url, service };
}

export async function rpcWebhook<T>(
  cfg: ConfiguracaoSupabaseWebhook,
  nome: string,
  corpo: Record<string, unknown>,
): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${cfg.url}/rest/v1/rpc/${nome}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.service}`,
        apikey: cfg.service,
        "content-type": "application/json",
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ErroHttp(503, "backend_temporariamente_indisponivel");
  }
  const texto = await resposta.text();
  let valor: unknown = null;
  try { valor = texto ? JSON.parse(texto) : null; } catch { /* resposta opaca */ }
  if (!resposta.ok) {
    const codigoSql = String((valor as Record<string, unknown> | null)?.code ?? "");
    if (["22023", "42501"].includes(codigoSql)) {
      throw new ErroHttp(422, "vinculo_backend_divergente");
    }
    throw new ErroHttp(503, "backend_temporariamente_indisponivel");
  }
  return valor as T;
}

export type ReservaNotificacao = {
  processar?: boolean;
  repetida?: boolean;
  ocupada?: boolean;
  tentativas?: number;
};

export function reservarNotificacao(
  cfg: ConfiguracaoSupabaseWebhook,
  plataforma: "apple" | "google",
  eventoId: string,
  payloadHash: string,
  tipo: string,
): Promise<ReservaNotificacao> {
  return rpcWebhook(cfg, "reservar_notificacao_loja", {
    p_plataforma: plataforma,
    p_evento_id: eventoId,
    p_payload_hash: payloadHash,
    p_tipo: tipo,
  });
}

export function finalizarNotificacao(
  cfg: ConfiguracaoSupabaseWebhook,
  parametros: {
    plataforma: "apple" | "google";
    eventoId: string;
    status: "processada" | "ignorada" | "erro_temporario" | "erro_permanente";
    erroCodigo?: string | null;
    transacaoId?: string | null;
    produtoId?: string | null;
    compraId?: string | null;
    detalhes?: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  return rpcWebhook(cfg, "finalizar_notificacao_loja", {
    p_plataforma: parametros.plataforma,
    p_evento_id: parametros.eventoId,
    p_status: parametros.status,
    p_erro_codigo: parametros.erroCodigo ?? null,
    p_transacao_externa_id: parametros.transacaoId ?? null,
    p_produto_id: parametros.produtoId ?? null,
    p_compra_id: parametros.compraId ?? null,
    p_detalhes: parametros.detalhes ?? {},
  });
}

export function encerrarCompraNativa(
  cfg: ConfiguracaoSupabaseWebhook,
  parametros: {
    plataforma: "apple" | "google";
    transacaoId: string;
    status: "reembolsada" | "revogada";
    motivo: string;
    produtoId: string;
    contaHash: string;
  },
): Promise<{ ok?: boolean; repetido?: boolean; compra_id?: string; motivo?: string }> {
  return rpcWebhook(cfg, "encerrar_compra_nativa", {
    p_plataforma: parametros.plataforma,
    p_transacao_externa_id: parametros.transacaoId,
    p_status: parametros.status,
    p_motivo: parametros.motivo,
    p_produto_id: parametros.produtoId,
    p_conta_hash: parametros.contaHash,
  });
}

const CABECALHOS_WEBHOOK: HeadersInit = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function respostaWebhook(status = 204, codigo?: string): Response {
  if (status === 204) return new Response(null, { status, headers: CABECALHOS_WEBHOOK });
  return new Response(JSON.stringify({ erro: codigo ?? "falha" }), {
    status,
    headers: { ...CABECALHOS_WEBHOOK, "content-type": "application/json; charset=utf-8" },
  });
}
