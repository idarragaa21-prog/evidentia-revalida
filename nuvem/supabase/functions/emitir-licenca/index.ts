// Evidentia · Revalida — emissao da licenca assinada de um aparelho.
//
// Fluxo: o aplicativo manda o JWT da sessao do Supabase; conferimos quem e a
// pessoa, perguntamos ao banco se ela tem acesso e, se tiver, devolvemos uma
// licenca curta assinada com ECDSA P-256. O aplicativo guarda essa licenca e a
// verifica sozinho, sem rede, ate a data de validade — por isso ele continua
// funcionando no aviao, no plantao e no interior sem sinal.
//
// Secrets: REVALIDA_CHAVE_PRIVADA (PKCS8 em base64), SUPABASE_URL,
//          SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
//          REVALIDA_DIAS_LICENCA (opcional, padrao 30).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
  });
}

function base64urlDeBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesDeBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

let chaveCache: CryptoKey | null = null;
async function chavePrivada(): Promise<CryptoKey> {
  if (chaveCache) return chaveCache;
  const b64 = Deno.env.get("REVALIDA_CHAVE_PRIVADA");
  if (!b64) throw new Error("REVALIDA_CHAVE_PRIVADA ausente");
  chaveCache = await crypto.subtle.importKey(
    "pkcs8",
    bytesDeBase64(b64.trim()),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return chaveCache;
}

// Licenca = base64url(payload JSON) + "." + base64url(assinatura crua de 64 bytes).
async function assinarLicenca(payload: Record<string, unknown>): Promise<string> {
  const corpo = new TextEncoder().encode(JSON.stringify(payload));
  const assinatura = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await chavePrivada(),
    corpo,
  );
  return `${base64urlDeBytes(corpo)}.${base64urlDeBytes(new Uint8Array(assinatura))}`;
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

  let aparelho = "";
  try {
    const corpo = await req.json();
    aparelho = String(corpo?.aparelho ?? "").slice(0, 200);
  } catch {
    // corpo vazio e aceitavel; o aparelho e so para o historico
  }

  // 1. Quem e a pessoa. Perguntamos ao proprio Supabase, nunca confiamos no corpo.
  const quem = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: autorizacao, apikey: anon },
  });
  if (!quem.ok) return json({ erro: "sessao invalida ou expirada" }, 401);
  const usuario = await quem.json();
  if (!usuario?.id) return json({ erro: "sessao invalida" }, 401);

  // 2. Tem acesso? Quem responde e o banco, com o token da propria pessoa:
  //    a RLS decide, esta funcao nao tem opiniao sobre isso.
  const consulta = await fetch(`${url}/rest/v1/rpc/meu_acesso`, {
    method: "POST",
    headers: {
      Authorization: autorizacao,
      apikey: anon,
      "content-type": "application/json",
    },
    body: "{}",
  });
  if (!consulta.ok) {
    return json({ erro: "nao foi possivel conferir o acesso" }, 502);
  }
  const acesso = await consulta.json();
  if (!acesso?.ativo) {
    return json({ ativo: false, motivo: "sem_assinatura" }, 200);
  }

  // 3. A licenca nunca dura mais que a assinatura.
  const dias = Number(Deno.env.get("REVALIDA_DIAS_LICENCA") ?? "30");
  const fimAssinatura = new Date(acesso.fim).getTime();
  const fimJanela = Date.now() + dias * 86400_000;
  const expiraEm = new Date(Math.min(fimAssinatura, fimJanela));
  if (!(expiraEm.getTime() > Date.now())) {
    return json({ ativo: false, motivo: "assinatura_vencida" }, 200);
  }

  // 4. Antes de registrar, garante que dá para assinar. A ordem importa: registrar
  //    primeiro e descobrir depois que a chave não está configurada encheria de linhas
  //    mortas justamente a tabela que serve para revogar e auditar.
  try {
    await chavePrivada();
  } catch {
    return json({ erro: "servidor sem chave de assinatura configurada" }, 500);
  }

  // 5. Registra a entrega para poder revogar e auditar depois.
  const registro = await fetch(`${url}/rest/v1/rpc/registrar_licenca`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${service}`,
      apikey: service,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_user_id: usuario.id,
      p_expira_em: expiraEm.toISOString(),
      p_aparelho: aparelho,
    }),
  });
  if (!registro.ok) return json({ erro: "nao foi possivel registrar a licenca" }, 502);
  const jti = await registro.json();

  const licenca = await assinarLicenca({
    v: 1,
    sub: usuario.id,
    email: usuario.email ?? "",
    plano: acesso.plano ?? null,
    origem: acesso.origem ?? null,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(expiraEm.getTime() / 1000),
    jti,
  });

  return json({
    ativo: true,
    licenca,
    expira_em: expiraEm.toISOString(),
    fim_assinatura: acesso.fim,
    origem: acesso.origem,
  });
});
