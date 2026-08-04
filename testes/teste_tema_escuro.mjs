/**
 * Tema escuro: verifica que nenhum elemento fica ilegível no escuro.
 *
 * O motivo do teste: os botões de ícone da prova (sair, mapa de questões) e os
 * de voltar traziam a cor cravada no atributo style, que vence qualquer regra
 * do tema — no escuro ficavam com contraste 1,04:1, invisíveis na prática.
 *
 * Uso: node testes/teste_tema_escuro.mjs
 */
import { abrirApp, captura, criarRelatorio } from './comum.mjs';

const AA_TEXTO_NORMAL = 4.5;

const rel = criarRelatorio('teste do tema escuro');
const { navegador, pagina } = await abrirApp(rel, { viewport: { width: 1200, height: 900 } });

/* Mede o contraste de um conjunto de seletores contra o fundo efetivo. */
const medirContrastes = (seletores) => pagina.evaluate((sels) => {
  const canal = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (cor) => {
    const [r, g, b] = cor.match(/[\d.]+/g).map(Number);
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  };
  const fundoDe = (el) => {
    let n = el;
    while (n) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)' && !/,\s*0\)$/.test(c)) return c;
      n = n.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  };
  const razao = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
  };
  const saida = {};
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (el) saida[sel] = razao(getComputedStyle(el).color, fundoDe(el));
  }
  return saida;
}, seletores);

await pagina.evaluate(() => {
  if (document.documentElement.getAttribute('data-theme') !== 'dark') toggleTheme();
});
rel.igual(await pagina.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark',
  'o tema escuro fica ativo depois de alternar');

/* ---- tela inicial ---- */
const inicio = await medirContrastes(['.brand b', '.iconbtn', '.section-t', '.tg .lab b', '.tg .lab small', 'footer']);
for (const [sel, valor] of Object.entries(inicio)) {
  rel.ok(valor >= AA_TEXTO_NORMAL, `escuro · início · ${sel} atinge AA (${valor}:1)`, valor);
}
await pagina.screenshot({ path: captura('escuro_inicio.png'), fullPage: true });

/* ---- prova: os ícones de navegação são o caso que motivou o teste ---- */
await pagina.evaluate(() => {
  Object.assign(cfg, { modo: 'aleatorio', n: 8, embaralhar: false, incluirAnuladas: false, cronometro: true, feedback: false, autoAvancar: false });
  startRun();
});
await pagina.waitForSelector('.qtop .iconbtn-nav');
const prova = await medirContrastes(['.iconbtn-nav', '.qcount', '.alt .txt', '.alt .key', '.timer', '.kbdhint', '.flagbtn']);
for (const [sel, valor] of Object.entries(prova)) {
  rel.ok(valor >= AA_TEXTO_NORMAL, `escuro · prova · ${sel} atinge AA (${valor}:1)`, valor);
}
rel.igual(await pagina.evaluate(() => document.querySelectorAll('[style*="var(--navy)"]').length), 0,
  'nenhum elemento força var(--navy) por style inline (ilegível no escuro)');
await pagina.screenshot({ path: captura('escuro_prova.png'), fullPage: true });

/* ---- mapa de questões: os números das respondidas ---- */
await pagina.evaluate(() => { S.items.forEach((it, i) => { if (i % 2) it.resp = 'A'; }); openNav(); });
await pagina.waitForSelector('.qgrid button.answered');
const mapa = await medirContrastes(['.qgrid button.answered', '.qgrid button']);
for (const [sel, valor] of Object.entries(mapa)) {
  rel.ok(valor >= AA_TEXTO_NORMAL, `escuro · mapa · ${sel} atinge AA (${valor}:1)`, valor);
}
await pagina.evaluate(() => closeModal());

/* ---- resultado e revisão ---- */
await pagina.evaluate(() => {
  S.items.forEach((it, i) => { const q = qById(it.id); it.resp = i % 2 ? q.gabarito : ['A', 'B', 'C', 'D'].find((L) => L !== q.gabarito); });
  finishRun();
});
await pagina.waitForSelector('.result-hero');
const resultado = await medirContrastes(['.verdict', '.tile.g b', '.tile.r b', '.tile.n b', '.barrow .top span']);
for (const [sel, valor] of Object.entries(resultado)) {
  rel.ok(valor >= AA_TEXTO_NORMAL, `escuro · resultado · ${sel} atinge AA (${valor}:1)`, valor);
}
await pagina.screenshot({ path: captura('escuro_resultado.png'), fullPage: true });

await pagina.evaluate(() => go('review', 'todas'));
await pagina.waitForSelector('.rev-card');
await pagina.evaluate(() => document.querySelectorAll('details.just').forEach((d) => { d.open = true; }));
const revisao = await medirContrastes(['.just .body', '.just .src', '.just summary .badge', '.alt.correct .mk']);
for (const [sel, valor] of Object.entries(revisao)) {
  rel.ok(valor >= AA_TEXTO_NORMAL, `escuro · revisão · ${sel} atinge AA (${valor}:1)`, valor);
}
await pagina.screenshot({ path: captura('escuro_revisao.png'), fullPage: true });

/* ---- o tema sobrevive ao recarregamento ---- */
await pagina.reload({ waitUntil: 'load' });
await pagina.waitForFunction(() => typeof QUESTOES !== 'undefined');
rel.igual(await pagina.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark',
  'a escolha do tema é lembrada ao reabrir');

await navegador.close();
rel.encerrar();
