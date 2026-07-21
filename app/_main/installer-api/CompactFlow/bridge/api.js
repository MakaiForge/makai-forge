#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

// Tenta encontrar server.py do Proton recommendation em locais comuns
function findApiServer() {
  if (process.env.PROTONFORGE_API_SERVER && fs.existsSync(process.env.PROTONFORGE_API_SERVER))
    return process.env.PROTONFORGE_API_SERVER;

  const candidates = [
    // Instalado (Electron app): resources/protonforge-api/server.py
    path.join(__dirname, '..', '..', '..', 'resources', 'protonforge-api', 'server.py'),
    // Desenvolvimento: tools/python-rpc/protonforge-api/server.py
    path.join(os.homedir(), 'Documentos', 'Makai-forge', 'tools', 'python-rpc', 'protonforge-api', 'server.py'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]; // último fallback
}

// Tenta encontrar python3 do venv ou do sistema
function findPython() {
  if (process.env.VENV_PYTHON_PATH && fs.existsSync(process.env.VENV_PYTHON_PATH))
    return process.env.VENV_PYTHON_PATH;

  const candidates = [
    path.join(os.homedir(), 'Documentos', 'Makai-forge', 'tools', 'venv', 'bin', 'python3'),
    path.join(__dirname, '..', '..', '..', 'resources', 'venv', 'bin', 'python3'),
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
