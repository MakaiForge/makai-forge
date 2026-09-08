#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PRELOAD_SRC = path.join(ROOT, "src/preload/index.ts");
const RENDERER_SRC = path.join(ROOT, "src/renderer/src");
const BACKUP = process.env.PROTONFORGE_BACKUP || "";

const RESET = "\x1b[0m";
const VERMELHO = "\x1b[31m";
const VERDE = "\x1b[32m";
const AMARELO = "\x1b[33m";
const CIANO = "\x1b[36m";

function log(tag, msg) {
  console.log(`  ${tag} ${msg}`);
}

function parsePreload(file) {
  const content = fs.readFileSync(file, "utf-8");
  const result = {
    ipcInvoke: new Set(),   // ipcMain.handle channels
    ipcOn: new Set(),       // webContents.send channels
    exposed: new Set(),     // contextBridge property names
    mapping: {},            // renderer name → preload info
  };

  const invokePattern = /ipcRenderer\.invoke\(\s*["']([^"']+)["']\s*[,\)]/g;
  let match;
  while ((match = invokePattern.exec(content)) !== null) {
    result.ipcInvoke.add(match[1]);
  }

  const onPattern = /ipcRenderer\.on\(\s*["']([^"']+)["']/g;
  while ((match = onPattern.exec(content)) !== null) {
    result.ipcOn.add(match[1]);
  }

  const bridgeBlock = content.match(/exposeInMainWorld\s*\(\s*"[^"]+"\s*,\s*\{([\s\S]*)\}\s*\)/s);
  if (bridgeBlock) {
    let bridgeContent = bridgeBlock[1];
    // Remove nested objects (like store: { ... }, forgerApi: { ... })
    bridgeContent = bridgeContent.replace(/store\s*:\s*\{[^}]*\}/g, "");
    bridgeContent = bridgeContent.replace(/forgerApi\s*:\s*\{[^}]*\}/g, "");

    const propPattern = /^\s*(\w+)\s*:/gm;
    let pm;
    const foundProps = [];
    while ((pm = propPattern.exec(bridgeContent)) !== null) {
      foundProps.push(pm[1]);
      result.exposed.add(pm[1]);
    }

    for (const prop of foundProps) {
      const fnPattern = new RegExp(`^\\s*${prop}\\s*:\\s*([^,]+)`, "m");
      const fnMatch = bridgeContent.match(fnPattern);
      if (fnMatch) {
        const body = fnMatch[1].trim();
        if (body.startsWith("(") || body.startsWith("async")) {
          const invokeUsed = body.match(/["']([^"']+)["']/);
          if (invokeUsed) {
            result.mapping[prop] = { type: "invoke", channel: invokeUsed[1] };
          } else {
            result.mapping[prop] = { type: "wrapper" };
          }
        }
      }
    }
  }

  return result;
}

function parseRendererApis(dir) {
  const apis = {};
  const funcPattern = /window\.electron\.(\w+)\s*\(/g;
  const nsPattern = /window\.electron\.(\w+)\.(\w+)\s*\(/g;
  const onPattern = /window\.electron\.(on\w+)\s*\(/g;

  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") walk(full);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        const content = fs.readFileSync(full, "utf-8");

        let m;
        while ((m = nsPattern.exec(content)) !== null) {
          if (m[1] !== "electron") {
            const key = `${m[1]}.${m[2]}`;
            apis[key] = (apis[key] || 0) + 1;
          }
        }
        while ((m = funcPattern.exec(content)) !== null) {
          if (m[1] !== "electron") {
            apis[m[1]] = (apis[m[1]] || 0) + 1;
          }
        }
      }
    }
  }
  walk(dir);
  return apis;
}

