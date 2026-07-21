const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');
const logger = require('../logger');

const L = 'runner';

function runInstaller(exePath, prefixPath, protonPath, gameId) {
  const wineBin = path.join(protonPath, 'files', 'bin', 'wine64');
  const wineFallback = path.join(protonPath, 'files', 'bin', 'wine');
  const wineExe = fs.existsSync(wineBin) ? wineBin : wineFallback;

  const env = { ...process.env };
  env.WINEPREFIX = prefixPath;
  env.WINEDEBUG = '-all';
  env.PROTON_LOG = '1';
  env.PROTON_NO_ESYNC = '1';
  env.PROTON_NO_FSYNC = '1';
  env.PROTON_NO_D3D11 = '1';
  env.PROTON_NO_VKD3D = '1';
  env.PROTON_NO_D3D12 = '1';
  env.PROTON_NO_NVAPI = '1';
  env.PROTON_HEAPTYPES = '0';
  env.PROTON_HIDE_NVIDIA_GPU = '1';
  env.PROTON_USE_WINED3D11 = '1';

  logger.log(L, `Executando instalador via Wine do Proton (modo instalação - Proton puro):`);
  logger.log(L, `  EXE: ${exePath}`);
  logger.log(L, `  WINEPREFIX: ${prefixPath}`);
  logger.log(L, `  Wine: ${wineExe}`);
  logger.log(L, `  Proton: todas otimizações desligadas (equivalente Wine puro)`);

  const result = spawnSync(wineExe, [exePath], {
    env,
    stdio: 'inherit',
    timeout: 3600000,
  });

  logger.exec(L, wineExe, [exePath], result);
  logger.log(L, `Instalador encerrado. Código: ${result.status}, Sinal: ${result.signal}`);

  return { exitCode: result.status, signal: result.signal, error: result.error?.message };
}

function extractInnoSetup(exePath, prefixPath) {
  const driveC = [path.join(prefixPath, 'drive_c'), path.join(prefixPath, 'pfx', 'drive_c')]
    .find(p => fs.existsSync(p));
  if (!driveC) {
    const msg = 'drive_c não encontrado no prefixo';
    logger.error(L, msg);
    throw new Error(msg);
  }

  const gameDir = path.join(driveC, 'games', path.basename(exePath, path.extname(exePath)) || 'game');
  fs.mkdirSync(gameDir, { recursive: true });

  logger.log(L, `Extraindo com innoextract para: ${gameDir}`);
  logger.log(L, `  Comando: /usr/bin/innoextract -d ${gameDir} --lowercase ${exePath}`);

  const result = spawnSync('/usr/bin/innoextract', [
    '-d', gameDir,
    '--lowercase',
    exePath,
  ], { timeout: 300000, stdio: 'pipe' });

  logger.exec(L, '/usr/bin/innoextract', ['-d', gameDir, '--lowercase', exePath], result);

  if (result.status !== 0) {
    logger.error(L, `innoextract falhou. Código: ${result.status}, Erro: ${result.error?.message || 'desconhecido'}`);
    try { fs.rmSync(gameDir, { recursive: true, force: true }); } catch {}
    return { exitCode: result.status, error: result.error?.message || `exit code ${result.status}` };
  }

  const appDir = path.join(gameDir, 'app');
  if (fs.existsSync(appDir)) {
    logger.log(L, `Movendo app/ para ${gameDir}`);
    for (const entry of fs.readdirSync(appDir)) {
      const src = path.join(appDir, entry);
      const dst = path.join(gameDir, entry);
      try {
        fs.renameSync(src, dst);
      } catch {
        fs.cpSync(src, dst, { recursive: true, force: true });
        fs.rmSync(src, { recursive: true, force: true });
      }
    }
    fs.rmSync(appDir, { recursive: true, force: true });
  }

  const tmpDir = path.join(gameDir, 'tmp');
  if (fs.existsSync(tmpDir)) {
    logger.log(L, `Removendo tmp/ do innoextract`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  logger.log(L, `Extraído com sucesso para: ${gameDir}`);
  return { exitCode: 0, destDir: gameDir };
}

function extractNsis(exePath, prefixPath) {
  const driveC = [path.join(prefixPath, 'drive_c'), path.join(prefixPath, 'pfx', 'drive_c')]
    .find(p => fs.existsSync(p));
  if (!driveC) throw new Error('drive_c não encontrado no prefixo');

  const gameDir = path.join(driveC, 'games', path.basename(exePath, path.extname(exePath)) || 'game');
  fs.mkdirSync(gameDir, { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-nsis-extract-'));
  try {
    logger.log(L, `Extraindo NSIS com 7z para: ${tmpDir}`);
    execFileSync('7z', ['x', '-y', '-o' + tmpDir, exePath], { timeout: 30000, stdio: 'pipe' });

    for (const entry of fs.readdirSync(tmpDir)) {
      if (/^\$/.test(entry)) continue;
      const src = path.join(tmpDir, entry);
      const dst = path.join(gameDir, entry);
      try {
        fs.renameSync(src, dst);
      } catch {
        fs.cpSync(src, dst, { recursive: true, force: true });
        fs.rmSync(src, { recursive: true, force: true });
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  logger.log(L, `NSIS extraído para: ${gameDir}`);
  return { destDir: gameDir };
}

function copyToPrefix(exePath, prefixPath) {
  const driveC = [path.join(prefixPath, 'drive_c'), path.join(prefixPath, 'pfx', 'drive_c')]
    .find(p => fs.existsSync(p));
  if (!driveC) throw new Error('drive_c não encontrado no prefixo');

  const srcDir = fs.statSync(exePath).isDirectory() ? exePath : path.dirname(exePath);
  const dirName = path.basename(exePath, path.extname(exePath)) || 'game';
  const destDir = path.join(driveC, 'games', dirName);
  fs.mkdirSync(destDir, { recursive: true });

  logger.log(L, `Copiando portátil de ${srcDir} para ${destDir}`);

  for (const entry of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, entry);
    const dst = path.join(destDir, entry);
    fs.cpSync(src, dst, { recursive: true, force: true });
  }

  logger.log(L, `Portátil copiado: ${destDir}`);
  return destDir;
}

module.exports = { runInstaller, copyToPrefix, extractInnoSetup, extractNsis };
