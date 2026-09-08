# Navegador Manager — Arquitetura do Espelhamento (Screencast)

## Visão Geral

O Navegador Manager é uma aba dentro do ModManager que espelha um navegador Chrome headless em tempo real via screencast. O pipeline de dados é:

```
Chrome headless (CDP)
  → Playwright newCDPSession(page) → Page.startScreencast (push-based)
  → ChromeManager._addPage() → session.on("Page.screencastFrame")
  → sendToMainWindow("chrome-screencast-frame") (mainWindow.webContents.send)
  → Preload ipcRenderer.on("chrome-screencast-frame")
  → BrowserViewport → img.src (direct DOM, useEffect isolado)
  → BrowserDebugBar → textContent (direct DOM, useRef)
```

## Bug Crítico: `mainWindow` Null no Envio de Frames

### Sintoma

Frames eram capturados no main process (logs `[screencast] captured X bytes`), mas nunca chegavam ao renderer. O `<img>` ficava preto.

### Diagnóstico

Logs no terminal mostravam:
```
[chrome-events] onScreencastFrame called, dataLen: 69324 mainWindow: false destroyed: undefined
```

O `mainWindow` era `null` no momento do envio do frame, embora funcionasse para `chrome-setup-progress` (enviado antes).

### Causa Raiz

O arquivo `src/main/events/chrome-browser.ts` mantinha uma **cópia local** do `mainWindow`:

```typescript
// ANTES (quebrado)
let mainWindow: BrowserWindow | null = null;

export function setMainWindow(w: BrowserWindow | null): void {
  mainWindow = w;
}
```

O `WindowManager.mainWindow` era setado como `null` no evento `close` da janela (`src/main/services/window-manager.ts:213`). Quando a janela era recriada (ex: `activate` do macOS, `second-instance`), o `WindowManager.mainWindow` recebia a nova janela, mas a **cópia local** em `chrome-browser.ts` continuava `null` porque `setMainWindow()` era chamada apenas em pontos específicos do ciclo de vida, não no recreate.

O setup progress funcionava porque acontecia **antes** do close/recreate. Os frames (capturados num timer) encontravam `mainWindow = null`.

### Solução

Usar `WindowManager.mainWindow` **diretamente** em vez de armazenar uma cópia local. É o padrão usado pelo resto do código (ex: `venv.ts`, `download-sources-checker.ts`).

```typescript
// DEPOIS (corrigido)
import { WindowManager } from "@main/services/window-manager";

function sendToMainWindow(channel: string, ...args: any[]): void {
  if (WindowManager.mainWindow && !WindowManager.mainWindow.isDestroyed()) {
    WindowManager.mainWindow.webContents.send(channel, ...args);
  }
}
```

Isso garante que **sempre** use a referência atual do `WindowManager.mainWindow`, que é atualizada corretamente quando a janela é recriada.

## Bug de Performance: Re-render React a Cada Frame

### Sintoma

A aba do navegador parecia "reconstruindo toda hora" — a tab bar, toolbar e bookmarks bar tremiam visualmente, mesmo sem nada mudar nelas. A fluidez era visivelmente inferior ao projeto original (navegador).

### Diagnóstico

Rastreando a cadeia de eventos de um frame:

1. Frame chega via IPC → `onChromeScreencastFrame` no hook
2. `setFrameCount(c => c + 1)` e `setLastFrameLen(...)` eram chamados
3. Esses são **React state** — forçam o componente `BrowserMirror` inteiro a re-renderizar
4. O re-render do pai propaga pra **todos os filhos**: BrowserTabBar, BrowserToolbar, BrowserBookmarksBar, BrowserFindBar, BrowserViewport, BrowserDebugBar
5. React faz diff de toda a árvore DOM a cada frame (~10-60fps)

### Causa Raiz

Estado React sendo usado para rastrear métricas de depuração (contagem de frames). Toda mudança de estado React ≠ 0 causa re-render do componente e de seus filhos. A 30fps, isso satura a main thread com reconciliação desnecessária.