function check() {
  console.log(`\n${CIANO}════════════════════════════════════════════${RESET}`);
  console.log(`${CIANO}  ANALISANDO CONSISTÊNCIA DAS CAMADAS${RESET}`);
  console.log(`${CIANO}════════════════════════════════════════════${RESET}\n`);

  const preload = parsePreload(PRELOAD_SRC);
  const rendererApis = parseRendererApis(RENDERER_SRC);

  log(CIANO + "◆", `Renderer usa ${Object.keys(rendererApis).length} APIs diferentes`);
  log(CIANO + "◆", `Preload expõe ${preload.exposed.size} propriedades + ${preload.ipcInvoke.size} IPC channels\n`);

  const ok = [];
  const missing = [];
  const eventMissing = [];

  for (const [apiName, count] of Object.entries(rendererApis)) {
    if (apiName.startsWith("on")) {
      const camelToKebab = apiName.replace(/on([A-Z])/g, (_, c) => `on-${c.toLowerCase()}`)
        .replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
      const variants = [apiName, camelToKebab, `event:${camelToKebab}`];

      if (preload.exposed.has(apiName)) {
        ok.push([apiName, count, `contextBridge.${apiName}`]);
      } else if ([...preload.ipcOn].some(c => c === camelToKebab)) {
        ok.push([apiName, count, `ipcRenderer.on("${camelToKebab}")`]);
      } else if (preload.mapping[apiName]) {
        ok.push([apiName, count, `contextBridge (wrapper)`]);
      } else {
        eventMissing.push([apiName, count]);
      }
    } else if (apiName.startsWith("forgerApi") || apiName.startsWith("store")) {
      if (preload.exposed.has(apiName.split(".")[0])) {
        ok.push([apiName, count, `namespace ${apiName.split(".")[0]}`]);
      } else {
        missing.push([apiName, count]);
      }
    } else {
      if (preload.exposed.has(apiName) || preload.mapping[apiName]) {
        ok.push([apiName, count, `contextBridge.${apiName}`]);
      } else {
        const flatVariants = [
          `store${apiName.charAt(0).toUpperCase() + apiName.slice(1)}`,
        ];
        if (preload.exposed.has(flatVariants[0])) {
          ok.push([apiName, count, `contextBridge.${flatVariants[0]}`]);
        } else {
          missing.push([apiName, count]);
        }
      }
    }
  }

  if (ok.length > 0) {
    log(VERDE + "✓", `${ok.length} APIs conferidas:`);
    for (const [name, count, where] of ok.slice(0, 10)) {
      log("", `  ${name} ${VERDE}✓${RESET} (${where}) — usado ${count}x`);
    }
    if (ok.length > 10) log("", `  ... mais ${ok.length - 10} OK`);
  }

  if (missing.length > 0) {
    console.log(`\n${VERMELHO}✗ FUNÇÕES AUSENTES NO PRELOAD:${RESET}`);
    for (const [name, count] of missing) {
      log(VERMELHO + "✗", `${name} — usado ${count}x na Renderer mas não exposto no Preload`);
    }
  }

  if (eventMissing.length > 0) {
    console.log(`\n${AMARELO}⚠ EVENTOS (onXxx) NÃO ENCONTRADOS:${RESET}`);
    for (const [name, count] of eventMissing) {
      log(AMARELO + "⚠", `${name} — usado ${count}x, verificar se o canal IPC corresponde`);
    }
  }

  if (missing.length === 0 && eventMissing.length === 0) {
    console.log(`\n${VERDE}✅ TUDO CONSISTENTE!${RESET}`);
  }

  return { missing, eventMissing, ok, preload, rendererApis };
}

function suggestFix(missing, eventMissing, preload, rendererApis) {
  if (missing.length === 0 && eventMissing.length === 0) return;

  console.log(`\n${CIANO}════════════════════════════════════════════${RESET}`);
  console.log(`${CIANO}  CÓDIGO SUGERIDO PARA O PRELOAD${RESET}`);
  console.log(`${CIANO}════════════════════════════════════════════${RESET}\n`);

  const allMissing = [...missing, ...eventMissing];

  // Event listeners (onXxx)
  const events = allMissing.filter(([n]) => n.startsWith("on"));
  if (events.length > 0) {
    console.log(`${AMARELO}  // Event listeners (adicionar no contextBridge):${RESET}`);
    for (const [name] of events) {
      const channelName = name.replace(/on([A-Z])/g, (_, c) => `on-${c.toLowerCase()}`)
        .replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
      console.log(`  ${name}: (callback) => {`);
      console.log(`    const handler = (_event, ...args) => callback(...args);`);
      console.log(`    ipcRenderer.on("${channelName}", handler);`);
      console.log(`    return () => ipcRenderer.removeListener("${channelName}", handler);`);
      console.log(`  },`);
    }
  }

  // Regular functions
  const funcs = allMissing.filter(([n]) => !n.startsWith("on") && !n.includes("."));
  if (funcs.length > 0) {
    console.log(`\n${AMARELO}  // Funções (adicionar no contextBridge):${RESET}`);
    for (const [name] of funcs) {
      console.log(`  ${name}: (...args) => ipcRenderer.invoke("${name}", ...args),`);
    }
  }
}

function build() {
  console.log(`\n${CIANO}════════════════════════════════════════════${RESET}`);
  console.log(`${CIANO}  COMPILANDO${RESET}`);
  console.log(`${CIANO}════════════════════════════════════════════${RESET}\n`);

  try {
    execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
    console.log(`\n${VERDE}✅ BUILD CONCLUÍDO!${RESET}`);
    return true;
  } catch {
    console.error(`\n${VERMELHO}❌ BUILD FALHOU${RESET}`);
    return false;
  }
}

