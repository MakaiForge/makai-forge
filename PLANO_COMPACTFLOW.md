# PLANO DE INTEGRAÇÃO — CompactFlow → Makai Forger

## Arquitetura Final

```
Makai Forger (um Electron, dois aplicativos)
│
├── BrowserWindow #1 — Makai Forger Main (React SPA)
│   src/renderer/ → React Router → catálogo, games, settings...
│
├── BrowserWindow #2 — CompactFlow (vanilla HTML/JS/CSS)
│   app/_resources/compact-flow/renderer/index.html
│   preload separado: app/_resources/compact-flow/main/preload.js
│
├── IPC handlers do CompactFlow
│   app/_resources/compact-flow/main/ipc/*.js
│   Registrados via src/main/events/compact-flow/index.ts
│
├── Bridge scripts (subprocessos Node.js)
│   app/_resources/compact-flow/bridge/
│
└── Scripts de sistema (instalação futura)
    app/_resources/compact-flow/scripts/
```

---

## FASE 0 — Criação da estrutura

Criar diretórios dentro de `app/_resources/compact-flow/`:

```
app/_resources/compact-flow/
├── bridge/          ← CLI subprocessos (install-game, add-to-library, etc.)
├── scripts/         ← install-integration.sh, compatflow-wrapper, .desktop etc.
├── core/            ← analyzer.js, database.js, catalog.js
├── data/            ← native.json, games.json
├── assets/          ← compatflow.png, tray-icon.png
├── renderer/        ← index.html, app.js, flow.js, styles.css, etc.
└── main/            ← IPC handlers + preload
    ├── ipc/
    ├── preload.js
    ├── distro.js
    ├── terminal.js
    ├── data.js (config paths)
    └── extract_icon.py
```

Criar em `src/`:

```
src/main/
├── services/
│   └── window-manager/
│       └── compact-flow-window.ts    ← Nova janela
└── events/
    └── compact-flow/
        └── index.ts                   ← Loader dos IPC handlers
```

**O que fazer:**

1. `mkdir -p app/_resources/compact-flow/{bridge,scripts,core,data,assets,renderer,main/ipc}`
2. Criar arquivos placeholder para `compact-flow-window.ts` e `events/compact-flow/index.ts`
3. Criar `scripts/install-compactflow.cjs` — script de instalação copiadora

---

## FASE 1 — Core + Data (cópia direta)

Copiar do CompactFlow original (sem modificar):
- `CompactFlow/core/` → `app/_resources/compact-flow/core/`
- `CompactFlow/data/` → `app/_resources/compact-flow/data/`

**Zero modificações.** Esses arquivos são independentes de Electron, só lógica pura.

---

## FASE 2 — Bridge scripts (cópia direta)

Copiar do CompactFlow original:
- `CompactFlow/bridge/` → `app/_resources/compact-flow/bridge/`

Inclui: `install-game/`, `proton/`, `installer/`, `api.js`, `add-to-library.js`, `deps-manager.js`, `logger.js`, `query-catalog.js`, `deps-index.json`.

**Zero modificações.** São CLIs Node.js que rodam como subprocessos (mesmo padrão do `umu-run` no Makai Forger).

---

## FASE 3 — Scripts de sistema (cópia + preparação para packaging)

Copiar do CompactFlow original:
- `CompactFlow/scripts/` → `app/_resources/compact-flow/scripts/`

Arquivos:
- `install-integration.sh` — script mestre de instalação
- `compatflow-wrapper` — entry point shell
- `compatflow.desktop` — .desktop file (precisa ter `Exec=` ajustado)
- `compatflow-thunar-uca.xml` — integração XFCE
- `compatflow-dolphin-servicemenu.desktop` — integração KDE

### Adaptações para packaging

**install-integration.sh** precisa ser modificado para aceitar argumentos:
```bash
# Modo dev: só copia pro projeto
install-integration.sh --dev

# Modo system: instala no /usr/local (para Deb/RPM/AppImage)
install-integration.sh --system

# Modo user: instala no ~/.local (para Flatpak/Snap com permissão)
install-integration.sh --user
```

**compatflow-wrapper** precisa saber achar o Makai Forger (não mais o CompactFlow standalone). A lógica muda para:
1. Procurar o binário do Makai Forger
2. Passar flag `--compact-flow` para abrir direto no CompactFlow Window

**compatflow.desktop** — `Exec=` aponta para o wrapper que chama o Makai Forger com `--compact-flow`.

### Para Flatpak
Criar `scripts/flatpak-compatflow-integration.sh` que:
- Usa `flatpak-spawn --host` para acessar o sistema fora do sandbox
- Registra MIME types no host via `xdg-mime`
- Instala o .desktop no `~/.local/share/applications/` do host

### Para Snap
Criar `scripts/snap-compatflow-integration.sh` que:
- Usa `snapctl` para conectar interfaces
- Registra MIME associations via `xdg-mime` no host

---

## FASE 4 — Assets + data.js (cópia + adaptação)

