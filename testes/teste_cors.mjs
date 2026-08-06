/* Prova de CORS das funcoes de borda.
 *
 * Existe por causa de um erro real: `emitir-licenca` nao permitia o cabecalho
 * `apikey`, que o aplicativo manda em toda chamada. O preflight do navegador
 * recusava, e ativar a licenca respondia «Failed to fetch» — mas so num
 * navegador de verdade: com curl passava, porque curl nao faz preflight.
 * Ninguem conseguiria ativar pela web e os testes nao viam nada.
 *
 * Uso: node testes/teste_cors.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(
  readFileSync(join(RAIZ, "nuvem/supabase/client_config.local.json"), "utf8"),
);

// Os cabecalhos que o aplicativo realmente envia (ver LIC.nuvem no modelo).
const ENVIADOS = "authorization, content-type, apikey";
const FUNCOES = ["emitir-licenca", "criar-checkout"];

let falhas = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const falha = (m) => { console.log(`  FALHA ${m}`); falhas++; };

for (const fn of FUNCOES) {
  const url = `${cfg.url}/functions/v1/${fn}`;
  let r;
  try {
    r = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: "https://exemplo.test",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": ENVIADOS,
      },
    });
  } catch (e) {
    falha(`${fn}: nao respondeu ao preflight (${e.message})`);
    continue;
  }

  if (r.status < 200 || r.status >= 300) {
    falha(`${fn}: preflight respondeu ${r.status}`);
    continue;
  }

  const permitidos = (r.headers.get("access-control-allow-headers") || "").toLowerCase();
  const faltando = ENVIADOS.split(",").map((h) => h.trim())
    .filter((h) => !permitidos.includes(h));
  if (faltando.length) {
    falha(`${fn}: preflight nao permite ${faltando.join(", ")} — o navegador vai recusar`);
  } else {
    ok(`${fn}: preflight permite os cabecalhos que o aplicativo envia`);
  }

  if (!(r.headers.get("access-control-allow-origin") || "").length) {
    falha(`${fn}: sem Access-Control-Allow-Origin`);
  } else {
    ok(`${fn}: devolve Access-Control-Allow-Origin`);
  }
}

console.log(`\n${falhas === 0 ? "CORS: tudo certo" : `${falhas} falha(s) de CORS`}`);
process.exit(falhas === 0 ? 0 : 1);
