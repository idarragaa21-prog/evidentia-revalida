/**
 * Teste funcional do aplicativo (Playwright, headless).
 *
 * Cobre:
 *   1. ambiente e armazenamento;
 *   2. pontuação: tudo certo, tudo errado, metade em branco, anuladas fora da conta;
 *   3. correspondência entre a alternativa exibida e a letra original (embaralhamento);
 *   4. REGRESSÃO — letra do gabarito na revisão com alternativas embaralhadas;
 *   5. REGRESSÃO — importação de backup malformado não pode quebrar o aplicativo;
 *   6. REGRESSÃO — atalhos A–D não podem responder com modal aberto, com foco
 *      num campo de entrada, nem combinados com Cmd/Ctrl;
 *   7. REGRESSÃO — o cronômetro para ao finalizar o simulado.
 *
 * Sai com código diferente de zero se qualquer verificação falhar.
 */
import { abrirApp, novaPagina, criarRelatorio, capturarDialogos, captura } from './comum.mjs';

const rel = criarRelatorio('teste funcional');
const { navegador, ctx, pagina: p } = await abrirApp(rel, { rotulo: 'desktop' });
const dialogos = capturarDialogos(p);

const CFG_BASE = {
  modo: 'aleatorio', areas: [], edicoes: [], n: 20,
  embaralhar: false, incluirAnuladas: false, cronometro: false,
  feedback: false, autoAvancar: false
};