**Assets:**
- `CompactFlow/assets/` → `app/_resources/compact-flow/assets/`

**data.js (config paths):**
- `CompactFlow/data.js` → `app/_resources/compact-flow/main/data.js`

Precisa ser adaptado porque os paths mudam quando integrado:
```javascript
// ANTES (CompactFlow standalone):
// MAKAI_DATA = ~/.config/makai-forger/resources
// CATALOG_DB = ~/.config/makai-forger/resources/database/catalogo.db

// DEPOIS (integrado):
// Mesmo caminho — os dados do Makai Forger continuam no mesmo lugar
// Só muda que o data.js agora está em app/_resources/compact-flow/main/data.js
```

---

## FASE 5 — Main process IPC (cópia + registro)

Copiar e adaptar IPC handlers do CompactFlow:
- `CompactFlow/main/ipc/` → `app/_resources/compact-flow/main/ipc/`

Arquivos:
- `analyze.js` — `ipcMain.handle('analyze-file', ...)`
- `catalog.js` — `ipcMain.handle('catalog-search', ...)`
- `proton.js` — `ipcMain.handle('proton-list', ...)`, `proton-available`, `proton-install`, `proton-forks`, `proton-release-ratings`
- `install.js` — `ipcMain.handle('game-install', ...)`, `ipcMain.handle('open-proton-forger', ...)`, `ipcMain.handle('close-app', ...)`
- `icon.js` — `ipcMain.handle('extract-icon', ...)`
- `logger.js` — `ipcMain.handle('get-log-path', ...)`, `set-log-enabled`, `open-log`

**Modificações necessárias nos IPCs:**

1. **open-proton-forger (install.js)**: Hoje ele spawna o Makai Forger como processo separado e fecha o CompactFlow. No integrado, ele deve apenas:
   - Chamar `add-to-library.js` (bridge)
   - Focar a Main Window do Makai Forger
   - Fechar a janela do CompactFlow (não o app inteiro)

2. **close-app (install.js)**: Hoje fecha o app. No integrado, deve fechar só a janela do CompactFlow.

3. **Analyze (analyze.js)**: `require('../core/analyzer')` — path relativo precisa ser ajustado para `require('../../core/analyzer')`.

**Registro dos IPCs:**

Criar `src/main/events/compact-flow/index.ts`:
```typescript
import { app } from 'electron';
import path from 'node:path';

const cfDir = app.isPackaged
  ? path.join(process.resourcesPath, 'app', '_resources', 'compact-flow')
  : path.join(app.getAppPath(), 'app', '_resources', 'compact-flow');

// Cada IPC handler se auto-registra com ipcMain.handle ao ser require()
require(path.join(cfDir, 'main', 'ipc', 'analyze'));
require(path.join(cfDir, 'main', 'ipc', 'catalog'));
require(path.join(cfDir, 'main', 'ipc', 'proton'));
require(path.join(cfDir, 'main', 'ipc', 'install'));
require(path.join(cfDir, 'main', 'ipc', 'icon'));
require(path.join(cfDir, 'main', 'ipc', 'logger'));
```

E importar em `src/main/events/index.ts`:
```typescript
import './compact-flow';  // ← adicionar linha
```

---

## FASE 6 — Preload separado

Copiar e adaptar `CompactFlow/preload.js` → `app/_resources/compact-flow/main/preload.js`

O preload do CompactFlow expõe `window.compatflow.*` via `contextBridge`. Esse preload é carregado **apenas** na janela do CompactFlow (não interfere no preload do Makai Forger).

**Modificações necessárias:**

Os IPCs agora usam `ipcRenderer.invoke()` e `ipcRenderer.on()` como antes. Mas os canais de evento (main → renderer) como `install-log` e `file-opened` precisam ser roteados para a janela correta.

No CompactFlow integrado, quando a bridge script envia logs via stderr, o IPC handler em `main/ipc/install.js` precisa saber enviar para a **CompactFlow window**, não para a Main Window.

**Solução:** O `compact-flow-window.ts` guarda a referência da janela. O IPC handler pode obter essa referência via WindowManager.

---

## FASE 7 — Window creation (compact-flow-window.ts)

Criar `src/main/services/window-manager/compact-flow-window.ts`:

```typescript
import { BrowserWindow, app, screen } from 'electron';
import path from 'node:path';
import type { WindowManager } from '../window-manager';

const WINDOW_WIDTH = 520;
const WINDOW_HEIGHT = 440;

export function createCompactFlowWindow(wm: typeof WindowManager) {
  if (wm.compactFlowWindow) {
    wm.compactFlowWindow.focus();
    return;
  }

  const display = screen.getPrimaryDisplay();
  const { width: displayWidth, height: displayHeight } = display.bounds;
  const x = Math.round((displayWidth - WINDOW_WIDTH) / 2);
  const y = Math.round((displayHeight - WINDOW_HEIGHT) / 2);

  const cfDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app', '_resources', 'compact-flow')
    : path.join(app.getAppPath(), 'app', '_resources', 'compact-flow');

  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x, y,
    resizable: false,
    maximizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(cfDir, 'main', 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  win.loadFile(path.join(cfDir, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { wm.compactFlowWindow = null; });

  wm.compactFlowWindow = win;
}
```

