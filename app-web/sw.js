/* Service worker do Evidentia · Revalida.
 *
 * ARQUIVO VERSIONADO A MAO. A unica parte gerada e o valor de VERSAO, que
 * scripts/09_montar_pwa.py reescreve a cada montagem com o resumo (hash) de
 * index.html, do manifesto e dos icones. Como o nome do cache deriva de VERSAO,
 * toda publicacao nova invalida sozinha o cache antigo -- sem isso, quem ja
 * instalou o aplicativo ficaria preso para sempre na primeira versao.
 *
 * Estrategia de cache:
 *   - Documento (navegacao): responde do cache e revalida em segundo plano
 *     (stale-while-revalidate). Abre instantaneo, funciona sem internet e a
 *     versao nova entra na abertura seguinte.
 *   - Manifesto e icones: cache primeiro; dentro de uma mesma VERSAO nao mudam.
 *   - So guarda respostas 200 do proprio site. Respostas de erro, redirecionadas
 *     ou opacas nunca entram no cache.
 *   - O desvio para o index.html vale apenas para navegacoes; um icone que
 *     falha continua falhando, em vez de devolver 2,8 MB de HTML no lugar.
 */

const VERSAO = "1d3b014a31cf";
const CACHE = "evidentia-revalida-" + VERSAO;
const PREFIXO = "evidentia-revalida-";

const BASE = new URL("./", self.location.href).href;
const INDEX = new URL("./index.html", self.location.href).href;

const COMPLEMENTOS = [
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/icon-1024.png",
  "./icons/apple-touch-icon-180.png",
  "./icons/favicon-64.png",
].map((caminho) => new URL(caminho, self.location.href).href);

/* Pedido que revalida com o servidor em vez de baixar tudo de novo:
   se nada mudou o servidor responde 304 e o corpo vem do cache do navegador. */
function pedidoFresco(url) {
  try {
    return new Request(url, { cache: "no-cache" });
  } catch (e) {
    return new Request(url);
  }
}

function guardavel(resposta) {
  return !!resposta
    && resposta.status === 200
    && !resposta.redirected
    && (resposta.type === "basic" || resposta.type === "default");
}

function respostaSemRede() {
  return new Response(
    "<!DOCTYPE html><html lang=\"pt-BR\"><meta charset=\"utf-8\">"
    + "<title>Sem conexão</title>"
    + "<body style=\"font-family:system-ui,sans-serif;margin:3rem auto;max-width:32rem;padding:0 1rem;color:#1a2620\">"
    + "<h1 style=\"font-size:1.25rem\">Evidentia · Revalida</h1>"
    + "<p>O aplicativo ainda não foi guardado neste aparelho e não há conexão agora. "
    + "Abra esta página uma vez com internet: depois disso ela funciona offline.</p>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

self.addEventListener("install", (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // O documento e obrigatorio: sem ele nao ha aplicativo offline.
    await cache.add(pedidoFresco(INDEX));
    // Os demais sao complementares: uma falha isolada nao invalida a instalacao.
    await Promise.allSettled(COMPLEMENTOS.map((url) => cache.add(pedidoFresco(url))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil((async () => {
    // Apaga so os caches deste aplicativo: em github.io a origem e compartilhada
    // com os outros repositorios do mesmo usuario.
    const nomes = await caches.keys();
    await Promise.all(
      nomes.filter((nome) => nome.startsWith(PREFIXO) && nome !== CACHE)
           .map((nome) => caches.delete(nome))
    );
    await self.clients.claim();
    const abas = await self.clients.matchAll({ type: "window" });
    for (const aba of abas) {
      aba.postMessage({ tipo: "evidentia-atualizado", versao: VERSAO });
    }
  })());
});

/* Documento: cache primeiro, revalidacao em segundo plano. */
async function documento(evento) {
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(INDEX);

  const daRede = fetch(evento.request).then(async (resposta) => {
    if (guardavel(resposta)) {
      await cache.put(INDEX, resposta.clone());
    }
    return resposta;
  }).catch(() => null);

  if (guardado) {
    evento.waitUntil(daRede);
    return guardado;
  }
  return (await daRede) || respostaSemRede();
}

/* Manifesto e icones: cache primeiro, sem desvio para o index.html. */
async function estatico(evento) {
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(evento.request, { ignoreSearch: true });
  if (guardado) return guardado;

  const resposta = await fetch(evento.request).catch(() => null);
  if (!resposta) return Response.error();
  if (guardavel(resposta)) {
    evento.waitUntil(cache.put(evento.request, resposta.clone()));
  }
  return resposta;
}

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;
  if (pedido.headers.has("range")) return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(BASE)) return;

  if (pedido.mode === "navigate") {
    evento.respondWith(documento(evento));
    return;
  }
  evento.respondWith(estatico(evento));
});

self.addEventListener("message", (evento) => {
  if (evento.data && evento.data.tipo === "pular-espera") self.skipWaiting();
});
