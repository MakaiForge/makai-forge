# Game Launcher (Gamebar)

> Janela de inicialização que aparece quando o usuário clica "Jogar".
> Exibe capa do jogo, status de carregamento, versão do Proton e tempo de jogo.

---

## Mapa Mental

```
LAUNCH GAME
  │
  ├── 1. OPEN GAME
  │     IPC: window.electron.openGame(shop, objectId, executablePath)
  │     → src/main/events/library/open-game.ts
  │     → chama launchGame()
  │
  ├── 2. launchGame()
  │     → src/main/helpers/launch-game.ts
  │     │
  │     ├── 2.1 Parseia executável
│   ├── 2.2 Busca jogo no armazenamento
  │     ├── 2.3 Verifica Mangohud/Gamemode
│   ├── 2.4 Salva executablePath no armazenamento
  │     │
  │     ├── 2.5 CRIA JANELA DO LAUNCHER ← ★ ISSO É A GAMEBAR ★
  │     │     WindowManager.createGameLauncherWindow(shop, objectId)
  │     │     → src/main/services/window-manager.ts:371
  │     │     → Janela 550×320, centralizada, sem borda, sem maximizar
  │     │     → Carrega: /game-launcher?shop=…&objectId=…
  │     │
  │     ├── 2.6 Aguarda 2s (janela inicializar)
  │     │
  │     ├── 2.7 Linux + .exe?
  │     │     ├── Resolve protonPath (jogo → preferências → null)
  │     │     ├── Resolve winePrefixPath
  │     │     ├── Cria prefixo se não existir
  │     │     ├── Limpa processos stale do prefixo
  │     │     ├── Monta env vars do jogo (dxvk, esync, fsync, eac, battleye)
  │     │     └── Umu.launchExecutable() ← tenta Proton
  │     │           ├── Falhou? → launchWithWine() ← fallback Wine
  │     │           └── Falhou? → launchNatively() ← fallback nativo
  │     │
  │     └── 2.8 Windows/Mac ou não-.exe?
  │           └── launchNatively() ← execução direta
  │
  ├── 3. GAME LAUNCHER WINDOW (RENDERIZADOR)
  │     → src/renderer/src/pages/game-launcher/game-launcher.tsx
  │     │
  │     ├── 3.1 Carrega dados do jogo (getGameByObjectId)
  │     ├── 3.2 Carrega assets (getGameAssets)
  │     ├── 3.3 Carrega imagem de capa via proxy (getImageDataUrl)
  │     ├── 3.4 Extrai cor dominante da capa (color.js → gradient)
  │     ├── 3.5 Mostra Proton version (getGameLaunchProtonVersion)
  │     ├── 3.6 Mostra preflight status (onPreflightProgress)
  │     └── 3.7 Auto-close timer: 5s após preflight completo
  │
  └── 4. PROCESS WATCHER
        → src/main/services/process-watcher.ts:280
        ├── Detecta que o jogo começou a rodar
        ├── Fecha Game Launcher window
        └── (Opcional) Minimiza ProtonForge pra bandeja
```

---

## Fluxo de Execução Detalhado

### 1. Abertura do Jogo

```
Usuário clica "Jogar"
       │
       ▼
window.electron.openGame(shop, objectId, executablePath, launchOptions)
       │
       ▼  [IPC invoke]
src/main/events/library/open-game.ts
       │
       ▼  chama
src/main/helpers/launch-game.ts :: launchGame(options)
```

**Arquivo:** `src/main/helpers/launch-game.ts`
**Evento IPC:** `openGame`

### 2. launchGame() — Passo a Passo

#### 2.1 Parse do executável
```typescript
const parsedPath = parseExecutablePath(executablePath)
// src/main/events/helpers/parse-executable-path.ts
// Normaliza caminho, resolve symlinks
```

#### 2.2 Carrega dados do jogo
```typescript
const gameKey = storeKeys.game(shop, objectId)
const game = await gamesStore.get(gameKey)
// Busca no armazenamento: protonPath, winePrefixPath, configs
```

