const path = require('path');
const os = require('os');
const fs = require('fs');

const MAKAI_DATA = path.join(os.homedir(), '.config', 'makai-forger', 'resources');
const CATALOG_DB = path.join(MAKAI_DATA, 'database', 'catalogo.db');
const FORK_CATALOG_DB = path.join(MAKAI_DATA, 'database', 'fork_catalog.db');
const PROTON_RECOMMENDED_DB = path.join(MAKAI_DATA, 'installer-api', 'proton_recommended', 'proton_db', 'proton_recommended.db');
const RELEASES_DIR = (() => {
  const d = path.join(MAKAI_DATA, 'data', 'releases');
  if (fs.existsSync(d)) return d;
  return path.join(MAKAI_DATA, 'data');
})();

function findData(...segments) {
  const p = path.join(MAKAI_DATA, ...segments);
  return p;
}

function dbExists(dbPath) {
  return fs.existsSync(dbPath);
}

module.exports = { MAKAI_DATA, CATALOG_DB, FORK_CATALOG_DB, PROTON_RECOMMENDED_DB, RELEASES_DIR, findData, dbExists };
