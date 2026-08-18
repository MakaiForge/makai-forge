#!/usr/bin/env node
// install-compactflow.cjs
// Sincroniza o CompactFlow standalone → app/_resources/compact-flow/
// (a cópia embutida que a janela interna do Makai Forge usa).
// Uso: node scripts/install-compactflow.cjs
// Ou via start-makaiforge.sh → opção 3
//
// A fonte é a pasta standalone do CompactFlow. Defina COMPACTFLOW_SRC
// para apontar para outra localização.

const fs = require("fs");
const path = require("path");
const os = require("os");

const APP_DIR = path.resolve(__dirname, "..");
const DEST = path.join(APP_DIR, "app", "_resources", "compact-flow");

const RESET = "\x1b[0m";
const VERDE = "\x1b[32m";
const CIANO = "\x1b[36m";
const AMARELO = "\x1b[33m";

function log(tag, msg) {
  console.log(`  ${tag} ${msg}`);
}

function findSource() {
  if (process.env.COMPACTFLOW_SRC && fs.existsSync(process.env.COMPACTFLOW_SRC)) {
    return process.env.COMPACTFLOW_SRC;
  }
  const candidates = [
    "/mnt/926f111f-fdf6-4067-ac31-32f732441bac/MAKAI/compact-flow",
    path.join(os.homedir(), "MAKAI", "compact-flow"),
    path.join(os.homedir(), "Documentos", "CompactFlow"),
    path.join(os.homedir(), "Documents", "CompactFlow"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.existsSync(path.join(c, "renderer", "index.html"))) return c;
  }
  return null;
}

const COMPACTFLOW_SRC = findSource();

console.log(`\n${CIANO}════════════════════════════════════════════${RESET}`);
console.log(`${CIANO}  Instalação do CompactFlow${RESET}`);
console.log(`${CIANO}  Origem:  ${COMPACTFLOW_SRC || "não encontrada"}${RESET}`);
console.log(`${CIANO}  Destino: ${DEST}${RESET}`);
console.log(`${CIANO}════════════════════════════════════════════${RESET}\n`);

if (!COMPACTFLOW_SRC) {
  console.error(`\n  ${AMARELO}CompactFlow não encontrado.${RESET}`);
  console.error(`  Defina COMPACTFLOW_SRC apontando para a pasta do app standalone.\n`);
  process.exit(1);
}

// Sincroniza tudo (incluindo main/index.js, scripts, run.sh), preservando
// apenas o package.json como CommonJS (obrigatório dentro do Makai Forge).
fs.mkdirSync(DEST, { recursive: true });

let copied = 0;
function syncDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === ".compactflow-installed") continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      syncDir(srcPath, destPath);
    } else {
      fs.cpSync(srcPath, destPath, { force: true });
      copied++;
    }
  }
}

syncDir(COMPACTFLOW_SRC, DEST);

// package.json: preserva o original (com build config, electron-builder, scripts)
// mas força "type": "commonjs" porque o Makai Forge usa "type": "module"
const srcPkg = JSON.parse(fs.readFileSync(path.join(COMPACTFLOW_SRC, "package.json"), "utf-8"));
srcPkg.type = "commonjs";
fs.writeFileSync(path.join(DEST, "package.json"), JSON.stringify(srcPkg, null, 2) + "\n");
log(VERDE + "✓", `package.json (preservado, type: commonjs, ${Object.keys(srcPkg).length} campos)`);

// Flag
fs.writeFileSync(
  path.join(DEST, ".compactflow-installed"),
  `Installed at ${new Date().toISOString()}\nSource: ${COMPACTFLOW_SRC}\n`
);

console.log(`\n${VERDE}✅ CompactFlow sincronizado (${copied} arquivos) em app/_resources/compact-flow/${RESET}`);
console.log(`  A janela interna do Makai Forge usa esta cópia.`);
console.log(`  O app standalone continua em: ${COMPACTFLOW_SRC}\n`);