#### 2.3 Mangohud e Gamemode
```typescript
const useMangohud = (preferences || game)?.autoRunMangohud && isMangohudAvailable()
const useGamemode = (preferences || game)?.autoRunGamemode && isGamemodeAvailable()
```

#### 2.4 Cria a janela do Game Launcher
```typescript
await WindowManager.createGameLauncherWindow(shop, objectId)
```
**Arquivo:** `src/main/services/window-manager.ts:371-420`

A janela:
- **Tamanho:** 550×320 (centralizada na tela)
- **Sem moldura** (`frame: false`)
- **Sem redimensionar** (`resizable: false`)
- **Sem maximizar/minimizar**
- **Inicia oculta** (`show: false`) — só aparece quando o conteúdo estiver pronto
- URL: `game-launcher?shop=${shop}&objectId=${objectId}`

#### 2.5 Cria prefixo Wine (se necessário)
```typescript
const prefixCreated = await checkAndCreateWinePrefix(winePrefixPath, protonPath)
// Verifica se user.reg + system.reg existem
// Se não: spawn proton/wineboot com WINEPREFIX
// Aguarda até 60×500ms = 30s pela criação
```

#### 2.6 Limpa processos stale
```typescript
await cleanupStaleCompatibilityProcesses(objectId, winePrefixPath)
// Mata processos wine/proton anteriores do mesmo prefixo
```

#### 2.7 Monta env vars do jogo
```typescript
gameEnv.DXVK_ENABLE = "1"           // Se game.dxvk ativado
gameEnv.DXVK_ASYNC = "1"            // Se game.dxvkAsync
gameEnv.WINEESYNC = "1"             // Se game.esync
gameEnv.WINEFSYNC = "1"             // Se game.fsync
gameEnv.PROTON_EAC_ENABLE = "1"     // Se game.enableEac
gameEnv.PROTON_BATTLEYE_ENABLE = "1" // Se game.enableBattlEye
gameEnv[game.env]                   // Env vars customizadas do jogo
```

#### 2.8 Executa via Umu (Proton)
```typescript
await Umu.launchExecutable(parsedPath, [], {
  winePrefixPath,
  protonPath,
  gameId: options.objectId,
  launchOptions,
  useGamemode,
  useMangohud,
  customEnv: gameEnv,
})
```

**`Umu.launchExecutable()`** (`src/main/services/umu.ts:334`):
1. Localiza o binário `umu-run` (ou Python compatível)
2. Monta comando com env vars: `PROTON_LOG=1 GAMEID=umu-{gameId} WINEPREFIX=… PROTONPATH=…`
3. Spawna o processo
4. Se o processo sobreviver **>3 segundos** → considera sucesso, libera a Promise
5. Se o processo morrer em <3s → reject (erro)
6. Log em `~/.config/protonforge/logs/umu.log`

**Fallback chain:**
1. `Umu.launchExecutable()` → Tenta Proton
2. `launchWithWine()` → Tenta Wine nativo
3. `launchNatively()` → Tenta execução direta (Linux nativo)

---

### 3. Game Launcher Renderer

**Arquivo:** `src/renderer/src/pages/game-launcher/game-launcher.tsx` (351 linhas)
**Rota:** `/game-launcher?shop=steam&objectId=1245620`

#### 3.1 Ciclo de Vida

```
Componente monta
       │
       ├── Lê searchParams: shop, objectId
       │
       ├── Busca dados do jogo (getGameByObjectId)
       ├── Busca assets (getGameAssets)
       │
       ├── RESOLVE CAPA:
       │     ├── Se tem coverImageUrl → usa
       │     ├── Se Steam sem capa → fallback Steam CDN
       │     │   https://shared.steamstatic.com/.../library_600x900_2x.jpg
       │     └── Converte via proxy (getImageDataUrl)
       │
       ├── EXTRAI COR (color.js):
       │     └── average(imageUrl, { amount: 1, format: "hex" })
       │         → Usa como cor de fundo (gradient escurecido)
       │
       ├── PREFLIGHT:
       │     └── Escuta onPreflightProgress()
       │         ├── "checking" → "Verificando..."
       │         ├── "downloading" → "Baixando..."
       │         ├── "installing" → "Instalando..."
       │         └── "complete"/"error" → "Iniciando..."
       │
       ├── SHOW WINDOW:
       │     └── Quando imagem + cor estão prontos → showGameLauncherWindow()
       │
       └── AUTO-CLOSE:
             └── 5s após preflight completo → closeGameLauncherWindow()
```