Adicionar no WindowManager (`window-manager.ts`):
```typescript
static compactFlowWindow: Electron.BrowserWindow | null = null;
static openCompactFlowWindow() {
  createCompactFlowWindow(WindowManager);
}
```

---

## FASE 8 — Renderer (cópia + small adaptations)

Copiar do CompactFlow:
- `CompactFlow/renderer/` → `app/_resources/compact-flow/renderer/`

**Modificações possivelmente necessárias:**

1. **index.html**: Verificar se os paths dos scripts (src="app.js", etc.) continuam funcionando. Como são relativos ao mesmo diretório, sim.
2. **app.js**: O evento `window.compatflow.onFileOpened` — verificar se o canal de segunda instância funciona. No integrado, quando o usuário clica num .exe no sistema, o Makai Forger recebe o deep link e passa para a CompactFlow window.

---

## FASE 9 — Launcher + Script de instalação

### start-makaiforge.sh — Adicionar opção 3

```bash
echo "3 - Instalar CompactFlow (copiar do CompactFlow original)"
```

Implementação:
```bash
3)
  echo "Instalando CompactFlow..."
  node scripts/install-compactflow.cjs
  echo "CompactFlow instalado. Use a opção 1 para testar."
  ;;
```

### scripts/install-compactflow.cjs

Script Node.js que:
1. Lê caminhos: `COMPACTFLOW_SRC` (do CompactFlow original), `DEST` (app/_resources/compact-flow/)
2. Copia arquivos usando `fs.cp` ou `tar`:
   - `bridge/`, `core/`, `data/`, `scripts/`, `assets/`, `renderer/`, `main/`
3. Preserva CompactFlow original (cópia, não move)
4. Cria `.compactflow-installed` como flag no projeto

---

## FASE 10 — Packaging (Deb, AppImage, Snap, Flatpak)

### electron-builder.yml — Incluir CompactFlow no build

```yaml
extraResources:
  - from: "app/_resources/compact-flow"
    to: "app/_resources/compact-flow"
    filter:
      - "**/*"
```

### Pós-instalação (Deb/RPM)

No `electron-builder.yml`:
```yaml
linux:
  desktop:
    Actions:
      - id: "compact-flow"
        label: "Abrir com CompactFlow"
        exec: "/opt/makai-forger/makaiforge --compact-flow %f"
afterInstall: "app/_resources/compact-flow/scripts/install-integration.sh --system"
```

### Flatpak

Criar `app/_resources/compact-flow/scripts/flatpak-integration.sh`:
```bash
#!/bin/bash
# Roda fora do sandbox via flatpak-spawn --host
flatpak-spawn --host xdg-mime default makaiforge.desktop \
  application/vnd.microsoft.portable-executable
flatpak-spawn --host update-desktop-database ~/.local/share/applications
```

### Snap

Criar `app/_resources/compact-flow/scripts/snap-integration.sh`:
```bash
#!/bin/bash
snapctl set compact-flow-installed=true
# MIME associations via xdg-mime
```

---

## Resumo do que vai em `src/` vs `app/`

| Componente | Onde fica | Por quê |
|---|---|---|
| BrowserWindow creation | `src/main/services/window-manager/compact-flow-window.ts` | Usa `BrowserWindow`, `screen` do Electron |
| IPC registration | `src/main/events/compact-flow/index.ts` | Importado por `events/index.ts` (compilado) |
| WindowManager property | `src/main/services/window-manager.ts` | Referência estática da janela |
| IPC handlers | `app/_resources/compact-flow/main/ipc/*.js` | Lógica pura, sem TypeScript |
| Preload | `app/_resources/compact-flow/main/preload.js` | Carregado pela janela em runtime |
| Bridge scripts | `app/_resources/compact-flow/bridge/` | Subprocessos Node.js |
| Core logic | `app/_resources/compact-flow/core/` | Zero dependência de Electron |
| Data | `app/_resources/compact-flow/data/` | JSON puro |
| Scripts de sistema | `app/_resources/compact-flow/scripts/` | Shell scripts para instalação |
| Assets | `app/_resources/compact-flow/assets/` | PNG, SVG |
| Renderer UI | `app/_resources/compact-flow/renderer/` | HTML/JS/CSS vanilla |

---

## Próximos passos (o que fazer agora)

1. Revisar este plano — você me diz o que aprova, o que quer mudar
2. Após sua aprovação, começo pela **Fase 0** (estrutura + install-compactflow.cjs)
3. Depois executo `scripts/install-compactflow.cjs` para copiar tudo do CompactFlow
4. Sigo as fases sequencialmente

Quer ajustar alguma coisa antes de eu começar a implementar?
