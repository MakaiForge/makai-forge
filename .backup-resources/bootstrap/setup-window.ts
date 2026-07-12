import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import type { BrowserWindow } from "electron";

function setupHtml(bgPath: string): string { return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Makai Forge</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 100vw; height: 100vh; overflow: hidden;
  font-family: 'Courier New', monospace;
  color: #e0e0e0; background: #0a0a0f;
  display: flex; flex-direction: column; user-select: none;
}
#bg {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: url('${bgPath}') center/cover no-repeat;
  filter: brightness(0.3) saturate(0.8); z-index: 0;
}
#overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: linear-gradient(180deg, rgba(10,10,15,0.7) 0%, rgba(10,10,15,0.9) 100%);
  z-index: 1;
}
.content {
  position: relative; z-index: 2; display: flex;
  flex-direction: column; height: 100vh; padding: 40px 60px;
}
.logo-area { text-align: center; padding-top: 30px; flex-shrink: 0; }
.logo-area h1 {
  font-family: 'Courier New', monospace;
  font-size: 42px; font-weight: 900; letter-spacing: 4px;
  text-transform: uppercase;
  background: linear-gradient(135deg, #b388ff, #7c4dff, #536dfe);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  text-shadow: 0 0 40px rgba(124,77,255,0.3);
}
.logo-area .subtitle {
  font-size: 13px; color: #888; letter-spacing: 6px;
  text-transform: uppercase; margin-top: 8px;
}
.status-area {
  flex: 1; display: flex; flex-direction: column;
  justify-content: center; align-items: center; gap: 20px;
}
#status-text { font-size: 16px; color: #ccc; letter-spacing: 1px; }
.progress-container {
  width: 70%; max-width: 600px; height: 6px;
  background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;
  box-shadow: 0 0 20px rgba(124,77,255,0.1);
}
#progress-bar {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, #7c4dff, #b388ff, #536dfe);
  border-radius: 3px; transition: width 0.3s ease;
  box-shadow: 0 0 15px rgba(124,77,255,0.5);
}
#detail-text { font-size: 12px; color: #666; }
.terminal-area {
  flex-shrink: 0; height: 200px;
  background: rgba(0,0,0,0.7);
  border: 1px solid rgba(124,77,255,0.2);
  border-radius: 6px; padding: 12px 16px; overflow-y: auto;
  font-size: 12px; line-height: 1.6; color: #aaa;
}
.terminal-area::-webkit-scrollbar { width: 4px; }
.terminal-area::-webkit-scrollbar-track { background: transparent; }
.terminal-area::-webkit-scrollbar-thumb { background: rgba(124,77,255,0.3); border-radius: 2px; }
.log-line { white-space: pre-wrap; word-break: break-all; }
.log-line.info { color: #8cf; }
.log-line.warn { color: #fc3; }
.log-line.error { color: #f55; }
.log-line.success { color: #5c5; }
.log-line.download { color: #7c4dff; }
.log-line.extract { color: #b388ff; }
.log-line::before { content: "> "; color: #7c4dff; }
</style>
</head>
<body>
<div id="bg"></div>
<div id="overlay"></div>
<div class="content">
  <div class="logo-area">
    <h1>Makai Forge</h1>
    <div class="subtitle">Preparando o ambiente</div>
  </div>
  <div class="status-area">
    <div id="status-text">Inicializando...</div>
    <div class="progress-container">
      <div id="progress-bar"></div>
    </div>
    <div id="detail-text"></div>
  </div>
  <div class="terminal-area" id="terminal"></div>
</div>
<script>
const { ipcRenderer } = require('electron');
const terminal = document.getElementById('terminal');
const statusText = document.getElementById('status-text');
const progressBar = document.getElementById('progress-bar');
const detailText = document.getElementById('detail-text');

function addLog(msg, type) {
  const div = document.createElement('div');
  div.className = 'log-line ' + (type || 'info');
  div.textContent = msg;
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
}

ipcRenderer.on('on-venv-progress', (_, data) => {
  const s = data.status;
  const pct = data.percent || 0;
  progressBar.style.width = pct + '%';
  if (s==='checking') { statusText.textContent='Verificando Python portátil...'; addLog('Verificando venv...','info'); }
  else if (s==='downloading') { statusText.textContent='Baixando Python portátil...'; addLog('Baixando venv ('+pct+'%)...','download'); }
  else if (s==='restoring') { statusText.textContent='Extraindo Python portátil...'; addLog('Extraindo venv...','extract'); }
  else if (s==='verifying') { statusText.textContent='Verificando Python...'; addLog('Verificando instalação do venv...','info'); }
  else if (s==='ready') { statusText.textContent='Python pronto ✓'; addLog('Venv pronto ✓','success'); }
  else if (s==='error') { statusText.textContent='Erro no Python'; addLog('Falha no venv','error'); }
});

ipcRenderer.on('on-resource-progress', (_, data) => {
  const s = data.status;
  const pct = data.percent || 0;
  const det = data.detail || '';
  progressBar.style.width = pct + '%';
  detailText.textContent = det;
  if (s==='checking') { statusText.textContent='Verificando recursos...'; addLog('Verificando recursos necessários...','info'); }
  else if (s==='downloading') { statusText.textContent='Baixando recursos...'; addLog('Baixando: '+det,'download'); }
  else if (s==='extracting') { statusText.textContent='Extraindo recursos...'; addLog('Extraindo: '+det,'extract'); }
  else if (s==='ready') { addLog(det,'success'); }
  else if (s==='error') { addLog('Erro: '+det,'error'); }
});

ipcRenderer.on('on-setup-complete', () => {
  statusText.textContent='Pronto! Iniciando...';
  progressBar.style.width='100%';
  addLog('Makai Forge pronto!','success');
});
</script>
</body>
</html>`; }

export function createSetupWindow(win: BrowserWindow) {
  const bgPath = app.isPackaged
    ? `file://${path.join(process.resourcesPath, "Bootstrap", "background.png")}`
    : `file://${path.join(app.getAppPath(), "data", "Bootstrap", "background.png")}`;
  const html = setupHtml(bgPath);
  const htmlPath = path.join(app.getPath("userData"), ".cache", "setup.html");
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(htmlPath, html, "utf-8");
  win.loadFile(htmlPath);
  win.once("ready-to-show", () => win.show());
}

export function sendSetupComplete(wm: { setupWindow: BrowserWindow | null }) {
  const target = wm.setupWindow;
  if (target && !target.isDestroyed()) {
    target.webContents.send("on-setup-complete");
  }
}
