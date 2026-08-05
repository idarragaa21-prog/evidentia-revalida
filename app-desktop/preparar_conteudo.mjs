// Copia a edicao montada para dentro do pacote do Electron.
// Uso: node preparar_conteudo.mjs [completo|livre]
import { copyFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = dirname(aqui);
const edicao = process.argv[2] || "completo";
const origem = join(raiz, "aplicativo",
  edicao === "livre" ? "Revalida_Evidentia_livre.html" : "Revalida_Evidentia.html");

if (!existsSync(origem)) {
  console.error(`nao encontrei ${origem}`);
  console.error("rode antes: python3 scripts/08_montar_aplicativo.py");
  process.exit(1);
}
mkdirSync(join(aqui, "conteudo"), { recursive: true });
const destino = join(aqui, "conteudo", "index.html");
copyFileSync(origem, destino);
console.log(`conteudo (${edicao}): ${(statSync(destino).size / 1048576).toFixed(2)} MB`);
