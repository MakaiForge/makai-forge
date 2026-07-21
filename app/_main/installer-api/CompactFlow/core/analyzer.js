const path = require('path');
const {
  getAppName,
  getGameName,
  checkNative,
  checkPort,
} = require('./database');

function analyze(filePath) {
  const cleanName = getAppName(filePath);
  const result = {
    original: path.basename(filePath),
    clean_name: cleanName,
    game_name: getGameName(cleanName),
  };

  const native = checkNative(cleanName);
  if (native.found) {
    result.type = 'native';
    result.app = native.app;
    result.package = native.package;
    result.desc = native.desc;
    return result;
  }

  const port = checkPort(cleanName);
  if (port.found) {
    result.type = 'port';
    result.app = port.port.name || cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    result.port = port.port;
    result.port_id = port.id;
    return result;
  }

  const gameName = getGameName(cleanName);
  if (gameName) {
    result.type = 'game';
    result.app = gameName;
    return result;
  }

  result.type = 'unknown';
  result.app = cleanName ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1) : 'Desconhecido';
  return result;
}

function analyzeBatch(filePaths) {
  return filePaths.map(p => analyze(p));
}

module.exports = { analyze, analyzeBatch };
