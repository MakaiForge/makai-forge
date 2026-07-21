const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_ENV_VAR = 'COMPATFLOW_LOG';
const DEFAULT_LOG_PATH = path.join(os.homedir(), 'Documentos', 'CompatibilityFlow.log');

let logPath = DEFAULT_LOG_PATH;
let enabled = true;

try {
  const envVal = (process.env[LOG_ENV_VAR] || '').toLowerCase();
  if (envVal === '0' || envVal === 'false' || envVal === 'off' || envVal === 'disable') {
    enabled = false;
  } else if (envVal && envVal !== '1' && envVal !== 'true' && envVal !== 'on' && envVal !== 'enable') {
    logPath = path.resolve(envVal);
  }
} catch {}

let stream = null;
try {
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  stream = fs.createWriteStream(logPath, { flags: 'a' });
  write('[logger] Log iniciado em ' + logPath);
} catch (e) {
  console.error('[logger] Falha ao abrir arquivo de log:', e.message);
}

function write(msg) {
  if (!enabled || !stream) return;
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').slice(0, 19);
  stream.write(`[${ts}] ${msg}\n`);
}

function log(module, msg) {
  write(`[${module}] ${msg}`);
  console.error(`[${module}] ${msg}`);
}

function exec(module, cmd, args, result) {
  const cmdStr = cmd + (args ? ' ' + args.join(' ') : '');
  write(`[${module}] EXEC: ${cmdStr}`);
  if (result && result.status !== undefined) {
    write(`[${module}] EXIT: ${result.status} | signal: ${result.signal} | error: ${result.error || 'none'}`);
  }
}

function error(module, msg) {
  write(`[${module}] ERROR: ${msg}`);
  console.error(`[${module}] ERROR: ${msg}`);
}

function close() {
  if (stream) {
    write('[logger] Log encerrado');
    stream.end();
    stream = null;
  }
}

module.exports = { log, exec, error, write, close, setEnabled: (v) => { enabled = v; } };
