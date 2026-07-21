const { ipcMain } = require('electron');
const { enrichGame, sqliteQuery, esc } = require('../../core/catalog');

ipcMain.handle('catalog-search', async (_, gameName) => {
  const query = (gameName || '').trim().toLowerCase();
  if (!query) return [];

  const eq = esc(query);

  try {
    const safeTerms = query.split(/\s+/).map(t => `"${t.replace(/"/g, '""')}"*`).join(' ');
    const rows = await sqliteQuery(`SELECT objectId FROM games_fts WHERE games_fts MATCH '${esc(safeTerms)}' ORDER BY rank LIMIT 5`);
    if (rows.length > 0) {
      const ids = rows.map(r => `'${esc(r.objectId)}'`).join(',');
      const games = await sqliteQuery(`SELECT * FROM games WHERE objectId IN (${ids})`);
      return games.map(enrichGame);
    }
  } catch {}

  try {
    const games = await sqliteQuery(
      `SELECT * FROM games WHERE LOWER(title) LIKE '%${eq}%' ORDER BY estimated_owners DESC LIMIT 5`
    );
    return games.map(enrichGame);
  } catch { return []; }
});

module.exports = { enrichGame, sqliteQuery };