try {
  /* ============================ 1. AMBIENTE ============================ */
  const amb = await p.evaluate(() => {
    store.set('_probe', 'x'); const v = store.get('_probe'); store.del('_probe');
    return {
      ok: store.ok, roundtrip: v === 'x',
      total: QUESTOES.length,
      anuladas: QUESTOES.filter(q => q.anulada).length,
      edicoes: (META.edicoes || []).length
    };
  });
  rel.info(`armazenamento local ${amb.ok ? 'disponível' : 'indisponível — usando memória (normal em file://)'}`);
  rel.info(`${amb.total} questões · ${amb.anuladas} anuladas · ${amb.edicoes} edições`);
  rel.ok(amb.roundtrip, 'store grava e lê valores (com ou sem localStorage)');
  rel.ok(amb.total > 0 && amb.edicoes > 0, 'banco de questões carregado', amb);

  /* ========================== 2. PONTUAÇÃO ============================ */
  const t1 = await p.evaluate((base) => {
    Object.assign(cfg, base, { n: QUESTOES.length, embaralhar: true, incluirAnuladas: true });
    startRun();
    let validas = 0, anuladas = 0;
    S.items.forEach(it => {
      const q = qById(it.id);
      if (q.anulada) { anuladas++; it.resp = null; return; }
      validas++; it.resp = q.gabarito;
    });
    const r = scoreRun();
    return { validas, anuladas, n: S.items.length, ac: r.ac, er: r.er, br: r.br, anul: r.anul, tot: r.tot, pct: r.pct };
  }, CFG_BASE);
  rel.igual(t1.n, amb.total, 'simulado com o acervo inteiro seleciona todas as questões');
  rel.igual([t1.ac, t1.er, t1.br], [t1.validas, 0, 0], 'tudo correto: acertos = questões válidas, sem erros nem brancos');
  rel.igual(t1.tot, t1.validas, 'tudo correto: o total pontuado ignora as anuladas');
  rel.igual(t1.anul, amb.anuladas, 'tudo correto: as anuladas são contabilizadas à parte');
  rel.igual(t1.pct, 1, 'tudo correto: aproveitamento 100%');

  const t2 = await p.evaluate(() => {
    S.items.forEach(it => {
      const q = qById(it.id);
      it.resp = q.anulada ? null : ['A', 'B', 'C', 'D'].find(L => L !== q.gabarito);
    });
    const r = scoreRun();
    return { ac: r.ac, er: r.er, br: r.br, anul: r.anul, tot: r.tot, pct: r.pct };
  });
  rel.igual([t2.ac, t2.er, t2.br], [0, t1.validas, 0], 'tudo errado: zero acertos e todas as válidas como erro');
  rel.igual(t2.pct, 0, 'tudo errado: aproveitamento 0%');
  rel.igual(t2.tot, t1.validas, 'tudo errado: o total pontuado continua ignorando as anuladas');

  const t3 = await p.evaluate(() => {
    let i = 0;
    S.items.forEach(it => {
      const q = qById(it.id);
      if (q.anulada) { it.resp = null; return; }
      it.resp = (i++ % 2 === 0) ? q.gabarito : null;
    });
    const r = scoreRun();
    return { ac: r.ac, er: r.er, br: r.br, tot: r.tot, pct: r.pct };
  });
  rel.igual(t3.er, 0, 'metade em branco: nenhuma resposta errada');
  rel.igual(t3.ac + t3.br, t1.validas, 'metade em branco: acertos + brancos = questões válidas');
  rel.igual(t3.ac, Math.ceil(t1.validas / 2), 'metade em branco: metade exata das válidas acertada');
  rel.ok(Math.abs(t3.pct - t3.ac / t3.tot) < 1e-9, 'metade em branco: percentual = acertos ÷ válidas', t3);

  const t4 = await p.evaluate(() => {
    S.items.forEach(it => { const q = qById(it.id); it.resp = q.anulada ? 'A' : q.gabarito; });
    const a = scoreRun();
    S.items.forEach(it => { if (qById(it.id).anulada) it.resp = null; });
    const b = scoreRun();
    return {
      comResposta: { ac: a.ac, er: a.er, br: a.br, tot: a.tot, anul: a.anul, pct: a.pct },
      semResposta: { ac: b.ac, er: b.er, br: b.br, tot: b.tot, anul: b.anul, pct: b.pct }
    };
  });
  rel.igual(t4.comResposta, t4.semResposta, 'anuladas: responder ou deixar em branco não altera a pontuação');
  rel.igual(t4.comResposta.tot + t4.comResposta.anul, amb.total, 'anuladas: válidas + anuladas = total do simulado');

  /* ============ 3. MAPEAMENTO DAS ALTERNATIVAS (EMBARALHADO) ========== */
  const mapa = await p.evaluate((base) => {
    Object.assign(cfg, base, { n: 8, embaralhar: true });
    startRun(); render('quiz');
    const it = curItem(), q = qById(it.id);
    const alts = [...document.querySelectorAll('#alts .alt')];
    return {
      quantidade: alts.length,
      algumEmbaralhado: S.items.some(x => x.order.join('') !== 'ABCD'),
      linhas: alts.map((b, pos) => ({
        letra: b.querySelector('.key').textContent.trim(),
        letraEsperada: 'ABCD'[pos],
        original: b.getAttribute('data-o'),
        originalEsperado: it.order[pos],
        textoOk: b.querySelector('.txt').textContent === q.alternativas[it.order[pos]]
      }))
    };
  }, CFG_BASE);
  rel.igual(mapa.quantidade, 4, 'quiz mostra quatro alternativas');
  rel.ok(mapa.algumEmbaralhado, 'a opção "embaralhar" realmente reordena as alternativas');
  rel.ok(mapa.linhas.every(l => l.letra === l.letraEsperada), 'as letras exibidas seguem a ordem A, B, C, D', mapa.linhas);
  rel.ok(mapa.linhas.every(l => l.original === l.originalEsperado), 'cada alternativa exibida aponta para a letra original correta', mapa.linhas);
  rel.ok(mapa.linhas.every(l => l.textoOk), 'o texto exibido corresponde à alternativa original mapeada', mapa.linhas);

  const ordemAtual = await p.evaluate(() => curItem().order);
  await p.click('#alts .alt:nth-child(3)');
  const respClique = await p.evaluate(() => curItem().resp);
  rel.igual(respClique, ordemAtual[2], 'clicar na alternativa exibida como C grava a letra original correspondente');

  /* ===== 4. REGRESSÃO: LETRA DO GABARITO NA REVISÃO COM EMBARALHAMENTO = */
  const revisao = await p.evaluate((base) => {
    Object.assign(cfg, base, { n: 6, embaralhar: true });
    startRun();
    // ordem invertida determinística: garante letra exibida ≠ letra original
    S.items.forEach(it => {
      it.order = ['D', 'C', 'B', 'A'];
      const q = qById(it.id);
      it.resp = ['A', 'B', 'C', 'D'].find(L => L !== q.gabarito); // erra de propósito
    });
    finishRun();
    go('review', 'todas');
    return [...document.querySelectorAll('.rev-card')].map((c, i) => {
      const it = S.items[i], q = qById(it.id);
      const correta = c.querySelector('.alt.correct');
      const src = c.querySelector('.just .src');
      return {
        gabaritoOriginal: q.gabarito,
        letraEsperada: 'ABCD'[it.order.indexOf(q.gabarito)],
        letraExibida: correta ? correta.querySelector('.key').textContent.trim() : null,
        textoCorretoOk: correta ? correta.querySelector('.txt').textContent === q.alternativas[q.gabarito] : false,
        textoSrc: src ? src.textContent.trim() : ''
      };
    });
  }, CFG_BASE);

  const letraDoTexto = (t) => {
    const m = t.match(/gabarito[^A-D]*\b([A-D])\b/i) || t.match(/\b([A-D])\b/);
    return m ? m[1] : null;
  };
  rel.ok(revisao.length === 6, 'a revisão lista todas as questões do simulado', revisao.length);
  rel.ok(revisao.every(r => r.letraExibida === r.letraEsperada),
    'revisão: a alternativa marcada como correta está na posição embaralhada certa',
    revisao.map(r => ({ esperada: r.letraEsperada, exibida: r.letraExibida })));
  rel.ok(revisao.every(r => r.textoCorretoOk),
    'revisão: a alternativa marcada como correta traz o texto do gabarito oficial');
  const letrasSrc = revisao.map(r => ({ noTexto: letraDoTexto(r.textoSrc), esperada: r.letraEsperada, original: r.gabaritoOriginal, src: r.textoSrc }));
  rel.ok(letrasSrc.every(l => l.noTexto === l.esperada),
    'revisão: a letra anunciada como gabarito oficial é a letra que o usuário viu (bug do embaralhamento)',
    letrasSrc.slice(0, 3));

  const estudo = await p.evaluate((base) => {
    Object.assign(cfg, base, { n: 3, embaralhar: true, feedback: true });
    startRun();
    S.items.forEach(it => { it.order = ['D', 'C', 'B', 'A']; });
    render('quiz');
    const it = curItem(), q = qById(it.id);
    answer(q.gabarito);
    const correta = document.querySelector('#alts .alt.correct');
    const src = document.querySelector('.just .src');
    return {
      letraEsperada: 'ABCD'[it.order.indexOf(q.gabarito)],
      letraExibida: correta ? correta.querySelector('.key').textContent.trim() : null,
      textoSrc: src ? src.textContent.trim() : ''
    };
  }, CFG_BASE);
  rel.igual(estudo.letraExibida, estudo.letraEsperada, 'modo estudo: a alternativa revelada como correta respeita o embaralhamento');
  rel.igual(letraDoTexto(estudo.textoSrc), estudo.letraEsperada,
    'modo estudo: a letra anunciada como gabarito oficial é a letra que o usuário viu');

  /* ========= 5. REGRESSÃO: IMPORTAÇÃO DE BACKUP MALFORMADO =========== */
  const HIST_SEMENTE = [{
    ts: 1700000000000, n: 1, ac: 1, er: 0, br: 0, anul: 0, tot: 1, pct: 1,
    elapsed: 12, modo: 'aleatorio', areas: [], edicoes: [], items: []
  }];
  await p.evaluate((h) => { closeModal(); saveHist(h); Object.assign(cfg, { modo: 'aleatorio', areas: [], edicoes: [], n: 10 }); }, HIST_SEMENTE);

  async function tentarImportar(rotulo, texto) {
    dialogos.length = 0;
    const problemasAntes = rel.problemas().length;
    const antes = await p.evaluate(() => ({ hist: loadHist(), cfg: JSON.parse(JSON.stringify(cfg)) }));
    await p.evaluate((txt) => {
      const f = new File([txt], 'backup.json', { type: 'application/json' });
      importBackup(f);
    }, texto);
    await p.waitForTimeout(400);
    const depois = await p.evaluate(() => ({
      hist: loadHist(),
      cfg: JSON.parse(JSON.stringify(cfg)),
      modal: document.querySelector('#ov') ? document.querySelector('#ov').textContent.trim() : ''
    }));
    const msgs = dialogos.slice();
    const novosProblemas = rel.problemas().slice(problemasAntes);
    // o aplicativo tem de continuar utilizável
    const vivo = await p.evaluate(() => {
      try {
        closeModal();
        Object.assign(cfg, { modo: 'aleatorio', areas: [], edicoes: [], n: 5, embaralhar: false, incluirAnuladas: false, cronometro: false, feedback: false, autoAvancar: false });
        go('home'); startRun(); render('quiz');
        const ok = !!document.querySelector('#alts .alt') && S.items.length === 5;
        go('home');
        return { ok };
      } catch (e) { return { ok: false, erro: String(e && e.message || e) }; }
    });
    const textoMostrado = (msgs.join(' | ') + ' ' + depois.modal).trim();
    const ofereceuRestaurar = /restaurar/i.test(depois.modal);
    const avisou = msgs.length > 0 || /inv[áa]lid|corromp|erro|falh|n[ãa]o foi poss/i.test(depois.modal);

    rel.igual(depois.hist, antes.hist, `backup ${rotulo}: o histórico existente não é alterado`);
    rel.ok(!ofereceuRestaurar, `backup ${rotulo}: o aplicativo não oferece restaurar um arquivo inválido`, depois.modal.slice(0, 160));
    rel.ok(avisou, `backup ${rotulo}: o aplicativo avisa que o arquivo é inválido`, textoMostrado.slice(0, 160) || '(nenhuma mensagem)');
    rel.igual(novosProblemas, [], `backup ${rotulo}: nenhuma exceção não tratada`);
    rel.ok(vivo.ok, `backup ${rotulo}: o aplicativo continua funcionando depois da tentativa`, vivo);
    return depois;
  }

  await tentarImportar('com JSON inválido', '{"hist": [ isto não é json');
  await tentarImportar('com conteúdo lixo (JSON válido)', '{"hist":[1,2,3],"cfg":"nada disso"}');
  await tentarImportar('sem os campos esperados', '{"foo":"bar"}');
  await tentarImportar('com cfg de tipos errados', JSON.stringify({
    _app: 'evidentia-revalida', _v: 1, hist: [{ lixo: true }],
    cfg: { modo: 42, areas: 'tudo', edicoes: null, n: 'muitas' }
  }));

  // um backup legítimo tem de continuar sendo aceito
  dialogos.length = 0;
  const backupBom = JSON.stringify({
    _app: 'evidentia-revalida', _v: 1, ts: Date.now(),
    hist: [
      { ts: 1700000001000, n: 2, ac: 2, er: 0, br: 0, anul: 0, tot: 2, pct: 1, elapsed: 30, modo: 'aleatorio', areas: [], edicoes: [], items: [] },
      { ts: 1700000002000, n: 2, ac: 1, er: 1, br: 0, anul: 0, tot: 2, pct: 0.5, elapsed: 40, modo: 'aleatorio', areas: [], edicoes: [], items: [] }
    ],
    cfg: { modo: 'aleatorio', areas: [], edicoes: [], n: 15, embaralhar: true, incluirAnuladas: false, cronometro: true, feedback: false, autoAvancar: false }
  });
  await p.evaluate((txt) => {
    const f = new File([txt], 'backup.json', { type: 'application/json' });
    importBackup(f);
  }, backupBom);
  await p.waitForTimeout(400);
  const temConfirmacao = await p.evaluate(() => {
    const o = document.querySelector('#ov');
    return o ? o.textContent : '';
  });
  rel.ok(/restaurar/i.test(temConfirmacao), 'backup válido: o aplicativo pede confirmação para restaurar', temConfirmacao.slice(0, 160));
  if (/restaurar/i.test(temConfirmacao)) {
    await p.click('#ov button:has-text("Restaurar")');
    await p.waitForTimeout(300);
    const restaurado = await p.evaluate(() => ({ hist: loadHist().length, n: cfg.n, embaralhar: cfg.embaralhar }));
    rel.igual(restaurado, { hist: 2, n: 15, embaralhar: true }, 'backup válido: histórico e configuração são restaurados');
  }
  await p.evaluate(() => { closeModal(); store.del('revalida_hist'); Object.assign(cfg, { n: 10, embaralhar: false, cronometro: false }); go('home'); });

  /* ============= 6. REGRESSÃO: ATALHOS DE TECLADO A–D ================= */
  await p.evaluate((base) => {
    closeModal();
    Object.assign(cfg, base, { n: 5 });
    startRun(); render('quiz');
  }, CFG_BASE);

  await p.evaluate(() => openNav());
  await p.waitForSelector('#ov');
  await p.keyboard.press('c');
  const atalhoModal = await p.evaluate(() => curItem().resp);
  await p.evaluate(() => closeModal());
  rel.igual(atalhoModal, null, 'atalho A–D não responde com o mapa de questões aberto');

  await p.keyboard.press('Meta+c');
  await p.keyboard.press('Control+c');
  await p.keyboard.press('Meta+d');
  const atalhoModificador = await p.evaluate(() => curItem().resp);
  rel.igual(atalhoModificador, null, 'Cmd/Ctrl + letra não marca alternativa (Cmd+C não responde C)');

  await p.evaluate(() => go('home'));
  await p.waitForSelector('#nInput');
  await p.focus('#nInput');
  await p.keyboard.press('c');
  await p.keyboard.press('d');
  const atalhoInput = await p.evaluate(() => S.items[S.idx].resp);
  rel.igual(atalhoInput, null, 'atalho A–D não responde com o foco num campo de entrada');

  await p.evaluate(() => go('quiz'));
  await p.waitForSelector('#alts .alt');
  await p.keyboard.press('c');
  const atalhoValido = await p.evaluate(() => ({ resp: curItem().resp, ordem: curItem().order }));
  rel.igual(atalhoValido.resp, atalhoValido.ordem[2], 'o atalho C continua respondendo normalmente dentro do quiz');

  /* ========= 7. REGRESSÃO: CRONÔMETRO PARA AO FINALIZAR ============== */
  async function conferirCronometro(rotulo, finalizar) {
    await p.evaluate((base) => {
      closeModal();
      Object.assign(cfg, base, { n: 4, cronometro: true });
      startRun();
    }, CFG_BASE);
    await finalizar();
    await p.waitForTimeout(300);
    const c1 = await p.evaluate(() => ({
      elapsed: S.elapsed, intervaloAtivo: !!S._t, finalizado: !!S.finished,
      tempo: (document.querySelector('.tile.s b') || {}).textContent || ''
    }));
    await p.waitForTimeout(2600);
    const c2 = await p.evaluate(() => {
      go('result');
      return { elapsed: S.elapsed, tempo: (document.querySelector('.tile.s b') || {}).textContent || '' };
    });
    rel.ok(c1.finalizado, `cronômetro (${rotulo}): o simulado ficou marcado como finalizado`, c1);
    rel.ok(!c1.intervaloAtivo, `cronômetro (${rotulo}): o intervalo do cronômetro foi limpo ao finalizar`, c1);
    rel.igual(c2.elapsed, c1.elapsed, `cronômetro (${rotulo}): o tempo não cresce depois de finalizar`);
    rel.igual(c2.tempo, c1.tempo, `cronômetro (${rotulo}): o tempo exibido no resultado permanece igual`);
  }

  await conferirCronometro('tudo respondido', async () => {
    await p.evaluate(() => {
      S.items.forEach(it => { it.resp = qById(it.id).gabarito; });
      finishRun();
    });
  });

  await conferirCronometro('finalização antecipada', async () => {
    await p.evaluate(() => { S.items[0].resp = qById(S.items[0].id).gabarito; finishRun(); });
    await p.waitForSelector('#ov');
    await p.click('#ov button:has-text("Finalizar e corrigir")');
  });

  /* ====================== 8. CAPTURAS DE APOIO ======================= */
  await p.evaluate(() => { closeModal(); store.del('revalida_run'); go('home'); });
  await p.waitForTimeout(200);
  await p.screenshot({ path: captura('func_home_desktop.png'), fullPage: true });

  await p.evaluate((base) => {
    Object.assign(cfg, base, { n: 8, cronometro: true });
    startRun(); render('quiz');
  }, CFG_BASE);
  await p.waitForTimeout(200);
  await p.screenshot({ path: captura('func_quiz_desktop.png'), fullPage: true });

  await p.evaluate(() => {
    S.items.forEach((it, i) => {
      const q = qById(it.id);
      it.resp = i % 3 === 0 ? q.gabarito : ['A', 'B', 'C', 'D'].find(L => L !== q.gabarito);
    });
    finishRun();
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: captura('func_resultado_desktop.png'), fullPage: true });
  await p.evaluate(() => go('review', 'todas'));
  await p.waitForTimeout(200);
  await p.screenshot({ path: captura('func_revisao_desktop.png'), fullPage: true });

  const pm = await novaPagina(ctx, rel, 'mobile', { width: 390, height: 844 });
  await pm.evaluate(() => { if (document.documentElement.getAttribute('data-theme') !== 'dark') toggleTheme(); });
  await pm.waitForTimeout(300);
  await pm.screenshot({ path: captura('func_home_mobile_escuro.png'), fullPage: true });
  const escuroMobile = await pm.evaluate(() => document.documentElement.getAttribute('data-theme'));
  rel.igual(escuroMobile, 'dark', 'tema escuro aplicado na viewport móvel');
} catch (e) {
  rel.falha('exceção não tratada durante o teste', (e && e.stack) || String(e));
} finally {
  await navegador.close();
}

rel.encerrar();
