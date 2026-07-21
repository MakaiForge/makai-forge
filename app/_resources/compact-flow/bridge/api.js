const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { MAKAI_DATA } = require('../data');

function findApiServer() {
  if (process.env.PROTONFORGE_API_SERVER && fs.existsSync(process.env.PROTONFORGE_API_SERVER))
    return process.env.PROTONFORGE_API_SERVER;
  const installed = path.join(MAKAI_DATA, 'installer-api', 'protonforge-api', 'server.py');
  if (fs.existsSync(installed)) return installed;
  return null;
}

function findPython() {
  if (process.env.VENV_PYTHON_PATH && fs.existsSync(process.env.VENV_PYTHON_PATH))
    return process.env.VENV_PYTHON_PATH;
  const candidates = [
    path.join(os.homedir(), 'Documentos', 'Makai_forge', 'tools', 'venv', 'bin', 'python3'),
    '/usr/bin/python3',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return '/usr/bin/python3';
}

const PYTHON = findPython();
const API_SERVER = findApiServer();

function callApi(method, params = {}, timeout = 30000) {
  if (!API_SERVER) {
    throw new Error('API server not found at ' + path.join(MAKAI_DATA, 'installer-api', 'protonforge-api', 'server.py'));
  }
  const input = JSON.stringify({ id: 1, method, params }) + '\n';
  const result = execFileSync(PYTHON, [API_SERVER], {
    input,
    encoding: 'utf-8',
    timeout,
  });
  const lines = result.trim().split('\n');
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.id === 1) {
        if (parsed.error) throw new Error(parsed.error.message || JSON.stringify(parsed.error));
        return parsed.result;
      }
    } catch {}
  }
  throw new Error('Invalid API response');
}

module.exports = { callApi };
