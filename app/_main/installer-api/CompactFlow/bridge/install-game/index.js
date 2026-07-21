#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { callApi } = require('../api');
const { takeSnapshot, scanPrefixForExes } = require('./snapshot');
const { runInstaller, copyToPrefix, extractInnoSetup, extractNsis } = require('./runner');
const { installDepToPrefix, getDepInfo, BUILTIN_DEPS } = require('../deps-manager');
let installerApi;
const installerDev = path.resolve(__dirname, '../installer');
const installerRes = path.join(os.homedir(), '.config', 'makai-forger', 'resources', 'installer-api');
if (fs.existsSync(path.join(installerDev, 'index.js'))) {
  installerApi = require(installerDev);
} else if (fs.existsSync(path.join(installerRes, 'index.js'))) {
  installerApi = require(installerRes);
} else {
  installerApi = require('../installer');
}
const { analyze, extract } = installerApi;
const logger = require('../logger');

const L = 'install-game';

function extractToTemp(exePath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-extract-'));
  logger.log(L, `Extraindo para temporário: ${tmpDir}`);
  const r = execFileSync('7z', ['x', '-y', '-o' + tmpDir, exePath], { timeout: 30000, stdio: 'pipe' });
  return tmpDir;
}

function classifyDir(tmpDir) {
  const entries = fs.readdirSync(tmpDir);
  if (entries.some(e => /^\[\d+\]$/.test(e))) return { type: 'installer', subtype: 'inno' };
  if (entries.some(e => /^\$?(?:PLUGINSDIR|\d+)$/i.test(e))) return { type: 'installer', subtype: 'nsis' };
  if (entries.some(e => e.toLowerCase() === 'install_script.dat')) return { type: 'installer', subtype: 'installshield' };
  if (findFile(tmpDir, f => f.toLowerCase() === 'uninstall.exe')) return { type: 'installer', subtype: 'generic' };
  if (findFile(tmpDir, f => /vc_redist/i.test(f))) return { type: 'installer', subtype: 'redist' };
  if (countFiles(tmpDir) > 2) return { type: 'installer', subtype: 'unknown' };
  return { type: 'portable', subtype: null };
}

function analyzeDeps(tmpDir, exePath) {
  const needed = ['vcrun'];
  const entries = fs.readdirSync(tmpDir);
  let searchDir = tmpDir;

  if (entries.some(e => /^\[\d+\]$/.test(e))) {
    const innoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-inno-analyze-'));
    try {
      logger.log(L, `InnoSetup detectado, extraindo para analisar deps: ${innoDir}`);
      execFileSync('/usr/bin/innoextract', ['-d', innoDir, '--lowercase', exePath],
        { timeout: 120000, stdio: 'pipe' });
      const appDir = path.join(innoDir, 'app');
      searchDir = fs.existsSync(appDir) ? appDir : innoDir;
    } catch (e) {
      logger.error(L, `Falha no innoextract para análise: ${e.message}`);
      searchDir = tmpDir;
    }
  }

  const files = collectFiles(searchDir);
  logger.log(L, `Analisando ${files.length} arquivos em busca de dependências`);

  for (const f of files) {
    const low = f.toLowerCase();
    if (/d3dcompiler|d3dx\d/.test(low))
      needed.push('d3dx9', 'd3dx11_43');
    if (/x3daudio|xactengine|xaudio2/.test(low))
      needed.push('xact');
    if (/binkw32/.test(low))
      needed.push('binkw32');
    if (/mscorlib|microsoft\.net/i.test(f))
      needed.push('dotnet48');
    if (/physx/.test(low))
      needed.push('physx');
    if (/webview2|msedgewebview/.test(low))
      needed.push('webview2');
    if (/microsoft\.xna\.framework/i.test(f))
      needed.push('xna40');
  }

  if (searchDir !== tmpDir) {
    try { fs.rmSync(path.dirname(searchDir), { recursive: true, force: true }); } catch {}
  }

  return [...new Set(needed)];
}

function countFiles(dir) {
  let n = 0;
  try {
    for (const e of fs.readdirSync(dir)) {
      try { n += fs.statSync(path.join(dir, e)).isDirectory() ? countFiles(path.join(dir, e)) : 1; } catch {}
    }
  } catch {}
  return n;
}

function findFile(dir, predicate) {
  try {
    for (const e of fs.readdirSync(dir)) {
      const p = path.join(dir, e);
      try {
        if (fs.statSync(p).isDirectory()) { const f = findFile(p, predicate); if (f) return f; }
        else if (predicate(e)) return p;
      } catch {}
    }
  } catch {}
  return null;
}

function collectFiles(dir, base = '') {
  let result = [];
  try {
    for (const e of fs.readdirSync(dir)) {
      const p = path.join(dir, e);
      const rel = base ? base + '/' + e : e;
      try {
        if (fs.statSync(p).isDirectory()) result = result.concat(collectFiles(p, rel));
        else result.push(rel);
      } catch {}
    }
  } catch {}
  return result;
}

