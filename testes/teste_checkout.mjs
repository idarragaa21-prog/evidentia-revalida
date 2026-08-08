import { chromium } from 'playwright';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkout = pathToFileURL(path.join(raiz, 'app-web', 'assinar', 'index.html')).href;
const termos = pathToFileURL(path.join(raiz, 'app-web', 'assinar', 'termos.html')).href;
const excluirConta = pathToFileURL(path.join(raiz, 'app-web', 'excluir-conta', 'index.html')).href;
const capturas = await mkdtemp(path.join(os.tmpdir(), 'evidentia-checkout-'));
const planos = [
  { id: 'mensal', nome: 'Mensal', descricao: 'Acesso completo por 30 dias', dias: 30, preco_centavos: 5700 },
  { id: 'trimestral', nome: 'Trimestral', descricao: 'Acesso completo por 90 dias', dias: 90, preco_centavos: 14700 },
  { id: 'semestral', nome: 'Semestral', descricao: 'Acesso completo por 180 dias', dias: 180, preco_centavos: 24700 },
];

let aprovados = 0;
let falhas = 0;
function checar(condicao, descricao) {
  if (condicao) {
    aprovados += 1;
    console.log(`  ok   ${descricao}`);
  } else {
    falhas += 1;
    console.log(`  FALHA ${descricao}`);
  }
}

function componentes(cor) {
  const partes = String(cor).match(/[\d.]+/g)?.slice(0, 3).map(Number);
  return partes?.length === 3 ? partes : null;
}
function luminancia(cor) {
  const rgb = componentes(cor);
  if (!rgb) return null;
  const canais = rgb.map(valor => {
    const c = valor / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}
function contraste(frente, fundo) {
  const a = luminancia(frente);
  const b = luminancia(fundo);
  if (a == null || b == null) return 0;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function prepararPagina(contexto) {
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on('pageerror', erro => erros.push(String(erro)));
  pagina.on('console', mensagem => {
    const texto = mensagem.text();
    const resposta503Esperada = /failed to load resource/i.test(texto) && /503/.test(texto);
    if (mensagem.type() === 'error' && !resposta503Esperada) erros.push(texto);
  });
  await pagina.route('**/rest/v1/planos?**', rota => rota.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(planos),
  }));
  await pagina.route('**/functions/v1/criar-checkout', rota => rota.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ erro: 'pagamentos_nao_ativados' }),
  }));
  return { pagina, erros };
}

