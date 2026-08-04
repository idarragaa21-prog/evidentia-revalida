/**
 * Figuras clínicas: confere que todas carregam, que a ampliação mostra a imagem
 * em tamanho real (radiografia e eletrocardiograma só servem se der para ver o
 * traçado) e que as tabelas de exames continuam alinhadas.
 *
 * Uso: node testes/capturas_figuras.mjs
 */
import { abrirApp, assentar, captura, criarRelatorio } from './comum.mjs';

const rel = criarRelatorio('capturas e conferência das figuras');
const { navegador, pagina } = await abrirApp(rel, { viewport: { width: 1200, height: 1000 } });

/* ---- todas as figuras do acervo carregam de verdade ---- */
const inventario = await pagina.evaluate(() => ({
  comFigura: QUESTOES.filter((q) => q.figura).map((q) => ({ id: q.id, figura: q.figura })),
  noMapa: Object.keys(FIGS).length,
  semImagem: QUESTOES.filter((q) => q.figura && !FIGS[q.figura]).map((q) => q.id),
  orfas: Object.keys(FIGS).filter((k) => !QUESTOES.some((q) => q.figura === k))
}));
rel.igual(inventario.semImagem, [], 'toda questão com figura tem a imagem embutida');
rel.igual(inventario.orfas, [], 'não há imagem embutida sem questão correspondente');
rel.igual(inventario.comFigura.length, inventario.noMapa, 'a contagem de figuras bate com a de questões que as usam');
rel.info(`${inventario.comFigura.length} questões com figura`);

const decodificam = await pagina.evaluate(async () => {
  const falhas = [];
  for (const chave of Object.keys(FIGS)) {
    const ok = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0);
      img.onerror = () => resolve(false);
      img.src = 'data:image/jpeg;base64,' + FIGS[chave];
    });
    if (!ok) falhas.push(chave);
  }
  return falhas;
});
rel.igual(decodificam, [], 'todas as imagens embutidas decodificam no navegador');

/* ---- uma questão com figura, na prova ---- */
const abrirQuestao = (filtro) => pagina.evaluate((f) => {
  const q = QUESTOES.find(new Function('q', 'return ' + f));
  S = {
    items: [{ id: q.id, order: ['A', 'B', 'C', 'D'], resp: null, flag: false }], idx: 0,
    startTs: Date.now(), elapsed: 0, finished: false,
    cfg: { modo: 'aleatorio', areas: [], edicoes: [], cronometro: false, feedback: false, embaralhar: false, autoAvancar: false }
  };
  render('quiz');
  return q.id;
}, filtro);

const idFig = await abrirQuestao('q.figura && q.edicao==="2024/1"');
await pagina.waitForSelector('.figbox img');
rel.info('questão com figura: ' + idFig);
const figura = await pagina.evaluate(() => {
  const img = document.querySelector('.figbox img');
  return { carregou: img.complete && img.naturalWidth > 0, natural: [img.naturalWidth, img.naturalHeight], alt: img.alt };
});
rel.ok(figura.carregou, 'a figura da questão aparece na prova', figura);
rel.ok(/^Figura da questão/.test(figura.alt), 'a figura tem texto alternativo descritivo', figura.alt);
await assentar(pagina);
await pagina.screenshot({ path: captura('figura_na_prova.png'), fullPage: true });

