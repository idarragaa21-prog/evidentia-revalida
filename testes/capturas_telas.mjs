/**
 * Percorre as telas principais no computador e no celular, grava as capturas e
 * confere o que costuma quebrar no caminho: transbordo horizontal, botão da
 * prova cortado em telas estreitas e área de toque pequena demais.
 *
 * As capturas vão para um diretório temporário; defina EVIDENTIA_CAPTURAS para
 * escolher outro lugar.
 *
 * Uso: node testes/capturas_telas.mjs
 */
import { abrirApp, assentar, captura, criarRelatorio, novaPagina } from './comum.mjs';

const ALVO_TOQUE = 44;   // recomendação de área mínima de toque
const CFG_BASE = { modo: 'aleatorio', areas: [], edicoes: [], embaralhar: false, incluirAnuladas: false, cronometro: true, feedback: false, autoAvancar: false };

const rel = criarRelatorio('capturas e conferência das telas');
const { navegador, ctx, pagina } = await abrirApp(rel, { viewport: { width: 1280, height: 900 }, rotulo: 'desktop' });

const semTransbordo = async (p, onde) => {
  const excesso = await p.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  rel.ok(excesso <= 0, `${onde}: a página não rola na horizontal`, excesso ? `${excesso}px de excesso` : undefined);
};

/* ============================ COMPUTADOR ============================ */
await pagina.evaluate((base) => {
  Object.assign(cfg, base);
  setModo('especialidade'); allAreas(false);
  toggleArea('Clínica Médica'); toggleArea('Pediatria'); setN(30);
}, CFG_BASE);
await pagina.waitForTimeout(150);
await assentar(pagina);
await pagina.screenshot({ path: captura('desktop_inicio_especialidade.png'), fullPage: true });
await semTransbordo(pagina, 'início (computador)');
rel.igual(await pagina.evaluate(() => document.querySelectorAll('#chAreas .chip.on').length), 2,
  'início: as duas especialidades escolhidas ficam marcadas');
rel.igual(await pagina.evaluate(() => !!$('#btnIniciar') && $('#btnIniciar').disabled), false,
  'início: com especialidades escolhidas, o botão de iniciar fica ativo');

await pagina.evaluate(() => { allAreas(false); });
await pagina.waitForTimeout(120);
rel.igual(await pagina.evaluate(() => $('#btnIniciar').disabled), true,
  'início: sem nenhuma especialidade, o botão de iniciar fica bloqueado');
await assentar(pagina);
await pagina.screenshot({ path: captura('desktop_inicio_sem_selecao.png'), fullPage: true });

await pagina.evaluate((base) => { Object.assign(cfg, base, { n: 6 }); setModo('aleatorio'); startRun(); }, CFG_BASE);
await pagina.waitForSelector('.alts .alt');
await pagina.evaluate(() => answer(curItem().order[2]));
await pagina.waitForTimeout(120);
await assentar(pagina);
await pagina.screenshot({ path: captura('desktop_prova_respondida.png'), fullPage: true });
rel.igual(await pagina.evaluate(() => document.querySelectorAll('#alts .alt.sel .key')[0]?.textContent.trim()), 'C',
  'prova: a alternativa marcada é a que foi clicada');

await pagina.evaluate((base) => { Object.assign(cfg, base, { n: 4, feedback: true }); startRun(); }, CFG_BASE);
await pagina.waitForSelector('.alts .alt');
await pagina.evaluate(() => { const it = curItem(); answer(qById(it.id).gabarito); });
await pagina.waitForSelector('.just');
await assentar(pagina);
await pagina.screenshot({ path: captura('desktop_modo_estudo.png'), fullPage: true });
rel.ok(await pagina.evaluate(() => !!document.querySelector('.alt.correct')),
  'modo estudo: a correção aparece logo após responder');

await pagina.evaluate(() => {
  S.items.forEach((it, i) => { const q = qById(it.id); it.resp = i % 2 ? q.gabarito : ['A', 'B', 'C', 'D'].find((L) => L !== q.gabarito); });
  finishRun();
});
await pagina.waitForSelector('.result-hero');
await assentar(pagina);
await pagina.screenshot({ path: captura('desktop_resultado.png'), fullPage: true });
await semTransbordo(pagina, 'resultado (computador)');

