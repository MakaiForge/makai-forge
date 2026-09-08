# Auditoria: Electron — Segurança e Configuração

> Data: 2026-08-18
> Escopo: `src/main/`, `src/preload/`, `electron.vite.config.ts`

---

## 1. Problemas Críticos de Segurança

### 🔴 BUG 1: `contextIsolation: false` + `nodeIntegration: true` no Setup Window

**Arquivo:** `src/main/bootstrap.ts:115-118`

```typescript
const setupWin = new BrowserWindow({
  webPreferences: {
    sandbox: false,
    contextIsolation: false,   // ← PERIGOSO
    nodeIntegration: true,     // ← PERIGOSO
  },
});
```

**Risco:** O renderer tem acesso direto ao Node.js. Se o setup window carregar qualquer conteúdo remoto (ou se um atacante injetar script), ele tem acesso total ao sistema de arquivos, execução de comandos, etc.

**Fix:** Usar `contextBridge` + preload, como as outras janelas.

---

### 🔴 BUG 2: `nodeIntegrationInSubFrames: true` na Auth Window

**Arquivo:** `src/main/services/window-manager/auth-window.ts:40`

```typescript
webPreferences: {
  sandbox: false,
  nodeIntegrationInSubFrames: true,  // ← PERIGOSO
},
```

**Risco:** Se o site de auth (external URL) tiver iframes, eles herdam `nodeIntegration`. Um atacante pode injetar um iframe malicioso que executa código Node.js.

**Fix:** Remover `nodeIntegrationInSubFrames`. A auth window não precisa de Node.

---

### 🔴 BUG 3: CSP removido globalmente

**Arquivo:** `src/main/bootstrap.ts:95-103`

```typescript
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  const headers = details.responseHeaders;
  if (headers) {
    delete headers["content-security-policy"];   // ← REMOVE CSP
    delete headers["x-frame-options"];           // ← PERMITE iframe
    callback({ responseHeaders: headers });
  }
});
```

**Risco:** Qualquer site pode ser carregado em iframe dentro do app. XSS em qualquer site afeta o app inteiro.

**Fix:** Manter CSP para o app, remover apenas para domínios permitidos.

---

### 🔴 BUG 4: `--no-sandbox` no Linux

**Arquivo:** `src/main/index.ts:23`

```typescript
if (process.platform === "linux") {
  app.commandLine.appendSwitch("--no-sandbox");
}
```

**Risco:** O sandbox do Chromium é a primeira linha de defesa. Sem ele, vulnerabilidades no renderer comprometem o sistema inteiro.

**Fix:** Remover `--no-sandbox` se possível, ou usar `--no-sandbox` apenas para o setup window.

---

### 🔴 BUG 5: `webviewTag: true` sem sandbox

**Arquivo:** `src/main/services/window-manager.ts:57`

```typescript
webPreferences: {
  preload: ...,
  sandbox: false,
  webviewTag: true,  // ← HABILITA WEBVIEW
},
```

**Risco:** Webviews sem sandbox podem executar código arbitrário. Sites de ROMs maliciosos (emulators.tsx) e qBittorrent (Downloads) usam webviews.

**Fix:** Usar `BrowserView` ou `iframe` com sandbox em vez de `webviewTag`.

---

### 🔴 BUG 6: `sandbox: false` em TODAS as janelas

Todas as 8 janelas do app têm `sandbox: false`:
- Setup window
- Auth window
- Game launcher
- Executable select
- Folder select
- Game log
- Editor window
- CompactFlow window

**Risco:** Nenhuma janela roda isolada. Uma vulnerabilidade em qualquer renderer afeta todas as janelas.

**Fix:** Habilitar `sandbox: true` para janelas que não precisam de Node (auth, game-launcher, executable-select, folder-select, game-log).

---

## 2. Problemas de Configuração

### 🟡 PROBLEMA 7: Preload com 1371 linhas

**Arquivo:** `src/preload/index.ts`

O preload expõe ~200+ funções via `contextBridge.exposeInMainWorld`. Isso:
- Aumenta a superfície de ataque
- Torna difícil auditar o que é exposto
- Poderia ser dividido por módulo

---

### 🟡 PROBLEMA 8: `webviewTag: true` com `partition` inconsistente

**Arquivo:** `app/Downloads/index.tsx:180`

```tsx
<webview
  src="http://localhost:8081"
  style={{ width: "100%", height: "100%" }}
/>
```

O webview do qBittorrent não tem `partition`, então herda a sessão principal. Se o qBittorrent server for comprometido, afeta todos os cookies da sessão.

**Fix:** Adicionar `partition="qbittorrent-webview"` para isolar.

---

### 🟡 PROBLEMA 9: `Access-Control-Allow-Origin: *` para domínios permitidos

**Arquivo:** `src/main/services/window-manager/main-window.ts:82-90`

```typescript
if (isAllowed) {
  responseHeaders["Access-Control-Allow-Origin"] = ["*"];  // ← MUITO ABERTO
}
```

**Risco:** Qualquer script dentro do app pode fazer requests para esses domínios com credenciais. Se o app tiver XSS, atacantes podem roubar dados de contas Steam/GOG.

**Fix:** Usar lista específica de origens em vez de `*`.

---

### 🟢 PROBLEMA 10: `--js-flags --max-old-space-size=384` pode ser pouco

**Arquivo:** `src/main/index.ts:30`

```typescript
app.commandLine.appendSwitch("--js-flags", "--max-old-space-size=384");
```

Para um app com múltiplas janelas, webviews e processos Python, 384MB pode ser pouco. Se o main process atingir o limite, o app crasha.

---

## 3. Resumo

| # | Problema | Severidade | Arquivo |
|---|----------|-----------|---------|
| 1 | `contextIsolation: false` + `nodeIntegration: true` | 🔴 Crítico | bootstrap.ts |
| 2 | `nodeIntegrationInSubFrames: true` | 🔴 Crítico | auth-window.ts |
| 3 | CSP removido globalmente | 🔴 Crítico | bootstrap.ts |
| 4 | `--no-sandbox` no Linux | 🔴 Crítico | index.ts |
| 5 | `webviewTag: true` sem sandbox | 🔴 Crítico | window-manager.ts |
| 6 | `sandbox: false` em todas as janelas | 🔴 Crítico | múltiplos |
| 7 | Preload com 1371 linhas | 🟡 Médio | preload/index.ts |
| 8 | Webview sem partition isolado | 🟡 Médio | Downloads/index.tsx |
| 9 | `CORS-Allow-Origin: *` | 🟡 Médio | main-window.ts |
| 10 | `max-old-space-size=384` pode ser pouco | 🟢 Menor | index.ts |

### Recomendações Prioritárias

1. **Corrigir setup window** — Usar preload em vez de `nodeIntegration: true`
2. **Remover `nodeIntegrationInSubFrames`** da auth window
3. **Restaurar CSP** — Usar CSP restritivo para o app
4. **Habilitar sandbox** em janelas que não precisam de Node
5. **Isolar webviews** com `partition` próprio
6. **Reduzir CORS `*`** para origens específicas
