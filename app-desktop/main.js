// Evidentia · Revalida — processo principal do aplicativo de computador.
//
// O aplicativo inteiro e um arquivo HTML autocontido. O Electron so lhe da uma
// janela, um menu em portugues e a garantia de que links externos abrem no
// navegador do sistema em vez de sequestrarem a janela do estudo.

const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const CONTEUDO = path.join(__dirname, "conteudo", "index.html");
let janela = null;

function criarJanela() {
  janela = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 380,
    minHeight: 520,
    backgroundColor: "#f4f3ec",
    title: "Evidentia · Revalida",
    show: false,
    webPreferences: {
      // O conteudo e proprio, mas nao ha razao para lhe dar acesso ao Node.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
      spellcheck: false,
    },
  });

  janela.once("ready-to-show", () => janela.show());

  if (!fs.existsSync(CONTEUDO)) {
    dialog.showErrorBox(
      "Conteúdo ausente",
      "O arquivo do banco de questões não foi encontrado.\n\n" +
        "Rode `npm run preparar` nesta pasta para copiá-lo a partir de aplicativo/.",
    );
    app.quit();
    return;
  }
  janela.loadFile(CONTEUDO);

  // Qualquer link para fora vai ao navegador do sistema: as referências das
  // justificativas apontam para diretrizes e artigos, e o estudo não pode
  // ser substituído por uma página do Ministério da Saúde dentro da janela.
  const paraFora = (url) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  };
  janela.webContents.setWindowOpenHandler(({ url }) => paraFora(url));
  janela.webContents.on("will-navigate", (evento, url) => {
    if (!url.startsWith("file://")) {
      evento.preventDefault();
      paraFora(url);
    }
  });

  janela.on("closed", () => { janela = null; });
}

function montarMenu() {
  const ehMac = process.platform === "darwin";
  const modelo = [
    ...(ehMac ? [{ role: "appMenu" }] : []),
    {
      label: "Arquivo",
      submenu: [
        { label: "Imprimir caderno de erros", accelerator: "CmdOrCtrl+P",
          click: () => janela?.webContents.print({}) },
        { type: "separator" },
        ehMac ? { role: "close", label: "Fechar" } : { role: "quit", label: "Sair" },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { role: "undo", label: "Desfazer" }, { role: "redo", label: "Refazer" },
        { type: "separator" },
        { role: "cut", label: "Recortar" }, { role: "copy", label: "Copiar" },
        { role: "paste", label: "Colar" }, { role: "selectAll", label: "Selecionar tudo" },
      ],
    },
    {
      label: "Exibir",
      submenu: [
        { role: "reload", label: "Recarregar" },
        { type: "separator" },
        { role: "resetZoom", label: "Tamanho normal" },
        { role: "zoomIn", label: "Aumentar" },
        { role: "zoomOut", label: "Diminuir" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Tela cheia" },
      ],
    },
    {
      label: "Ajuda",
      submenu: [
        { label: "Sobre a Evidentia",
          click: () => shell.openExternal("https://evidentia-co.netlify.app/") },
        { label: "Provas e gabaritos no Inep",
          click: () => shell.openExternal("https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/revalida/provas-e-gabaritos") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(modelo));
}

// Uma instalação, uma janela: abrir de novo traz a que já existe.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });

  app.whenReady().then(() => {
    montarMenu();
    criarJanela();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) criarJanela();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
