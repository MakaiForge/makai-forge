#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PF_DIR = path.resolve(__dirname, '..', '..', '..', '..');
const CATALOG_DB = path.join(PF_DIR, 'resources', 'database', 'catalogo.db');
const USER_DATA = path.join(require('os').homedir(), '.config', 'makai-forger');
const STORES_DIR = path.join(USER_DATA, 'stores');
const GAMES_FILE = path.join(STORES_DIR, 'games.json');
const SHOP_FILE = path.join(STORES_DIR, 'shop.json');
const GAMES_JSON_DIR = path.join(USER_DATA, 'games');

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return {}; }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const val = process.argv[++i];
  args[key] = val;
}

const { title, exePath, prefixPath, protonVersion, protonPath } = args;
const DEBUG_LOG = path.join(USER_DATA, 'compatflow-bridge.log');
function debug(msg) {
  try { fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${msg}\n`); } catch {}
}
debug(`START title="${title}" exePath="${exePath}"`);
if (!title || !exePath) {
  console.error('Usage: add-to-library.js --title <title> --exe-path <path> [--prefix-path <path>] [--proton-version <ver>]');
  process.exit(1);
}

async function searchCatalogue(gameTitle) {
  try {
    const { execFile } = require('child_process');
    const query = gameTitle.trim().toLowerCase().replace(/'/g, "''");
    const sql = `SELECT objectId, libraryImageUrl, libraryHeroImageUrl, iconUrl, shop FROM games WHERE LOWER(title) = '${query}' LIMIT 1`;
    const rows = await new Promise((resolve, reject) => {
      execFile('/usr/bin/sqlite3', ['-json', CATALOG_DB, sql], { timeout: 5000 }, (err, stdout) => {
        if (err) return resolve([]);
        try { resolve(JSON.parse(stdout)); }
        catch { resolve([]); }
      });
    });
    if (rows && rows.length > 0) {
      const r = rows[0];
      return {
        objectId: r.objectId,
        libraryImageUrl: r.libraryImageUrl || null,
        libraryHeroImageUrl: r.libraryHeroImageUrl || null,
        iconUrl: r.iconUrl || null,
      };
    }
  } catch {}
  return null;
}

async function main() {
  debug('main() started');

  // Verifica se já existe um jogo com o mesmo título (case-insensitive)
  const titleLower = title.trim().toLowerCase();
  let objectId = crypto.randomUUID();
  let shop = 'custom';
  let gameKey = `${shop}:${objectId}`;
  let existingTitle = null;
  let existingKey = null;
  let oldObjectId = null;

  const games = readJson(GAMES_FILE);
  for (const [key, val] of Object.entries(games)) {
    if (val && val.title && val.title.trim().toLowerCase() === titleLower) {
      existingTitle = val.title;
      existingKey = key;
      oldObjectId = val.objectId;
      debug(`Duplicado encontrado: key=${key} oldObjectId=${oldObjectId}`);
      delete games[key];
      debug(`Antigo registo apagado`);
      break;
    }
  }

  // Apaga JSON antigo se existir
  if (oldObjectId) {
    const oldJsonPath = path.join(GAMES_JSON_DIR, `${oldObjectId}.json`);
    try { if (fs.existsSync(oldJsonPath)) { fs.unlinkSync(oldJsonPath); debug(`JSON antigo apagado: ${oldJsonPath}`); } } catch {}
  }

  const homePath = require('os').homedir();
  const gameDirName = title
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
  const winePrefixPath = prefixPath || path.join(homePath, 'Games', 'MakaiForger', gameDirName);

  // Busca capa no catálogo local por nome do jogo
  const cat = await searchCatalogue(title);
  const iconUrl = cat ? cat.iconUrl || cat.libraryImageUrl : null;
  const heroUrl = cat ? cat.libraryHeroImageUrl || cat.libraryImageUrl || iconUrl : null;
  const catShop = cat ? cat.shop || 'custom' : 'custom';

  const game = {
    title,
    iconUrl,
    logoImageUrl: null,
    libraryHeroImageUrl: heroUrl,
    objectId,
    shop,
    remoteId: cat ? cat.objectId : null,
    isDeleted: false,
    playTimeInMilliseconds: 0,
    lastTimePlayed: null,
    executablePath: exePath,
    winePrefixPath,
    protonPath: protonPath || null,
    protonVersion: protonVersion || null,
    launchOptions: null,
    favorite: false,
    automaticCloudSync: false,
    hasManuallyUpdatedPlaytime: false,
    downloadSource: 'compatflow',
  };

  games[gameKey] = game;
  writeJson(GAMES_FILE, games);
  debug(`Game escrito key="${gameKey}" objectId=${objectId}`);

  // Apaga asset antigo do shop DB se existir
  const shopData = readJson(SHOP_FILE);
  if (oldObjectId) {
    const oldShopKey = `custom:${oldObjectId}`;
    delete shopData[oldShopKey];
    const oldShopKeyPrefixed = `!games!custom:${oldObjectId}`;
    delete shopData[oldShopKeyPrefixed];
  }

  const assets = {
    updatedAt: Date.now(),
    objectId,
    shop: catShop,
    title,
    iconUrl,
    libraryHeroImageUrl: heroUrl || '',
    libraryImageUrl: iconUrl || '',
    logoImageUrl: '',
    logoPosition: null,
    coverImageUrl: '',
    downloadSources: [],
    steamAppId: null,
  };
  shopData[gameKey] = assets;
  writeJson(SHOP_FILE, shopData);

  // JSON backup
  if (!fs.existsSync(GAMES_JSON_DIR)) fs.mkdirSync(GAMES_JSON_DIR, { recursive: true });
  fs.writeFileSync(path.join(GAMES_JSON_DIR, `${objectId}.json`), JSON.stringify(game, null, 2), 'utf-8');

  // Sinaliza refresh para o Proton Forger (depois de tudo escrito)
  const REFRESH_FLAG = path.join(USER_DATA, '.compatflow-refresh');
  try { fs.writeFileSync(REFRESH_FLAG, Date.now().toString(), 'utf-8'); } catch {}

  debug('END success');
  console.log(JSON.stringify({ success: true, objectId, title, cover: !!iconUrl, updated: !!existingKey, existingTitle }));
}

main().catch(e => {
  debug(`FATAL: ${e.message}\n${e.stack}`);
  console.error(JSON.stringify({ success: false, error: e.message }));
  process.exit(1);
});
