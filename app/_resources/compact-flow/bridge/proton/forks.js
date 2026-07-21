const { execFileSync } = require('child_process');
const { FORK_CATALOG_DB, dbExists } = require('../../data');

const CATEGORY_SCORES = {
  'Proton': 90,
  'DXVK': 70,
  'Wine': 50,
  'Runtime': 30,
  'Tool': 20,
};

function listForks() {
  if (!dbExists(FORK_CATALOG_DB)) return [];
  try {
    const stdout = execFileSync('/usr/bin/sqlite3', ['-json', FORK_CATALOG_DB,
      `SELECT id, name, category, features, description, repo_url, repo_type, sort_order, author, license, icon_url, homepage_url FROM forks ORDER BY sort_order ASC`], { timeout: 10000, encoding: 'utf-8' });
    const rows = JSON.parse(stdout);
    return rows.map(f => ({
      ...f,
      features: parseFeatures(f.features),
      ranking: categoryToRanking(f.category),
      tierScore: CATEGORY_SCORES[f.category] || 50,
    }));
  } catch {
    return [];
  }
}

function listForkIds() {
  if (!dbExists(FORK_CATALOG_DB)) return [];
  try {
    const stdout = execFileSync('/usr/bin/sqlite3', ['-json', FORK_CATALOG_DB,
      `SELECT id, name, category, features FROM forks ORDER BY sort_order ASC`], { timeout: 10000, encoding: 'utf-8' });
    const rows = JSON.parse(stdout);
    return rows.map(f => ({
      ...f,
      features: parseFeatures(f.features),
      ranking: categoryToRanking(f.category),
      tierScore: CATEGORY_SCORES[f.category] || 50,
    }));
  } catch {
    return [];
  }
}

function parseFeatures(raw) {
  try { return JSON.parse(raw); } catch { return []; }
}

function categoryToRanking(cat) {
  const map = { 'Proton': 'gold', 'DXVK': 'silver', 'Wine': 'bronze', 'Runtime': 'experimental', 'Tool': 'experimental' };
  return map[cat] || 'experimental';
}

function rateReleases(releases) {
  if (!Array.isArray(releases) || releases.length === 0) return [];
  const forks = listForkIds();
  const forkById = {};
  for (const f of forks) forkById[f.id] = f;
  return releases.map(r => {
    const toolId = r.toolId || '';
    const fork = forkById[toolId];
    if (!fork) return { tag: r.tag, rating: null };
    return { tag: r.tag, rating: fork.tierScore };
  });
}

module.exports = { listForks, listForkIds, rateReleases };
