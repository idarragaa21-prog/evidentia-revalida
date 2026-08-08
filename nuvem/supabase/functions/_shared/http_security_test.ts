import {
  ErroHttp,
  lerJsonLimitado,
  origemAceita,
  origensPermitidas,
  sha256Hex,
  urlHttpsPermitida,
} from "./http_security.ts";

function igual<T>(atual: T, esperado: T, nome: string): void {
  if (atual !== esperado) throw new Error(`${nome}: esperado ${String(esperado)}, veio ${String(atual)}`);
}

Deno.test("CORS aceita apenas origens conhecidas e clientes sem Origin", () => {
  const permitidas = origensPermitidas("");
  igual(origemAceita(new Request("https://edge.test"), permitidas), true, "sem Origin");
  igual(origemAceita(new Request("https://edge.test", { headers: { origin: "capacitor://localhost" } }), permitidas), true, "Capacitor");
  igual(origemAceita(new Request("https://edge.test", { headers: { origin: "https://malicioso.test" } }), permitidas), false, "origem estranha");
});

Deno.test("JSON limitado exige content-type, objeto e tamanho", async () => {
  const ok = await lerJsonLimitado(new Request("https://edge.test", {
    method: "POST", headers: { "content-type": "application/json" }, body: '{"a":1}',
  }), 32);
  igual(ok.a, 1, "JSON valido");

  let erro: unknown;
  try {
    await lerJsonLimitado(new Request("https://edge.test", {
      method: "POST", headers: { "content-type": "text/plain" }, body: "{}",
    }));
  } catch (e) { erro = e; }
  igual(erro instanceof ErroHttp && erro.status, 415, "content-type");
});

Deno.test("URLs externas ficam presas a HTTPS e dominios permitidos", () => {
  igual(urlHttpsPermitida("https://checkout.dlocalgo.com/pay/1", ["dlocalgo.com"])?.hostname,
    "checkout.dlocalgo.com", "dLocal valido");
  igual(urlHttpsPermitida("javascript:alert(1)", ["dlocalgo.com"]), null, "javascript");
  igual(urlHttpsPermitida("https://dlocalgo.com.evil.test/", ["dlocalgo.com"]), null, "sufixo falso");
});

Deno.test("SHA-256 e deterministico", async () => {
  igual(await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "vetor conhecido");
});
