#!/usr/bin/env node
// install-compactflow.cjs
// Copia o CompactFlow original para app/_resources/compact-flow/
// Uso: node scripts/install-compactflow.cjs
// Ou via start-makaiforge.sh → opção 3

const fs = require("fs");
const path = require("path");

const APP_DIR = path.resolve(__dirname, "..");
const COMPACTFLOW_SRC = "/home/cas/Documentos/CompactFlow";
const DEST = path.join(APP_DIR, "app", "_resources", "compact-flow");

const RESET = "\x1b[0m";
const VERDE = "\x1b[32m";
const CIANO = "\x1b[36m";
const AMARELO = "\x1b[33m";

function log(tag, msg) {
  console.log(`  ${tag} ${msg}`);
}

function copyDir(src, dest, filterFn) {
  if (!fs.existsSync(src)) {
    log(AMARELO + "⚠", `Diretório não encontrado: ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });

  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (filterFn && !filterFn(entry.name, srcPath)) continue;

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, filterFn);
      count++;
    } else {
      fs.cpSync(srcPath, destPath, { force: true, recursive: true });
      count++;
    }
  }
  log(VERDE + "✓", `${path.relative(COMPACTFLOW_SRC, src)} → ${path.relative(APP_DIR, dest)} (${count} items)`);
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    log(AMARELO + "⚠", `Arquivo não encontrado: ${src}`);
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { force: true });
  log(VERDE + "✓", `${path.basename(src)} → ${path.relative(APP_DIR, dest)}`);
  return true;
}

console.log(`\n${CIANO}════════════════════════════════════════════${RESET}`);
console.log(`${CIANO}  Instalação do CompactFlow${RESET}`);
console.log(`${CIANO}  Origem: ${COMPACTFLOW_SRC}${RESET}`);
console.log(`${CIANO}  Destino: ${DEST}${RESET}`);
console.log(`${CIANO}════════════════════════════════════════════${RESET}\n`);

// Verificar se CompactFlow existe
if (!fs.existsSync(COMPACTFLOW_SRC)) {
  console.error(`\n  ${AMARELO}CompactFlow não encontrado em: ${COMPACTFLOW_SRC}${RESET}`);
  console.error(`  Ajuste o caminho em scripts/install-compactflow.cjs se necessário.\n`);
  process.exit(1);
}

// --- Bridge ---
copyDir(
  path.join(COMPACTFLOW_SRC, "bridge"),
  path.join(DEST, "bridge")
);

// --- Core ---
copyDir(
  path.join(COMPACTFLOW_SRC, "core"),
  path.join(DEST, "core")
);

// --- Data ---
copyDir(
  path.join(COMPACTFLOW_SRC, "data"),
  path.join(DEST, "data")
);

// --- Renderer ---
copyDir(
  path.join(COMPACTFLOW_SRC, "renderer"),
  path.join(DEST, "renderer")
);

// --- Scripts (pula: versões customizadas já estão no Makai Forger) ---
log(CIANO + "◆", "scripts/ preservado (customizado para Makai Forger)");

// --- Assets ---
copyDir(
  path.join(COMPACTFLOW_SRC, "assets"),
  path.join(DEST, "assets")
);

// --- Main (IPC handlers + utilitários) ---
// Pula: index.js, state.js, window.js (substituídos pelo TypeScript)
copyDir(
  path.join(COMPACTFLOW_SRC, "main"),
  path.join(DEST, "main"),
  (name) => !["index.js", "state.js", "window.js"].includes(name)
);

// --- Preload ---
copyFile(
  path.join(COMPACTFLOW_SRC, "preload.js"),
  path.join(DEST, "main", "preload.js")
);

// --- data.js (config paths) — vai pra raiz do compact-flow
copyFile(
  path.join(COMPACTFLOW_SRC, "data.js"),
  path.join(DEST, "data.js")
);

// --- extract_icon.py ---
copyFile(
  path.join(COMPACTFLOW_SRC, "extract_icon.py"),
  path.join(DEST, "main", "extract_icon.py")
);

// --- package.json (força CommonJS, pois o Makai Forger usa "type": "module") ---
fs.writeFileSync(path.join(DEST, "package.json"), '{"type": "commonjs"}\n');
log(VERDE + "✓", "package.json (type: commonjs)");

// --- Flag ---
fs.writeFileSync(path.join(DEST, ".compactflow-installed"), 
  `Installed at ${new Date().toISOString()}\nSource: ${COMPACTFLOW_SRC}\n`
);

console.log(`\n${VERDE}✅ CompactFlow instalado em app/_resources/compact-flow/${RESET}`);
console.log(`  Use start-makaiforge.sh → opção 1 para testar.\n`);
