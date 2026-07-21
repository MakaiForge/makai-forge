const { execFile } = require('child_process');
const { CATALOG_DB } = require('../data');

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
      catch { reject(new Error('Invalid JSON from sqlite3')); }
    });
  });
}

function esc(v) { return String(v).replace(/'/g, "''"); }

module.exports = { enrichGame, sqliteQuery, esc };
