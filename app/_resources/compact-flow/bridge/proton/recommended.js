const { execFileSync } = require('child_process');
const { PROTON_RECOMMENDED_DB, dbExists } = require('../../data');

const GAME_ID_MAP = {
  'skyrim vanilla': 'skyrim',
  'skyrim special edition': 'skyrim_se',
  'skyrim se': 'skyrim_se',
  'skyrim vr': 'skyrim_vr',
  'fallout 3': 'fallout3',
  'fallout new vegas': 'falloutnv',
  'fallout 4': 'fallout4',
  'fallout 4 vr': 'fallout4_vr',
  'the elder scrolls iv: oblivion': 'oblivion',
  'the elder scrolls iii: morrowind': 'morrowind',
  'the witcher 3': 'witcher3',
  'cyberpunk 2077': 'cyberpunk2077',
  "baldur's gate 3": 'larian',
  'stardew valley': 'stardewvalley',
  '7 days to die': '7daystodie',
  'the long dark': 'thelongdark',
  'do not feed the monkeys': 'donotfeedthemonkeys',
  'kerbal space program': 'kerbalspaceprogram',
  'dragon age: origins': 'dragonageorigins',
  'dragon age ii': 'dragonage2',
  'mass effect': 'masseffect',
  'mass effect legendary': 'masseffect',
  'xcom 2': 'xcom2',
};

function normalizeGameId(raw) {
  const key = (raw || '').toLowerCase().trim();
  return GAME_ID_MAP[key] || key;
}

function getRecommendation(gameName) {
  if (!gameName || !dbExists(PROTON_RECOMMENDED_DB)) return null;
  const id = normalizeGameId(gameName);
  try {
    const stdout = execFileSync('/usr/bin/sqlite3', ['-json', PROTON_RECOMMENDED_DB,
      `SELECT game_id, steam_app_id, total_reports, recommended, versions FROM game_recommendations WHERE game_id = '${id.replace(/'/g, "''")}'`], { timeout: 10000, encoding: 'utf-8' });
    const rows = JSON.parse(stdout);
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    let recommended = [];
    let versions = [];
    try { recommended = JSON.parse(row.recommended); } catch {}
    try { versions = JSON.parse(row.versions); } catch {}
    return {
      gameId: row.game_id,
      steamAppId: row.steam_app_id,
      totalReports: row.total_reports,
      recommended,
      versions,
    };
  } catch {
    return null;
  }
}

module.exports = { getRecommendation, normalizeGameId };
