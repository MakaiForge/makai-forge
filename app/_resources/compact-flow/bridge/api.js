/**
 * bridge/api.js — RPC client for the Makai Forge Python server.
 *
 * Communicates via JSON-RPC over stdin/stdout (--stdio mode).
 * The Python server is spawned once and kept alive for the process lifetime.
 *
 * Replaces the old per-call execFileSync approach.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── Find paths ────────────────────────────────────────────────

function findMakaiForgeDir() {
  if (process.env.MAKAI_FORGE_DIR && fs.existsSync(process.env.MAKAI_FORGE_DIR))
    return process.env.MAKAI_FORGE_DIR;
  const candidates = [
    path.join(os.homedir(), 'Documentos', 'Makai_forge'),
    path.join(os.homedir(), 'Documents', 'Makai_forge'),
    '/opt/makai-forger',
    '/usr/lib/makai-forger',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const MAKAI_FORGE_DIR = findMakaiForgeDir();

function findServerScript() {
  // 1) Unified RPC server (current)
  if (MAKAI_FORGE_DIR) {
    const rels = [
      path.join('app', 'Catalogo', 'GameMod', 'core', 'server.py'),
      path.join('Catalogo', 'GameMod', 'core', 'server.py'),
    ];
    for (const rel of rels) {
      const p = path.join(MAKAI_FORGE_DIR, rel);
      if (fs.existsSync(p)) return p;
    }
  }

  // 2) Environment variable override
  if (process.env.PROTONFORGE_API_SERVER && fs.existsSync(process.env.PROTONFORGE_API_SERVER))
    return process.env.PROTONFORGE_API_SERVER;

  // 3) Legacy path (userData installer-api)
  const { MAKAI_DATA } = require('../data');
  const legacy = path.join(MAKAI_DATA, 'installer-api', 'protonforge-api', 'server.py');
  if (fs.existsSync(legacy)) return legacy;

  return null;
}

function findPython() {
  if (process.env.VENV_PYTHON_PATH && fs.existsSync(process.env.VENV_PYTHON_PATH))
    return process.env.VENV_PYTHON_PATH;
  const candidates = [];
  if (MAKAI_FORGE_DIR) {
    candidates.push(
      path.join(MAKAI_FORGE_DIR, 'app', '_venv', 'bin', 'python3'),
      path.join(MAKAI_FORGE_DIR, 'tools', 'venv', 'bin', 'python3'),
    );
  }
  candidates.push('/usr/bin/python3');
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return '/usr/bin/python3';
}

// ─── Persistent RPC connection ─────────────────────────────────

const PYTHON = findPython();
const SERVER_SCRIPT = findServerScript();

let process = null;
let buf = '';
let ready = false;
let readyPromise = null;
let readyResolve = null;
const pending = new Map();
let nextId = 1;

function ensureRunning() {
  if (process && process.exitCode === null && ready) return Promise.resolve();
  return spawnServer();
}

function spawnServer() {
  if (process) kill();

  if (!SERVER_SCRIPT) {
    throw new Error(
      'Makai Forge RPC server not found. Install Makai Forge or set MAKAI_FORGE_DIR / PROTONFORGE_API_SERVER.'
    );
  }

  ready = false;
  buf = '';
  pending.clear();

  readyPromise = new Promise((resolve) => { readyResolve = resolve; });

  const child = spawn(PYTHON, [SERVER_SCRIPT, '--stdio'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
    },
  });

  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    processBuffer();
  });

  child.stderr.setEncoding('utf-8');
  child.stderr.on('data', () => {
    // Silence stderr in bridge (server logs go to server.log)
  });

  child.on('error', (err) => {
    handleExit('error: ' + err.message);
  });

  child.on('exit', (code, signal) => {
    handleExit(`exit code=${code} signal=${signal}`);
  });

  process = child;

  return Promise.race([
    readyPromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('MakaiRPC startup timeout (10s)')), 10_000)
    ),
  ]);
}

function kill() {
  if (process) {
    try { process.kill(); } catch {}
    handleExit('killed');
  }
}

function isRunning() {
  return process !== null && process.exitCode === null && ready;
}

// ─── Buffer processing ─────────────────────────────────────────

function processBuffer() {
  let nl = buf.indexOf('\n');
  while (nl >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line) handleLine(line);
    nl = buf.indexOf('\n');
  }
}

function handleLine(line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return;
  }

  // Events (ready, progress, log)
  if (parsed.event) {
    if (parsed.event === 'ready') {
      ready = true;
      readyResolve?.();
      readyResolve = null;
      return;
    }
    // Other events are silently ignored in bridge context
    return;
  }

  // Responses with id
  if (typeof parsed.id !== 'number') return;

  const p = pending.get(parsed.id);
  if (!p) return;

  clearTimeout(p.timer);
  pending.delete(parsed.id);

  if (parsed.error) {
    p.reject(new Error(`[${parsed.error.code}] ${parsed.error.message}`));
  } else {
    p.resolve(parsed.result);
  }
}

function handleExit(reason) {
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.reject(new Error('MakaiRPC exited: ' + reason));
  }
  pending.clear();
  ready = false;
  readyPromise = null;
  readyResolve = null;
  process = null;
  buf = '';
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Call an RPC method on the Makai Forge Python server.
 * Spawns the server on first call, then reuses the connection.
 *
 * @param {string} method - RPC method name
 * @param {object} params - Method parameters
 * @param {number} [timeout=30000] - Timeout in milliseconds
 * @returns {Promise<any>} - RPC result
 */
async function callApi(method, params = {}, timeout = 30000) {
  await ensureRunning();

  if (!process?.stdin) {
    throw new Error('MakaiRPC not available');
  }

  const id = nextId++;
  const payload = { id, method, params };

  return new Promise((resolve, reject) => {
    let timer = null;
    if (timeout > 0) {
      timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MakaiRPC timeout: ${method} (${timeout}ms)`));
      }, timeout);
    }

    pending.set(id, { resolve, reject, timer });
    process.stdin.write(JSON.stringify(payload) + '\n');
  });
}

/**
 * Check if the RPC server is reachable.
 * @returns {Promise<boolean>}
 */
async function ping() {
  try {
    const result = await callApi('ping', {}, 5000);
    return result === 'pong';
  } catch {
    return false;
  }
}

module.exports = { callApi, ping, kill, isRunning };
