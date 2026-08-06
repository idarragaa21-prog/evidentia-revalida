// Evidentia · Revalida — a pessoa apaga a propria conta, de dentro do aplicativo.
//
// Existe porque a diretriz 5.1.1(v) da App Store exige que todo aplicativo que
// permite criar conta permita tambem apaga-la, sem sair do aplicativo e sem
// escrever para o suporte. E rejeicao automatica na revisao.
//
// Quem manda apagar e sempre o dono da conta: a funcao le o JWT da sessao e
// pergunta ao proprio Supabase de quem e. O identificador NUNCA vem do corpo do
// pedido — se viesse, qualquer pessoa autenticada apagaria a conta de outra.
//
// O que se apaga: a conta em auth.users. O `on delete cascade` das tabelas leva
// junto perfil, assinaturas e licencas. Os eventos de pagamento ficam, sem
// vinculo com pessoa: sao registro contabil e fiscal, nao dado de perfil.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "metodo nao suportado" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ erro: "servidor mal configurado" }, 500);

  const autorizacao = req.headers.get("Authorization") ?? "";
  if (!autorizacao.toLowerCase().startsWith("bearer ")) {
    return json({ erro: "sessao ausente" }, 401);
  }

  // De quem e esta sessao? Quem responde e o Supabase, com o token da propria
  // pessoa. O corpo do pedido nao participa desta decisao.
  const quem = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: autorizacao, apikey: anon },
  });
  if (!quem.ok) return json({ erro: "sessao invalida ou expirada" }, 401);
  const usuario = await quem.json();
  if (!usuario?.id) return json({ erro: "sessao invalida" }, 401);

  // Fica registrado antes de apagar: depois do delete nao ha a quem atribuir.
  await fetch(`${url}/rest/v1/rpc/registrar_exclusao`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${service}`,
      apikey: service,
      "content-type": "application/json",
    },
    body: JSON.stringify({ p_user_id: usuario.id, p_email: usuario.email ?? "" }),
  }).catch(() => {});   // a auditoria nao pode impedir a pessoa de sair

  const apagou = await fetch(`${url}/auth/v1/admin/users/${usuario.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${service}`, apikey: service },
  });
  if (!apagou.ok) {
    return json({ erro: "nao foi possivel excluir a conta agora" }, 502);
  }

  return json({ ok: true });
});
