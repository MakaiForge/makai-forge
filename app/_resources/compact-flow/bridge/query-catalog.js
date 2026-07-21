#!/usr/bin/env node
const { enrichGame, sqliteQuery, esc } = require('../core/catalog');

function searchCatalog(gameName, limit = 5) {
  const query = esc((gameName || '').trim().toLowerCase());
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 100);
  if (!query) return [];

  return sqliteQuery(
    `SELECT * FROM games WHERE LOWER(title) LIKE '%${query}%' ORDER BY estimated_owners DESC LIMIT ${safeLimit}`
  ).then(rows => rows.map(enrichGame));
}

if (require.main === module) {
  const query = process.argv.slice(2).join(' ');
  searchCatalog(query, 10)
    .then(results => { console.log(JSON.stringify(results, null, 2)); })
    .catch(err => { console.error('Error:', err.message); process.exit(1); });
}

module.exports = { searchCatalog };