await pagina.evaluate(() => go('review', 'todas'));
await pagina.waitForSelector('.rev-card');
await pagina.evaluate(() => document.querySelectorAll('details.just').forEach((d) => { d.open = true; }));
await assentar(pagina);
await pagina.screenshot({ path: captura('desktop_revisao.png'), fullPage: true });

await pagina.evaluate(() => go('history'));
await pagina.waitForTimeout(200);
await assentar(pagina);
await pagina.screenshot({ path: captura('desktop_historico.png'), fullPage: true });
await pagina.evaluate(() => go('about'));
await pagina.waitForTimeout(200);
await assentar(pagina);
await pagina.screenshot({ path: captura('desktop_sobre.png'), fullPage: true });

/* ============================== CELULAR ============================== */
const celular = await novaPagina(ctx, rel, 'celular', { width: 375, height: 812 });
await assentar(celular);
await celular.screenshot({ path: captura('celular_inicio.png'), fullPage: true });
await semTransbordo(celular, 'início (celular)');

await celular.evaluate((base) => { Object.assign(cfg, base, { n: 6 }); startRun(); }, CFG_BASE);
await celular.waitForSelector('.qactions');
await assentar(celular);
await celular.screenshot({ path: captura('celular_prova.png'), fullPage: true });
await semTransbordo(celular, 'prova (celular)');

const acoes = await celular.evaluate(() => {
  const barra = document.querySelector('.qactions');
  const botoes = [...barra.querySelectorAll('button')].map((b) => {
    const r = b.getBoundingClientRect();
    return { texto: b.textContent.trim().slice(0, 12), altura: Math.round(r.height), direita: Math.round(r.right), cortado: r.right > innerWidth + 1 || r.left < -1 };
  });
  return { excesso: barra.scrollWidth - barra.clientWidth, botoes, largura: innerWidth };
});
rel.igual(acoes.excesso, 0, 'prova (celular): a barra de ações não transborda', acoes);
rel.ok(acoes.botoes.every((b) => !b.cortado), 'prova (celular): nenhum botão de ação fica cortado pela tela', acoes.botoes);
rel.ok(acoes.botoes.every((b) => b.altura >= ALVO_TOQUE),
  `prova (celular): os botões de ação têm ao menos ${ALVO_TOQUE}px de altura`, acoes.botoes);

/* última questão: o botão de finalizar é o mais largo e é o que costumava sair da tela */
await celular.evaluate(() => { S.idx = S.items.length - 1; render('quiz'); });
await celular.waitForSelector('.navbtn.finish');
const finalizar = await celular.evaluate(() => {
  const r = document.querySelector('.navbtn.finish').getBoundingClientRect();
  return { direita: Math.round(r.right), largura: innerWidth, cortado: r.right > innerWidth + 1 };
});
rel.ok(!finalizar.cortado, 'prova (celular): o botão de finalizar cabe na tela', finalizar);
await assentar(celular);
await celular.screenshot({ path: captura('celular_prova_ultima.png'), fullPage: true });

const toques = await celular.evaluate((alvo) => {
  const sels = ['.iconbtn', '.switch', '.chip', '.preset', '.alt', '.stepper button', '.linklike'];
  const pequenos = [];
  for (const sel of sels) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.height && r.height < alvo) pequenos.push({ sel, altura: Math.round(r.height) });
    }
  }
  return pequenos;
}, ALVO_TOQUE);
rel.ok(toques.length === 0, `celular: nenhum controle abaixo de ${ALVO_TOQUE}px de altura`, toques.slice(0, 6));

await celular.evaluate(() => {
  S.items.forEach((it) => { it.resp = qById(it.id).gabarito; });
  finishRun();
});
await celular.waitForSelector('.result-hero');
await assentar(celular);
await celular.screenshot({ path: captura('celular_resultado.png'), fullPage: true });
await semTransbordo(celular, 'resultado (celular)');

await navegador.close();
rel.encerrar();
