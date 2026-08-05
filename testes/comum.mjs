/**
 * Utilitários compartilhados pelas suítes de teste.
 *
 * - resolve o caminho do aplicativo a partir de import.meta.url (funciona a
 *   partir de qualquer diretório de trabalho);
 * - abre o Chromium do próprio Playwright (sem caminho fixo de navegador);
 * - grava as capturas de tela fora do repositório (diretório temporário),
 *   ou em EVIDENTIA_CAPTURAS se a variável de ambiente estiver definida;
 * - oferece um relatório mínimo de asserções que devolve código de saída
 *   diferente de zero quando algo falha (necessário para integração contínua).
 */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(AQUI, '..');
/* A edição distribuída pede licença antes de mostrar qualquer questão, então os testes de
   interface correm contra a build de teste: o banco inteiro, sem a porta de ativação.
   Ela sai de `08_montar_aplicativo.py --edicao teste` e não é distribuída. */
export const CAMINHO_APP = path.join(
  RAIZ, 'aplicativo',
  process.env.REVALIDA_APP_TESTE || 'Revalida_Evidentia_teste.html',
);

export function urlDoApp() {
  if (!fs.existsSync(CAMINHO_APP)) {
    throw new Error(
      'Aplicativo não encontrado em ' + CAMINHO_APP +
      '\nGere-o com: python3 scripts/08_montar_aplicativo.py --edicao teste'
    );
  }
  return pathToFileURL(CAMINHO_APP).href;
}

let _dirCapturas = null;
export function dirCapturas() {
  if (_dirCapturas) return _dirCapturas;
  _dirCapturas = process.env.EVIDENTIA_CAPTURAS
    ? path.resolve(process.env.EVIDENTIA_CAPTURAS)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'evidentia-capturas-'));
  fs.mkdirSync(_dirCapturas, { recursive: true });
  return _dirCapturas;
}
export function captura(nome) { return path.join(dirCapturas(), nome); }

/** Espera o fim da animação de entrada da tela: sem isto as capturas saem
 *  meio transparentes, porque .fade ainda está a correr. */
export async function assentar(pagina, ms = 60) {
  await pagina.waitForFunction(() => {
    const el = document.querySelector('#screen');
    if (!el) return true;
    return getComputedStyle(el).opacity === '1' && el.getAnimations().every((a) => a.playState !== 'running');
  }, { timeout: 4000 }).catch(() => {});
  if (ms) await pagina.waitForTimeout(ms);
}

/* Erros de console previsíveis e inofensivos no protocolo file:// */
const RUIDO = [/favicon/i, /net::ERR_FILE_NOT_FOUND.*favicon/i];
const ehRuido = (t) => RUIDO.some((r) => r.test(t));

export function criarRelatorio(nome) {
  const passou = [];
  const falhou = [];
  const infos = [];
  const problemasDePagina = [];

  const fmt = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

  const r = {
    nome,
    ok(cond, msg, detalhe) {
      if (cond) passou.push(msg);
      else falhou.push(msg + (detalhe === undefined ? '' : '\n      → ' + fmt(detalhe)));
      return !!cond;
    },
    igual(obtido, esperado, msg) {
      const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
      return r.ok(a === b, msg, a === b ? undefined : `obtido ${a}, esperado ${b}`);
    },
    falha(msg, detalhe) { return r.ok(false, msg, detalhe); },
    info(msg) { infos.push(msg); },
    /** Liga os ouvintes de erro de página/console a uma page do Playwright. */
    vigiar(pagina, rotulo = '') {
      const pre = rotulo ? rotulo + ': ' : '';
      pagina.on('pageerror', (e) => problemasDePagina.push(pre + 'PAGEERROR ' + e.message));
      pagina.on('console', (m) => {
        if (m.type() === 'error' && !ehRuido(m.text())) {
          problemasDePagina.push(pre + 'CONSOLE ' + m.text());
        }
      });
      return pagina;
    },
    problemas() { return problemasDePagina.slice(); },
    /** Limpa os problemas registados (útil quando um erro é esperado). */
    limparProblemas() { problemasDePagina.length = 0; },
    encerrar() {
      r.ok(problemasDePagina.length === 0, 'nenhum erro de JavaScript na página',
        problemasDePagina.length ? problemasDePagina.join('\n      → ') : undefined);
      console.log('\n=== ' + nome + ' ===');
      for (const i of infos) console.log('  · ' + i);
      for (const p of passou) console.log('  ok   ' + p);
      for (const f of falhou) console.log('  FALHA ' + f);
      console.log(`  ${passou.length} ok · ${falhou.length} falha(s) · capturas em ${dirCapturas()}`);
      if (falhou.length) {
        console.error(`\n${nome}: ${falhou.length} verificação(ões) falharam.`);
        process.exitCode = 1;
      }
      return falhou.length === 0;
    }
  };
  return r;
}

/** Abre o navegador e carrega o aplicativo numa página já vigiada. */
export async function abrirApp(relatorio, { viewport = { width: 1200, height: 900 }, rotulo = '' } = {}) {
  const navegador = await chromium.launch({ headless: true });
  const ctx = await navegador.newContext({ viewport });
  const pagina = await novaPagina(ctx, relatorio, rotulo);
  return { navegador, ctx, pagina };
}

/** Cria uma página adicional no mesmo contexto e carrega o aplicativo. */
export async function novaPagina(ctx, relatorio, rotulo = '', viewport = null) {
  const pagina = await ctx.newPage();
  relatorio.vigiar(pagina, rotulo);
  if (viewport) await pagina.setViewportSize(viewport);
  await pagina.goto(urlDoApp(), { waitUntil: 'load' });
  await pagina.waitForFunction(() => typeof QUESTOES !== 'undefined' && QUESTOES.length > 0 && !!document.querySelector('#screen .hero'));
  return pagina;
}

/** Captura as caixas de diálogo nativas (alert/confirm) sem bloquear a página. */
export function capturarDialogos(pagina) {
  const msgs = [];
  pagina.on('dialog', async (d) => { msgs.push(d.message()); try { await d.dismiss(); } catch (e) { /* já fechada */ } });
  return msgs;
}