console.log('\n=== checkout comercial ===');
const navegador = await chromium.launch({ headless: true });
try {
  const desktop = await navegador.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const { pagina: ampla, erros: errosDesktop } = await prepararPagina(desktop);
  await ampla.goto(checkout, { waitUntil: 'domcontentloaded' });
  await ampla.locator('.plano').first().waitFor();

  await ampla.keyboard.press('Tab');
  checar(await ampla.evaluate(() => document.activeElement?.classList.contains('skip')), 'primeiro Tab oferece atalho para o conteúdo');
  checar(await ampla.locator('.plano').count() === 3, 'os três planos mockados aparecem');
  checar(await ampla.locator('#listaPlanos').getAttribute('aria-busy') === 'false', 'o carregamento comunica quando terminou');
  checar(await ampla.locator('h1').innerText() === 'Estude questões reais. Entenda cada alternativa.', 'a proposta de valor abre a página');
  checar(await ampla.locator('.proof-stat').count() === 4, 'o resumo exibe quatro métricas canônicas');
  checar(await ampla.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'desktop não rola na horizontal');
  checar(await ampla.locator('table caption').count() === 1, 'a tabela possui legenda para leitor de tela');
  await ampla.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
  await ampla.screenshot({ path: path.join(capturas, 'checkout-desktop.png') });

  const botao = ampla.locator('button.comprar').first();
  await botao.click();
  checar(await ampla.locator('#email').getAttribute('aria-invalid') === 'true', 'e-mail inválido é comunicado semanticamente');
  checar(await ampla.evaluate(() => document.activeElement?.id === 'email'), 'erro de e-mail devolve o foco ao campo');
  await ampla.locator('#email').fill('teste@example.com');
  await botao.click();
  await ampla.getByText(/e-mail não foi guardado/i).waitFor();
  checar(await ampla.getByText(/e-mail não foi guardado/i).count() === 1, 'pagamentos inativos informam que o e-mail não foi guardado');

  const tamanhos = await ampla.locator('input, .cta, button.comprar').evaluateAll(elementos =>
    elementos.map(el => ({ tag: el.tagName, altura: el.getBoundingClientRect().height }))
  );
  checar(tamanhos.every(item => item.altura >= 44), 'ações principais têm pelo menos 44 px de altura');
  checar(errosDesktop.length === 0, 'desktop não gera erro de JavaScript');
  await ampla.setViewportSize({ width: 768, height: 1024 });
  checar(await ampla.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'tablet não rola na horizontal');
  await desktop.close();

  const movel = await navegador.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const { pagina: celular, erros: errosMovel } = await prepararPagina(movel);
  await celular.goto(checkout, { waitUntil: 'domcontentloaded' });
  await celular.locator('.plano').first().waitFor();
  const auditoria390 = await celular.evaluate(() => ({
    ok: document.documentElement.scrollWidth <= innerWidth + 1,
    largura: document.documentElement.scrollWidth,
    excedentes: [...document.querySelectorAll('body *')]
      .filter(el => el.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 6)
      .map(el => `${el.tagName.toLowerCase()}.${el.className || ''}`),
  }));
  checar(auditoria390.ok, 'celular não rola na horizontal');
  if (!auditoria390.ok) console.log(`       largura=${auditoria390.largura}; excedentes=${auditoria390.excedentes.join(', ')}`);
  checar(await celular.locator('.plano').count() === 3, 'planos permanecem completos no celular');
  const larguraCta = await celular.locator('.hero-actions .cta').first().evaluate(el => el.getBoundingClientRect().width);
  checar(larguraCta >= 350, 'CTA móvel ocupa a largura útil');
  const cores = await celular.locator('button.comprar').first().evaluate(el => {
    const css = getComputedStyle(el);
    return { frente: css.color, fundo: css.backgroundColor };
  });
  checar(contraste(cores.frente, cores.fundo) >= 4.5, 'botão de compra no tema escuro atinge contraste AA');
  const coresDestaque = await celular.locator('h1 span').evaluate(el => {
    const css = getComputedStyle(el);
    return { frente: css.color, fundo: getComputedStyle(document.body).backgroundColor };
  });
  checar(contraste(coresDestaque.frente, coresDestaque.fundo) >= 4.5, 'destaque do título no tema escuro atinge contraste AA');
  checar(errosMovel.length === 0, 'celular não gera erro de JavaScript');
  await celular.screenshot({ path: path.join(capturas, 'checkout-mobile-dark.png'), fullPage: true });

  await celular.setViewportSize({ width: 320, height: 700 });
  const auditoria320 = await celular.evaluate(() => ({
    ok: document.documentElement.scrollWidth <= innerWidth + 1,
    largura: document.documentElement.scrollWidth,
    excedentes: [...document.querySelectorAll('body *')]
      .filter(el => el.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 6)
      .map(el => `${el.tagName.toLowerCase()}.${el.className || ''}`),
  }));
  checar(auditoria320.ok, 'largura mínima de 320 px não rola na horizontal');
  if (!auditoria320.ok) console.log(`       largura=${auditoria320.largura}; excedentes=${auditoria320.excedentes.join(', ')}`);

  await celular.goto(termos, { waitUntil: 'domcontentloaded' });
  checar(await celular.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'termos não rolam na horizontal no celular');
  checar(await celular.locator('#reembolso').count() === 1, 'termos expõem âncora de reembolso');
  checar(await celular.locator('a[href="mailto:idarragaa21@gmail.com"]').count() >= 1, 'termos mantêm suporte visível');
  await celular.screenshot({ path: path.join(capturas, 'termos-mobile-dark.png'), fullPage: true });

  await celular.goto(excluirConta, { waitUntil: 'domcontentloaded' });
  checar(await celular.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'exclusão de conta não rola na horizontal no celular');
  checar(await celular.locator('a[href^="mailto:"][href*="exclus"]').count() === 1, 'exclusão web oferece uma solicitação direta');
  checar(await celular.getByText(/Conta → Excluir minha conta/).count() === 1, 'exclusão web documenta o caminho dentro do aplicativo');
  checar(await celular.locator('a[href="../privacidade/"]').count() === 1, 'exclusão web liga para a política de privacidade');
  await celular.screenshot({ path: path.join(capturas, 'excluir-conta-mobile-dark.png'), fullPage: true });
  await movel.close();
} finally {
  await navegador.close();
}

console.log(`  ${aprovados} ok · ${falhas} falha(s) · capturas em ${capturas}`);
if (falhas) process.exitCode = 1;
