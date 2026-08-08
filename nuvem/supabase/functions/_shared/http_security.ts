const ORIGENS_PADRAO = [
  "https://idarragaa21-prog.github.io",
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
];

export function origensPermitidas(extra = Deno.env.get("REVALIDA_ALLOWED_ORIGINS") ?? ""): Set<string> {
  return new Set([
    ...ORIGENS_PADRAO,
    ...extra.split(",").map((v) => v.trim()).filter(Boolean),
  ]);
}

export function origemAceita(req: Request, permitidas = origensPermitidas()): boolean {
  const origem = req.headers.get("origin");
  // Clientes nativos e chamadas servidor-servidor normalmente nao enviam Origin.
  return !origem || permitidas.has(origem);
}

export function cabecalhosCors(req: Request, permitidas = origensPermitidas()): HeadersInit {
  const origem = req.headers.get("origin");
  const cabecalhos: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
  if (origem && permitidas.has(origem)) cabecalhos["Access-Control-Allow-Origin"] = origem;
  return cabecalhos;
}

export function respostaJson(req: Request, corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors(req), "content-type": "application/json; charset=utf-8" },
  });
}

export function respostaPreflight(req: Request): Response {
  if (!origemAceita(req)) return respostaJson(req, { erro: "origem nao permitida" }, 403);
  return new Response(null, { status: 204, headers: cabecalhosCors(req) });
}

export async function lerJsonLimitado(
  req: Request,
  limiteBytes = 16_384,
): Promise<Record<string, unknown>> {
  const tipo = (req.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (tipo !== "application/json") throw new ErroHttp(415, "content_type_invalido");
  const declarado = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declarado) && declarado > limiteBytes) throw new ErroHttp(413, "corpo_grande_demais");
  const texto = await req.text();
  if (new TextEncoder().encode(texto).byteLength > limiteBytes) throw new ErroHttp(413, "corpo_grande_demais");
  try {
    const valor = JSON.parse(texto);
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new Error();
    return valor as Record<string, unknown>;
  } catch {
    throw new ErroHttp(400, "corpo_ilegivel");
  }
}

export class ErroHttp extends Error {
  constructor(public status: number, public codigo: string) {
    super(codigo);
  }
}

export async function sha256Hex(valor: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function urlHttpsPermitida(valor: string, dominios: string[]): URL | null {
  try {
    const url = new URL(valor);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (!dominios.some((d) => host === d || host.endsWith(`.${d}`))) return null;
    return url;
  } catch {
    return null;
  }
}

export async function validarTurnstile(token: string): Promise<boolean> {
  const segredo = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!segredo) return true; // so passa a ser obrigatorio depois de configurar o secret e o cliente
  if (!token) return false;
  const resposta = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: segredo, response: token }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!resposta.ok) return false;
  const resultado = await resposta.json().catch(() => null);
  return resultado?.success === true;
}