function depsOnly(args) {
  const { exe: exePath, prefix, protonPath } = args;
  if (!exePath || !prefix || !protonPath) {
    logger.error(L, '--deps-only requer --exe <path> --prefix <path> --proton-path <path>');
    process.exit(1);
  }

  logger.log(L, `=== DEPS-ONLY ===`);
  logger.log(L, `EXE: ${exePath}`);
  logger.log(L, `Prefixo: ${prefix}`);
  logger.log(L, `Proton: ${protonPath}`);

  const result = { depsDetected: [], depsInstalled: [], classification: null, installSubtype: null, steps: [] };
  let tmpDir = null;

  try {
    logger.log(L, 'Extraindo e classificando...');
    tmpDir = extractToTemp(exePath);
    const { type: classification, subtype } = classifyDir(tmpDir);
    result.classification = classification;
    result.installSubtype = subtype;
    result.steps.push({ step: 'classify', type: classification, subtype });
    logger.log(L, `Classificação: ${classification} (${subtype || 'n/a'})`);

    logger.log(L, 'Analisando dependências...');
    const neededDeps = analyzeDeps(tmpDir, exePath);
    result.depsDetected = neededDeps;
    logger.log(L, `Dependências detectadas: ${neededDeps.join(', ')}`);
    result.steps.push({ step: 'analyze_deps', detected: neededDeps });

    logger.log(L, 'Instalando dependências no prefixo...');
    for (const depId of neededDeps) {
      try {
        logger.log(L, `Instalando: ${depId}...`);
        const depResult = installDepToPrefix(depId, prefix, protonPath);
        result.depsInstalled.push({ id: depId, ...depResult });
        logger.log(L, `Instalado: ${depId}`);
      } catch (e) {
        logger.error(L, `Falha ao instalar ${depId}: ${e.message}`);
        result.depsInstalled.push({ id: depId, error: e.message });
      }
    }
    result.steps.push({ step: 'install_deps', count: result.depsInstalled.length });
    result.success = true;
  } catch (e) {
    result.error = e.message;
    logger.error(L, `ERRO: ${e.message}`);
  } finally {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
    logger.log(L, '=== FIM DEPS-ONLY ===');
    logger.close();
  }

  console.log(JSON.stringify(result));
}