function compareWithBackup() {
  console.log(`\n${CIANO}════════════════════════════════════════════${RESET}`);
  console.log(`${CIANO}  COMPARANDO COM BACKUP (bbb)${RESET}`);
  console.log(`${CIANO}════════════════════════════════════════════${RESET}\n`);

  const bkpPreload = path.join(BACKUP, "src/preload/index.ts");
  if (!fs.existsSync(bkpPreload)) {
    log(VERMELHO + "✗", "Backup não encontrado em " + bkpPreload);
    return;
  }

  const current = parsePreload(PRELOAD_SRC);
  const backup = parsePreload(bkpPreload);

  const onlyInBackup = [...backup.exposed].filter(x => !current.exposed.has(x)).sort();
  const onlyInCurrent = [...current.exposed].filter(x => !backup.exposed.has(x)).sort();

  if (onlyInBackup.length > 0) {
    log(AMARELO + "⚠", `${onlyInBackup.length} funções no backup mas não no atual:`);
    for (const api of onlyInBackup) log("", `  + ${api}`);
  }
  if (onlyInCurrent.length > 0) {
    log(CIANO + "◆", `${onlyInCurrent.length} funções no atual mas não no backup:`);
    for (const api of onlyInCurrent) log("", `  - ${api}`);
  }
  if (onlyInBackup.length === 0 && onlyInCurrent.length === 0) {
    log(VERDE + "✓", "Preloads idênticos");
  }
}

function watch() {
  const chokidar = require("chokidar");
  console.log(`\n${CIANO}  OBSERVANDO ALTERAÇÕES... (Ctrl+C para sair)${RESET}`);
  let debounceTimer;

  const watcher = fs.watch(RENDERER_SRC, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith(".ts") && !filename.endsWith(".tsx")) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`\n${AMARELO}  ⚡ Alteração detectada em ${filename}${RESET}`);
      const result = check();
      if (result.missing.length === 0 && result.eventMissing.length === 0) {
        log(VERDE + "✓", "Tudo OK, pode buildar");
      } else {
        suggestFix(result.missing, result.eventMissing, result.preload, result.rendererApis);
      }
    }, 500);
  });
}

function autoStart() {
  console.log(`${CIANO}
╔══════════════════════════════════════════════════════╗
║           BILD — ProtonForge Build Tool              ║
║   Análise de consistência Main ↔ Preload ↔ Renderer  ║
╚══════════════════════════════════════════════════════╝${RESET}`);

  const result = check();
  const hasIssues = result.missing.length > 0 || result.eventMissing.length > 0;

  if (hasIssues) {
    console.log(`\n${AMARELO}⚠ Foram encontrados problemas de consistência!${RESET}`);
  } else {
    console.log(`\n${VERDE}✅ Nenhum problema encontrado.${RESET}`);
  }
}

// ──────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────

const args = process.argv.slice(2);

const actions = {
  "1": () => { check(); process.exit(0); },
  "2": () => { build(); process.exit(0); },
  "3": () => { const r = check(); if (r.missing.length === 0 && r.eventMissing.length === 0) build(); process.exit(0); },
  "4": () => { compareWithBackup(); process.exit(0); },
  "5": () => {
    const r = check();
    if (r.missing.length > 0 || r.eventMissing.length > 0) {
      suggestFix(r.missing, r.eventMissing, r.preload, r.rendererApis);
    }
    process.exit(0);
  },
  "6": () => { watch(); },
  "7": () => { autoStart(); },
  "check": () => { check(); process.exit(0); },
  "build": () => { build(); process.exit(0); },
  "diff": () => { compareWithBackup(); process.exit(0); },
  "fix": () => {
    const r = check();
    if (r.missing.length > 0 || r.eventMissing.length > 0) {
      suggestFix(r.missing, r.eventMissing, r.preload, r.rendererApis);
    }
    process.exit(0);
  },
};

if (args[0] === "watch") { watch(); process.exit(0); }

if (args[0] && actions[args[0]]) {
  actions[args[0]]();
  process.exit(0);
}

if (args[0] && args[0] !== "menu") {
  console.log(`Uso: node bild.cjs [opção]
  check       Verificar consistência das camadas
  build       Compilar (npm run build)
  all         Verificar + compilar
  diff        Comparar preload com backup
  fix         Sugerir correções para o preload
  watch       Observar alterações em tempo real
  menu        Menu interativo`);
  process.exit(0);
}

// Menu interativo
console.log(`${CIANO}
╔══════════════════════════════════════════════════════╗
║           BILD — ProtonForge Build Tool              ║
╠══════════════════════════════════════════════════════╣
║  1  Verificar consistência das camadas               ║
║  2  Compilar (npm run build)                         ║
║  3  Verificar + compilar (se OK)                     ║
║  4  Comparar preload com o backup (bbb)              ║
║  5  Sugerir correções para o preload                 ║
║  6  Observar alterações (watch)                      ║
║  7  Auto-diagnóstico completo                        ║
║  0  Sair                                             ║
╚══════════════════════════════════════════════════════╝${RESET}`);
process.stdout.write("  Escolha: ");
process.stdin.once("data", (data) => {
  const opt = data.toString().trim();
  if (actions[opt]) actions[opt]();
  process.exit(0);
});