/* ---- ampliação: precisa mostrar a imagem em tamanho real ---- */
await pagina.evaluate(() => document.querySelector('.figbox img').click());
await pagina.waitForSelector('.lightbox img');
await pagina.waitForFunction(() => {
  const i = document.querySelector('.lightbox img');
  return i && i.complete && i.naturalWidth > 0;
});
const ajustada = await pagina.evaluate(() => {
  const r = document.querySelector('.lightbox img').getBoundingClientRect();
  return { largura: Math.round(r.width), altura: Math.round(r.height) };
});
await pagina.evaluate(() => document.querySelector('.lightbox [data-act="zoom"]').click());
await pagina.waitForTimeout(150);
const ampliada = await pagina.evaluate(() => {
  const lb = document.querySelector('.lightbox');
  const i = lb.querySelector('img');
  const r = i.getBoundingClientRect();
  return { largura: Math.round(r.width), altura: Math.round(r.height), natural: [i.naturalWidth, i.naturalHeight], rolaVertical: lb.scrollHeight > lb.clientHeight };
});
rel.ok(ampliada.largura >= ajustada.largura, 'a ampliação não reduz a figura', { ajustada, ampliada });
rel.igual(ampliada.largura, ampliada.natural[0], 'ampliada, a figura fica no tamanho real (1 pixel da imagem por pixel da tela)');
await assentar(pagina);
await pagina.screenshot({ path: captura('figura_ampliada.png') });
await pagina.keyboard.press('Escape');
await pagina.waitForTimeout(120);
rel.igual(await pagina.evaluate(() => !!document.querySelector('.lightbox')), false,
  'a tecla Escape fecha a figura ampliada');

/* ---- ampliação no celular: era o caso em que o zoom não ampliava nada ---- */
await pagina.setViewportSize({ width: 375, height: 812 });
await abrirQuestao('q.edicao==="2024/2" && q.numero===46');
await pagina.waitForSelector('.figbox img');
await pagina.evaluate(() => document.querySelector('.figbox img').click());
await pagina.waitForFunction(() => {
  const i = document.querySelector('.lightbox img');
  return i && i.complete && i.naturalWidth > 0;
});
const celAjustada = await pagina.evaluate(() => Math.round(document.querySelector('.lightbox img').getBoundingClientRect().width));
await pagina.evaluate(() => document.querySelector('.lightbox [data-act="zoom"]').click());
await pagina.waitForTimeout(150);
const celAmpliada = await pagina.evaluate(() => {
  const lb = document.querySelector('.lightbox');
  const i = lb.querySelector('img');
  return { largura: Math.round(i.getBoundingClientRect().width), natural: i.naturalWidth, rola: lb.scrollWidth > lb.clientWidth || lb.scrollHeight > lb.clientHeight };
});
rel.ok(celAmpliada.largura > celAjustada,
  'celular: ampliar a figura realmente aumenta o traçado (o eletrocardiograma fica legível)',
  { ajustada: celAjustada, ampliada: celAmpliada.largura });
rel.ok(celAmpliada.rola, 'celular: com a figura ampliada dá para arrastar para ver o resto', celAmpliada);
await assentar(pagina);
await pagina.screenshot({ path: captura('figura_ampliada_celular.png') });
await pagina.evaluate(() => fecharLightbox());

/* ---- tabela de exames: as colunas continuam alinhadas na revisão ---- */
await pagina.setViewportSize({ width: 1200, height: 1000 });
await pagina.evaluate(() => {
  const q = QUESTOES.find((x) => x.edicao === '2024/2' && x.numero === 66);
  S = {
    items: [{ id: q.id, order: ['A', 'B', 'C', 'D'], resp: 'A', flag: false }], idx: 0,
    startTs: Date.now(), elapsed: 0, finished: true,
    cfg: { modo: 'aleatorio', areas: [], edicoes: [], cronometro: false, feedback: false, embaralhar: false, autoAvancar: false }
  };
  go('review', 'todas');
});
await pagina.waitForSelector('.rev-card');
await pagina.evaluate(() => document.querySelectorAll('details.just').forEach((d) => { d.open = true; }));
await pagina.waitForTimeout(150);
rel.ok(await pagina.evaluate(() => document.querySelector('.enun').textContent.includes('|')),
  'a tabela de exames mantém o separador de colunas');
await assentar(pagina);
await pagina.screenshot({ path: captura('tabela_de_exames.png'), fullPage: true });

await navegador.close();
rel.encerrar();