function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const val = process.argv[++i];
    args[key] = val;
  }

  if (args.depsOnly)
    return depsOnly(args);

  const { gameId, gameTitle, exe: exePath, protonPath } = args;
  if (!gameId || !exePath || !protonPath) {
    logger.error(L, 'Argumentos insuficientes. Uso: --game-id <id> --game-title <title> --exe <path> --proton-path <path>');
    process.exit(1);
  }

  logger.log(L, `=== INÍCIO DA INSTALAÇÃO ===`);
  logger.log(L, `Jogo: ${gameTitle} (${gameId})`);
  logger.log(L, `EXE: ${exePath}`);
  logger.log(L, `Proton: ${protonPath}`);

  const result = {
    gameId, gameTitle, exePath, protonPath,
    gameInfo: null, prefixPath: null, dllsInstalled: [],
    depsInstalled: [], depsDetected: [],
    steps: [], candidates: [], success: false,
  };

  try {
    logger.log(L, 'Step 1: Buscando informações do jogo...');
    try {
      result.gameInfo = callApi('get_game_info', { game_id: gameId });
      result.steps.push({ step: 'get_game_info', found: !!result.gameInfo });
      logger.log(L, `Game info: ${result.gameInfo ? 'encontrado' : 'não encontrado'}`);
    } catch (e) {
      logger.error(L, `Game info indisponível: ${e.message}`);
      result.steps.push({ step: 'get_game_info', error: e.message });
    }

    logger.log(L, 'Step 2: Criando prefixo Wine/Proton...');
    const prefixName = (gameTitle || gameId)
      .trim()
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
    const prefixBase = path.join(os.homedir(), 'Games', 'MakaiForger', prefixName);
    const pfxPath = path.join(prefixBase, 'pfx');
    const prefixResult = callApi('create_prefix', {
      game_id: gameId, proton_path: protonPath, auto_dlls: true, prefix_path: pfxPath,
    });
    result.prefixPath = prefixResult.prefix_path;
    result.steps.push({ step: 'create_prefix', ...prefixResult });
    logger.log(L, `Prefixo: ${prefixResult.prefix_path}`);

    if (!prefixResult.success && !prefixResult.initialized) {
      if (prefixResult.errors && prefixResult.errors.length && !prefixResult.errors[0].includes('not found')) {
        throw new Error('Falha na criação do prefixo: ' + prefixResult.errors.join('; '));
      }
    }

    logger.log(L, 'Step 3: Instalando DLLs padrão...');
    try {
      const dllResult = callApi('install_game_dlls', {
        game_id: gameId, prefix_path: result.prefixPath, proton_path: protonPath,
      });
      result.dllsInstalled = dllResult.installed || [];
      result.steps.push({ step: 'install_dlls', installed: result.dllsInstalled.length, errors: dllResult.errors || [] });
      logger.log(L, `DLLs instaladas: ${result.dllsInstalled.length}`);
      if (dllResult.errors?.length) logger.error(L, `Erros DLL: ${dllResult.errors.join('; ')}`);
    } catch (e) {
      logger.error(L, `Instalação de DLLs pulada: ${e.message}`);
      result.steps.push({ step: 'install_dlls', error: e.message });
    }

    logger.log(L, 'Step 4: Instalando todas as dependências padrão...');
    const allDeps = BUILTIN_DEPS.map(d => d.id);
    result.depsDetected = allDeps;
    for (const depId of allDeps) {
      try {
        logger.log(L, `Instalando dependência: ${depId}...`);
        const depResult = installDepToPrefix(depId, result.prefixPath, protonPath);
        result.depsInstalled.push({ id: depId, ...depResult });
        logger.log(L, `Dependência instalada: ${depId}`);
      } catch (e) {
        logger.error(L, `Falha ao instalar ${depId}: ${e.message}`);
        result.depsInstalled.push({ id: depId, error: e.message });
      }
    }
    result.steps.push({ step: 'install_deps', count: result.depsInstalled.length });

    logger.log(L, 'Step 5: Analisando instalador e extraindo...');
    let installResult = { exitCode: 0, signal: null, error: null };
    try {
      const installInfo = analyze(exePath);
      logger.log(L, `  Tipo: ${installInfo.type} (${installInfo.method}, confiança: ${installInfo.confidence})`);
      logger.log(L, `  Wine: ${installInfo.needsWine ? 'sim' : 'não'}, Registry: ${installInfo.needsRegistrySetup ? 'sim' : 'não'}`);
      result.steps.push({ step: 'classify', type: installInfo.type, method: installInfo.method });

      const driveC = [path.join(result.prefixPath, 'drive_c'), path.join(result.prefixPath, 'pfx', 'drive_c')]
        .find(p => fs.existsSync(p));
      const destPath = driveC ? path.join(driveC, 'games', gameId) : path.join(result.prefixPath, 'drive_c', 'games', gameId);

      const extractResult = extract(installInfo, {
        destPath,
        protonPath,
        source: 'compactflow',
        gameId,
        onProgress: (msg) => { logger.log(L, `  [extract] ${msg}`); },
      });

      if (extractResult.success) {
        installResult.exitCode = 0;
        result.steps.push({ step: 'native_extract', success: true, type: installInfo.type });
        logger.log(L, `Extração concluída: ${extractResult.destDir}`);
        logger.log(L, `Candidatos: ${extractResult.candidates.length}`);
      } else {
        logger.error(L, `Extração nativa falhou: ${extractResult.error}. Usando fallback Wine...`);
        result.steps.push({ step: 'native_extract', success: false, error: extractResult.error });
        logger.log(L, 'Step 5b (fallback): Executando instalador via Wine/Proton...');
        const winResult = runInstaller(exePath, result.prefixPath, protonPath, gameId);
        installResult = winResult;
        result.steps.push({ step: 'run_installer_fallback', ...winResult });
        logger.log(L, `Instalador (fallback) finalizado. Exit code: ${winResult.exitCode}`);
      }
    } catch (e) {
      logger.error(L, `Classificação/extração falhou: ${e.message}. Usando fallback Wine...`);
      result.steps.push({ step: 'classify_error', error: e.message });
      logger.log(L, 'Step 5b (fallback): Executando instalador via Wine/Proton...');
      const winResult = runInstaller(exePath, result.prefixPath, protonPath, gameId);
      installResult = winResult;
      result.steps.push({ step: 'run_installer_fallback', ...winResult });
      logger.log(L, `Instalador (fallback) finalizado. Exit code: ${winResult.exitCode}`);
    }

    logger.log(L, 'Step 6: Escaneando prefixo em busca de executáveis...');
    const { candidates, suggestedDirs } = scanPrefixForExes(result.prefixPath);
    result.candidates = candidates;
    result.suggestedDirs = suggestedDirs;
    result.steps.push({ step: 'scan_prefix', found: candidates.length, dirs: suggestedDirs.length });
    logger.log(L, `Candidatos encontrados: ${candidates.length}`);

    result.driveCPath = result.prefixPath;

    result.success = true;
    logger.log(L, '=== INSTALAÇÃO CONCLUÍDA COM SUCESSO ===');
  } catch (e) {
    result.error = e.message;
    logger.error(L, `ERRO FATAL: ${e.message}`);
    logger.error(L, e.stack || '');
  } finally {
    logger.log(L, '=== FIM ===');
    logger.close();
  }

  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main();
}

module.exports = {
  callApi, takeSnapshot, scanPrefixForExes,
  runInstaller, copyToPrefix, extractInnoSetup, extractNsis,
  installDepToPrefix, BUILTIN_DEPS, main,
};
