const path = require('path');
const fs = require('fs');

let overridesCache = null;

function getOverridesDir() {
  return path.join(__dirname, 'overrides');
}

function getOverridesFile() {
  return path.join(__dirname, 'overrides.json');
}

function loadOverrides() {
  if (overridesCache) return overridesCache;

  const result = { rules: [] };

  const jsonFile = getOverridesFile();
  if (fs.existsSync(jsonFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
      if (data.rules) result.rules = result.rules.concat(data.rules);
    } catch (e) {
      console.error(`[overrides] Failed to load ${jsonFile}: ${e.message}`);
    }
  }

  const dir = getOverridesDir();
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir).sort()) {
      if (!entry.endsWith('.json')) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8'));
        if (data.rules) result.rules = result.rules.concat(data.rules);
      } catch (e) {
        console.error(`[overrides] Failed to load ${entry}: ${e.message}`);
      }
    }
  }

  overridesCache = result;
  return result;
}

function clearCache() {
  overridesCache = null;
}

function matchRule(rule, sourcePath, gameId, gameTitle) {
  if (rule.gameId && gameId) {
    if (typeof rule.gameId === 'string' && rule.gameId === gameId) return true;
    if (rule.gameId instanceof RegExp && rule.gameId.test(gameId)) return true;
    if (typeof rule.gameId === 'string' && gameId.includes(rule.gameId)) return true;
  }

  if (rule.matchTitle && gameTitle) {
    if (typeof rule.matchTitle === 'string' && gameTitle.toLowerCase().includes(rule.matchTitle.toLowerCase())) return true;
    if (rule.matchTitle instanceof RegExp && rule.matchTitle.test(gameTitle)) return true;
  }

  if (rule.matchFile) {
    const basename = path.basename(sourcePath).toLowerCase();
    if (typeof rule.matchFile === 'string' && basename.includes(rule.matchFile.toLowerCase())) return true;
    if (rule.matchFile instanceof RegExp && rule.matchFile.test(basename)) return true;
  }

  if (rule.matchDir && sourcePath) {
    const dirname = path.basename(path.dirname(sourcePath)).toLowerCase();
    if (typeof rule.matchDir === 'string' && dirname.includes(rule.matchDir.toLowerCase())) return true;
  }

  return false;
}

function findOverride(sourcePath, gameId, gameTitle) {
  const overrides = loadOverrides();
  for (const rule of overrides.rules) {
    if (matchRule(rule, sourcePath, gameId, gameTitle)) {
      return rule;
    }
  }
  return null;
}

module.exports = { loadOverrides, findOverride, clearCache };
