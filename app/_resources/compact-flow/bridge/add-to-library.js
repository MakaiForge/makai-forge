#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { CATALOG_DB } = require('../data');

const USER_DATA = process.env.MAKAI_DATA_DIR || path.join(require('os').homedir(), '.config', 'makai-forger');
const STORES_DIR = path.join(USER_DATA, 'stores');
const GAMES_FILE = path.join(STORES_DIR, 'games.json');
const SHOP_FILE = path.join(STORES_DIR, 'shop.json');
const GAMES_JSON_DIR = path.join(USER_DATA, 'games');
const REFRESH_FLAG = path.join(USER_DATA, '.compatflow-refresh');
const DEBUG_LOG = path.join(USER_DATA, 'compatflow-bridge.log');

function debug(msg) {
  try { fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${msg}\n`); } catch {}
}

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return {}; }
}

function atomicWriteJson(filePath, data) {
  const tmp = filePath + '.tmp.' + Date.now();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const val = process.argv[++i];
  args[key] = val;
}

const { title, exePath, prefixPath, protonVersion, protonPath } = args;
debug(`START title="${title}" exePath="${exePath}"`);

if (!title || !exePath) {
  console.error('Usage: add-to-library.js --title <title> --exe-path <path> [--prefix-path <path>] [--proton-version <ver>]');
  process.exit(1);
}

function esc(v) { return String(v).replace(/'/g, "''"); }

async function searchCatalogue(gameTitle) {
  try {
    const { execFile } = require('child_process');
    const query = esc(gameTitle.trim().toLowerCase());
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
  const filesWritten = [];

  try {
    // Valida Proton path se informado
    if (protonPath && !fs.existsSync(protonPath)) {
      throw new Error(`Proton path não encontrado: ${protonPath}`);
    }

    const titleLower = title.trim().toLowerCase();
    let objectId = crypto.randomUUID();
    let gameKey = `custom:${objectId}`;
    let oldObjectId = null;
    let existingKey = null;

    const games = readJson(GAMES_FILE);
    for (const [key, val] of Object.entries(games)) {
      if (val && val.title && val.title.trim().toLowerCase() === titleLower) {
        oldObjectId = val.objectId;
        existingKey = key;
        debug(`Duplicado encontrado: key=${key} oldObjectId=${oldObjectId}`);
        delete games[key];
        break;
      }
    }

    if (oldObjectId) {
      const oldJsonPath = path.join(GAMES_JSON_DIR, `${oldObjectId}.json`);
      try { if (fs.existsSync(oldJsonPath)) { fs.unlinkSync(oldJsonPath); } } catch {}
    }

    const homePath = require('os').homedir();
    const gameDirName = title
      .trim()
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
    const winePrefixPath = prefixPath || path.join(homePath, 'Games', 'MakaiForger', gameDirName);

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
      shop: 'custom',
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
    atomicWriteJson(GAMES_FILE, games);
    filesWritten.push(GAMES_FILE);
    debug(`Game escrito key="${gameKey}" objectId=${objectId}`);

    const shopData = readJson(SHOP_FILE);
    if (oldObjectId) {
      delete shopData[`custom:${oldObjectId}`];
      delete shopData[`!games!custom:${oldObjectId}`];
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
    atomicWriteJson(SHOP_FILE, shopData);
    filesWritten.push(SHOP_FILE);

    const gameJsonPath = path.join(GAMES_JSON_DIR, `${objectId}.json`);
    atomicWriteJson(gameJsonPath, game);
    filesWritten.push(gameJsonPath);

    try { fs.writeFileSync(REFRESH_FLAG, Date.now().toString(), 'utf-8'); } catch {}

    debug('END success');
    console.log(JSON.stringify({ success: true, objectId, title, cover: !!iconUrl, updated: !!existingKey }));
  } catch (e) {
    debug(`FATAL: ${e.message}`);
    // Rollback: apaga arquivos escritos parcialmente
    for (const f of filesWritten) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
    console.error(JSON.stringify({ success: false, error: e.message }));
    process.exit(1);
  }
}

main();
