// Lista de espera com dupla confirmacao. POST cria um token de uso unico e envia
// o link; GET confirma. O painel so lista enderecos confirmados.

import {
  ErroHttp,
  lerJsonLimitado,
  origemAceita,
  respostaJson,
  respostaPreflight,
  urlHttpsPermitida,
  validarTurnstile,
} from "../_shared/http_security.ts";

function cfg(): { url: string; service: string; resend: string; from: string; retorno: string } {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resend = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("REVALIDA_EMAIL_FROM") ?? "";
  const retornoCru = Deno.env.get("REVALIDA_URL_ASSINAR") ??
    "https://idarragaa21-prog.github.io/evidentia-revalida/assinar/";
  const retorno = urlHttpsPermitida(retornoCru, ["github.io", "evidentia.app", "evidentia.com.br"]);
  if (!url || !service || !retorno) throw new ErroHttp(500, "servidor_mal_configurado");
  return { url, service, resend, from, retorno: retorno.toString() };
}

async function rpc<T>(config: ReturnType<typeof cfg>, nome: string, corpo: Record<string, unknown>): Promise<T> {
  const resposta = await fetch(`${config.url}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.service}`,
      apikey: config.service,
      "content-type": "application/json",
    },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(10_000),
  });
  const valor = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new ErroHttp(502, `rpc_${nome}_falhou`);
  return valor as T;
}

function redireciona(config: ReturnType<typeof cfg>, estado: string): Response {
  const url = new URL(config.retorno);
  url.searchParams.set("interesse", estado);
  return new Response(null, {
    status: 303,
    headers: {
      location: url.toString(),
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

Deno.serve(async (req: Request) => {
  try {
    const config = cfg();
    if (req.method === "OPTIONS") return respostaPreflight(req);

    if (req.method === "GET") {
      const token = new URL(req.url).searchParams.get("token") ?? "";
      const resultado = await rpc<{ ok?: boolean }>(config, "confirmar_interesse", { p_token: token });
      return redireciona(config, resultado?.ok ? "confirmado" : "link_invalido");
    }

    if (!origemAceita(req)) return respostaJson(req, { erro: "origem_nao_permitida" }, 403);
    if (req.method !== "POST") return respostaJson(req, { erro: "metodo_nao_suportado" }, 405);
    if (!config.resend || !config.from) {
      return respostaJson(req, { erro: "lista_espera_indisponivel" }, 503);
    }

    const corpo = await lerJsonLimitado(req, 2_048);
    if (Object.keys(corpo).some((k) => !["email", "plano_id", "origem", "turnstile_token"].includes(k))) {
      throw new ErroHttp(400, "campos_desconhecidos");
    }
    const email = String(corpo.email ?? "").toLowerCase().trim();
    const plano = String(corpo.plano_id ?? "").toLowerCase().trim() || null;
    const origem = String(corpo.origem ?? "pagina_de_vendas").trim().slice(0, 60);
    if (!/^[^\s@]{1,120}@[^\s@]{1,120}\.[^\s@]{2,24}$/.test(email)) {
      throw new ErroHttp(400, "email_invalido");
    }
    if (!await validarTurnstile(String(corpo.turnstile_token ?? ""))) {
      throw new ErroHttp(403, "verificacao_antiabuso_falhou");
    }

    const pendente = await rpc<{ token_confirmacao?: string }>(config, "criar_interesse_pendente", {
      p_email: email, p_plano_id: plano, p_origem: origem,
    });
    const token = String(pendente.token_confirmacao ?? "");
    if (!token) throw new ErroHttp(502, "nao_foi_possivel_criar_confirmacao");
    const confirmar = `${config.url}/functions/v1/registrar-interesse?token=${encodeURIComponent(token)}`;

    const envio = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.resend}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [email],
        subject: "Confirme seu interesse no Evidentia · Revalida",
        text: `Voce pediu para ser avisado quando o plano estiver disponivel.\n\nConfirme em ate 24 horas:\n${confirmar}\n\nSe nao foi voce, ignore esta mensagem; o endereco nao entrara na lista.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!envio.ok) throw new ErroHttp(502, "email_de_confirmacao_indisponivel");

    // Resposta generica evita enumerar se o endereco ja estava na lista.
    return respostaJson(req, { ok: true, confirmacao_necessaria: true }, 202);
  } catch (erro) {
    if (erro instanceof ErroHttp) return respostaJson(req, { erro: erro.codigo }, erro.status);
    return respostaJson(req, { erro: "erro_interno" }, 500);
  }
});