### Solução

**Isolar o frame counting em um componente autônomo que mexe no DOM diretamente, sem estado React.**

- `useBrowserMirror.ts`: removeu `frameCount`, `lastFrameLen`, e o `useEffect` do `onChromeScreencastFrame`
- `BrowserDebugBar.tsx`: tem seu próprio `useEffect` com `onChromeScreencastFrame`, usa `useRef` para contadores e atualiza o DOM via `textContent` direto
- `BrowserViewport.tsx`: já aplicava frames no DOM via `img.src` dentro de um `useEffect` isolado (sem estado React)

Resultado: **frames causam ZERO re-renders React.** A árvore de componentes fica estável. O DOM é manipulado diretamente apenas nos elementos que precisam mudar.

## Pipeline de Captura

1. `ChromeManager.launch()` → `_setupTabs()` → `_startActiveScreencast()`
2. Tenta `Page.startScreencast` (push-based, via CDP session do Playwright)
   - Formato: JPEG, qualidade 60, resolução 1280x720
   - Frames chegam via evento `Page.screencastFrame` na CDP session
   - Cada frame é reconhecido com `Page.screencastFrameAck` para manter o stream fluindo
3. Se `Page.startScreencast` falhar (Chrome 133+ sem suporte headless), cai em polling:
   - `page.screenshot({ type: "jpeg", quality: 60 })` a cada 100ms
   - Frame é convertido para `Uint8Array` (sem base64)
4. Frame é enviado via callback `_onScreencastFrame` com `{ data, sessionId, tabId, mirrorId }`

## Identificação: mirrorId

Cada instância do `BrowserMirror` recebe uma prop `mirrorId` (ex: `"navegador-manager"`). Esse ID é:

1. Passado para `chromeSetupAndLaunch(mirrorId)` no IPC
2. Armazenado em `ChromeManager.mirrorId` (`manager.ts`)
3. Incluído em cada frame: `{ data, sessionId, tabId, mirrorId: this.mirrorId }`
4. Filtrado no renderer: `if (mirrorId && frame.mirrorId !== mirrorId) return;`

Isso permite que múltiplas abas/componentes recebam apenas os frames destinados a elas.

## Zoom

O zoom usa `Page.setZoomFactor({ zoomFactor })` do CDP — o método correto, que escala apenas o conteúdo sem alterar o viewport.

**Antes (errado):** `Page.setDeviceMetricsOverride` com `width * factor, height * factor, deviceScaleFactor: factor` — isso mudava o viewport inteiro, causando re-layout completo da página e perda do estado de zoom ao redimensionar a janela.

**Depois (correto):** `Page.setZoomFactor({ zoomFactor })` — escala o conteúdo, mantém viewport estável, compatível com resize.

Atalhos:
- Ctrl+Scroll (ou Ctrl++ / Ctrl+-) — zoom step 0.1, range 0.25–5.0
- Ctrl+0 — reset para 1.0

## Modularização

O componente `BrowserMirror.tsx` foi modularizado de 1056 → 142 linhas. A arquitetura atual:

```
BrowserMirror.tsx (orquestrador, ~142 linhas)
  ├── useBrowserMirror.ts (hook com toda lógica, ~279 linhas)
  ├── BrowserDebugBar.tsx (frame counter com refs, sem estado React)
  ├── BrowserTabBar.tsx
  ├── BrowserToolbar.tsx
  ├── BrowserBookmarksBar.tsx
  ├── BrowserFindBar.tsx
  └── BrowserViewport.tsx (renderiza frames + popups + menus)
```

Cada arquivo tem no máximo 300 linhas.

## Arquivos Relevantes

- `src/main/services/chrome-browser/manager.ts` — gerenciamento do Chrome, screencast, navegação
- `src/main/events/chrome-browser.ts` — IPC handlers, `sendToMainWindow()`
- `src/preload/index.ts` — bridge preload
- `src/renderer/src/components/browser-view/` — componentes React
- `docs/arquitetura/navegador-manager.md` — este documento