#### 3.2 Layout

```
┌──────────────────────────────────────────────┐
│  ┌──────────┐                                │
│  │          │  TÍTULO DO JOGO                │
│  │  CAPA    │  Iniciando...                   │
│  │  600×900 │                                 │
│  │          │  [Abrir ProtonForge]            │
│  └──────────┘                                 │
│              ⏱ 2.5h   🔧 GE-Proton10-34      │
│  │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│         │
└──────────────────────────────────────────────┘
     ↑ Fundo: gradient da cor dominante da capa
```

#### 3.3 Auto-close Timer

O launcher fecha automaticamente após 5 segundos quando:
1. **Preflight completou** (status `complete` ou `error`), **OU**
2. Preflight nunca iniciou após 3s (timeout)
3. **E** a janela já foi mostrada

No **Linux**, o `process-watcher` não fecha o launcher (linha 281: `if (process.platform !== "linux")`), então o auto-close do renderizador é a única saída.

---

### 4. Process Watcher

**Arquivo:** `src/main/services/process-watcher.ts:280`

Quando o processo do jogo é detectado rodando:

```typescript
// Fecha o launcher (apenas Windows/macOS)
WindowManager.closeGameLauncherWindow()

// Opcional: minimiza ProtonForge pra bandeja
if (userPreferences?.hideToTrayOnGameStart) {
  WindowManager.mainWindow?.hide()
}
```

No Linux, o fechamento é feito pelo **auto-close timer** do próprio renderer (seção 3.3).

---

## Arquivos Envolvidos

| Arquivo | Função |
|---------|--------|
| `src/renderer/src/pages/game-launcher/game-launcher.tsx` | Interface do launcher (React) |
| `src/renderer/src/pages/game-launcher/game-launcher.scss` | Estilos do launcher |
| `src/main/helpers/launch-game.ts` | Orquestrador de lançamento |
| `src/main/services/window-manager.ts` | Criação/controle da janela |
| `src/main/services/umu.ts` | Execução via umu-run (Proton) |
| `src/main/services/process-watcher.ts` | Monitor de processos do jogo |
| `src/main/events/library/open-game.ts` | Handler IPC `openGame` |
| `src/main/events/misc/show-game-launcher-window.ts` | Handler IPC `showGameLauncherWindow` |
| `src/main/events/misc/close-game-launcher-window.ts` | Handler IPC `closeGameLauncherWindow` |
| `src/preload/app.ts` | Expoe APIs IPC para o renderer |

---

## Eventos IPC

| Evento | Direção | Descrição |
|--------|---------|-----------|
| `openGame` | Renderer → Main | Inicia o jogo |
| `showGameLauncherWindow` | Renderer → Main | Exibe a janela do launcher |
| `closeGameLauncherWindow` | Renderer → Main | Fecha a janela do launcher |
| `onPreflightProgress` | Main → Renderer | Progresso das verificações pré-jogo |
| `getGameByObjectId` | Renderer → Main | Dados do jogo |
| `getGameAssets` | Renderer → Main | Assets (capas, screenshots) |
| `getImageDataUrl` | Renderer → Main | Proxy de imagem |
| `getGameLaunchProtonVersion` | Renderer → Main | Versão do Proton do jogo |

---

## Dimensões da Janela

| Propriedade | Valor |
|-------------|-------|
| Largura | 550px |
| Altura | 320px |
| Posição | Centralizada na tela |
| Moldura | Sem (`frame: false`) |
| Redimensionar | Não |
| Maximizar | Não |
| Minimizar | Não |
| Mostrar na taskbar | Sim (`skipTaskbar: false`) |
| Início | Oculta (`show: false`) |
