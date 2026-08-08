// Exclusao da propria conta em uma unica transacao SQL: remove auth.users e os
// dados operacionais, anonimiza a retencao fiscal e devolve um recibo anonimo.

import {
  ErroHttp,
  origemAceita,
  respostaJson,
  respostaPreflight,
} from "../_shared/http_security.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return respostaPreflight(req);
  if (!origemAceita(req)) return respostaJson(req, { erro: "origem nao permitida" }, 403);
  if (req.method !== "POST") return respostaJson(req, { erro: "metodo nao suportado" }, 405);

  try {
    // Corpo vazio em JSON e o unico formato aceito; identificador de usuario
    // nunca vem do cliente.
    const texto = await req.text();
    if (new TextEncoder().encode(texto).byteLength > 512) throw new ErroHttp(413, "corpo_grande_demais");
    if (texto.trim() && texto.trim() !== "{}") throw new ErroHttp(400, "corpo_deve_ser_vazio");

    const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !anon || !service) throw new ErroHttp(500, "servidor_mal_configurado");

    const autorizacao = req.headers.get("authorization") ?? "";
    if (!autorizacao.toLowerCase().startsWith("bearer ")) throw new ErroHttp(401, "sessao_ausente");

    const quem = await fetch(`${url}/auth/v1/user`, {
      headers: { authorization: autorizacao, apikey: anon },
      signal: AbortSignal.timeout(8_000),
    });
    if (!quem.ok) throw new ErroHttp(401, "sessao_invalida_ou_expirada");
    const usuario = await quem.json().catch(() => null);
    if (!usuario?.id) throw new ErroHttp(401, "sessao_invalida");

    // Esta RPC tambem deleta auth.users. Se qualquer etapa falhar, PostgreSQL
    // desfaz anonimização, recibo e delete juntos.
    const exclusao = await fetch(`${url}/rest/v1/rpc/excluir_conta_com_privacidade`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${service}`,
        apikey: service,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_user_id: usuario.id }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!exclusao.ok) throw new ErroHttp(502, "nao_foi_possivel_excluir_agora");
    const pedidoId = await exclusao.json().catch(() => null);
    return respostaJson(req, { ok: true, pedido_id: pedidoId });
  } catch (erro) {
    if (erro instanceof ErroHttp) return respostaJson(req, { erro: erro.codigo }, erro.status);
    return respostaJson(req, { erro: "erro_interno" }, 500);
  }
});
