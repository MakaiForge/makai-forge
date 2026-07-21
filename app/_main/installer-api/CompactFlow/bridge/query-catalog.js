#!/usr/bin/env node
/**
 * Bridge: Consulta o catálogo do Proton Forger
 *
 * Uso CLI:
 *   node query-catalog.js "Genshin Impact"
 *
 * Uso como módulo:
 *   const { searchCatalog } = require('./query-catalog');
 *   const result = searchCatalog('Genshin Impact');
 */

const path = require('path');
const { execFile } = require('child_process');
const CATALOG_DB = path.join(path.resolve(__dirname, '..', '..', '..', '..'), 'resources', 'database', 'catalogo.db');

function enrichGame(g) {
  if (!g) return null;
  const parse = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
  return {
    objectId: g.objectId,
    title: g.title,
    shop: g.shop,
    genres: parse(g.genres),
    libraryImageUrl: g.libraryImageUrl,
    libraryHeroImageUrl: g.libraryHeroImageUrl,
    iconUrl: g.iconUrl,
    shortDescription: g.shortDescription,
    developer: g.developer,
    publisher: g.publisher,
    releaseYear: g.releaseYear,
    recommendedProton: g.recommendedProton,
    protonConfidence: g.protonConfidence,
    protonSource: g.protonSource,
    protonFallback: g.protonFallback,
    protonAlternatives: parse(g.protonAlternatives),
    screenshots: parse(g.screenshots),
    movies: parse(g.movies),
    downloadSources: parse(g.downloadSources),
    downloads: parse(g.downloads),
    estimated_owners: g.estimated_owners,
  };
}

function sqliteQuery(sql) {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/sqlite3', ['-json', CATALOG_DB, sql], { timeout: 15000 }, (err, stdout) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error('Invalid JSON from sqlite3: ' + stdout.slice(0, 200))); }
    });
  });
}

function searchCatalog(gameName, limit = 5) {
  const query = (gameName || '').trim().toLowerCase();
  if (!query) return [];

  return sqliteQuery(
    `SELECT * FROM games WHERE LOWER(title) LIKE '%${query.replace(/'/g, "''")}%' ORDER BY estimated_owners DESC LIMIT ${limit}`
  ).then(rows => rows.map(enrichGame));
}

// CLI
if (require.main === module) {
  const query = process.argv.slice(2).join(' ');
  searchCatalog(query, 10)
    .then(results => { console.log(JSON.stringify(results, null, 2)); })
    .catch(err => { console.error('Error:', err.message); process.exit(1); });
}

module.exports = { searchCatalog };
