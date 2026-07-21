# Utility Systems

> Sistemas menores mas essenciais: playtime tracking, auto-updater, WebSocket,
> system tray, power save blocker, disk management, Decky plugin, game config
> modal, e wine tools.

---

## 1. Playtime Tracking

### Mapa Mental
```
MAIN LOOP (a cada 2s)
  → watchProcesses()  (process-watcher.ts)
    ├── Busca games jogáveis do armazenamento
    ├── NativeAddon (worker thread) → mapeia processos do SO
    │     ├── Linux: match por nome + CWD + STEAM_COMPAT_DATA_PATH
    │     └── Fallback: detecção de "wine" binary
    │
    ├── onOpenGame(game)     → registra timestamp, esconde launcher, trigger cloud sync
    ├── onTickGame(game)     → acumula delta (2s), salva a cada 3min no armazenamento
    └── onCloseGame(game)    → salva final, sync API, trigger cloud save

IPC: Main → Renderer
  └── "on-games-running"  → GameRunning[] (a cada tick)
```

### Estruturas
```typescript
gamesPlaytime: Map<string, { lastTick, firstTick, lastSyncTick }>
  // key: "shop:objectId"
```

### Achievements
```
resetGameAchievements → STUB (handler vazio)
```

---

## 2. Auto-Updater

### Mapa Mental
```
MAIN LOOP (a cada 50min)
  → UpdateManager.checkForUpdates()
    ├── electron-updater (autoUpdater)
    ├── "update-available" → send "autoUpdaterEvent" ao renderer
    └── "update-downloaded" → send event + native notification

Renderer:
  → AutoUpdateSubHeader
    ├── null: não renderiza nada
    ├── update-available + !autoInstall: link GitHub releases
    └── update-downloaded + autoInstall: botão "Restart & Install"
```

### IPC
| Canal | Direção | Função |
|-------|---------|--------|
| `checkForUpdates` | R → M | Forçar verificação |
| `restartAndInstallUpdate` | R → M | Sair + instalar update |
| `autoUpdaterEvent` | M → R | Status do update |

---

## 3. WebSocket System

### Mapa Mental
```
WSClient (ws-client.ts)
  ├── URL: ws://localhost (hardcode)
  ├── Protocolo: Protobuf (Envelope.fromBinary())
  ├── Heartbeat: PING a cada 15s
  ├── Reconexão: backoff exponencial 1s → 30s cap
  │
  └── Dispatch (oneofKind):
        ├── "friendRequest"   → on-sync-friend-requests
        ├── "friendGameSession" → STUB (vazio)
        └── "notification"    → on-sync-notification-count
```

### IPC
| Evento | Payload | Quando |
|--------|---------|--------|
| `on-sync-friend-requests` | `{ friendRequestCount }` | WS friendRequest |
| `on-sync-notification-count` | `{ notificationCount }` | WS notification |

---

## 4. System Tray

```
createSystemTray()
  ├── Ícone: app/_assets/assets/icons/tray-icon.png
  ├── Tooltip: "ProtonFroger"
  ├── Clique: mostra janela principal
  ├── Clique direito: context menu
  │     ├── "Open"
  │     ├── separator
  │     ├── Últimos 6 jogos (lastTimePlayed DESC)
  │     │     └── click → shell.openPath(executablePath)
  │     └── "Quit"
```

---

## 5. Power Save Blocker

```
PowerSaveBlockerManager
  ├── Bloqueia suspensão quando:
  │     ├── Downloads ativos (downloadActive)
  │     └── Jogos de compatibilidade rodando (compatibilityGameActive)
  │
  ├── Sync a cada 20s (main-loop):
  │     ├── DownloadManager.hasActiveDownload()
  │     └── hasRunningCompatibilityGame(gamesPlaytime.keys())
  │
  └── Singleton (classe estática)
```

---

## 6. Disk Management

### IPC
| Canal | Função |
|-------|--------|
| `getDiskFreeSpace(path)` | Retorna `{ free, total }` bytes |
| `checkFolderWritePermission(testPath)` | Testa escrita (cria/deleta arquivo teste) |

---

## 7. Decky Plugin (Steam Deck)

```
DeckyPlugin (decky-plugin.ts)
  ├── Plugin location: ~/homebrew/plugins/ProtonForge
  ├── checkPluginVersion()
  │     ├── Lê package.json do plugin
  │     ├── GET /decky/release → { version, downloadUrl }
  │     └── Compara versões
  │
  └── Instalação:
        ├── downloadPlugin() → ZIP via axios
        ├── extractPlugin() → 7zip
        └── installPlugin() → sudo se necessário (sudo-prompt)
```

### IPC
| Canal | Função |
|-------|--------|
| `getForgerDeckyPluginInfo` | Verificar versão (legacy) |
| `getProtonForgeDeckyPluginInfo` | Verificar versão vs API |
| `installForgerDeckyPlugin` | Instalar (legacy) |
| `installProtonForgeDeckyPlugin` | Instalar via checkPluginVersion |
| `checkHomebrewFolderExists` | Verificar ~/homebrew/plugins |

---

## 8. Game Config Modal

```
GameConfigModal (games/components/game-config-modal.tsx)
  ├── Formulário completo com categorias:
  │     ├── Game: title, executablePath, prefix, runner
  │     ├── Proton: protonVersion, protonPath
  │     ├── Args: gameArgs, prelaunchCommand, postexitCommand
  │     ├── Graphics: resolution, fpsLimit, dxvk, vulkan, vkd3d, fsr, etc.
  │     ├── Performance: esync, fsync, mangoHud, gameMode, etc.
  │     ├── Anti-Cheat: enableEac, enableBattlEye
  │     ├── Virtual Desktop: virtualDesktop, wineDesktop
  │     ├── Libraries: dllOverrides, dlls, winetricks
  │     └── Environment: env (Record<string, string>)
  │
  └── GameConfigService (getSettings/updateSettings)
        └── updateSettings: chama updateLaunchOptions (parcial)
```

---

## 9. Wine Tools Menu

```
WineToolsMenu (games/components/wine-tools-menu/)
  ├── Dropdown com 8 ferramentas:
  │     ├── winetricks → GUI
  │     ├── taskmgr → Task Manager
  │     ├── control → Control Panel
  │     ├── regedit → Registry Editor
  │     ├── winecfg → Wine Configuration
  │     ├── wineconsole → cmd.exe
  │     ├── terminal → bash no dir do prefixo
  │     └── runexe → file picker + executar .exe
  │
  └── WineToolRunner (services/wine-tools/runner.ts)
        ├── Se protonPath: proton/bin/wine64
        └── Se não: /usr/bin/wine64
```

### IPC
| Canal | Parâmetros |
|-------|-----------|
| `runWineTool` | `(shop, objectId, tool: WineTool)` |
| `openGameWinetricks` | `(shop, objectId)` (legacy) |

---

## Main Loop (main-loop.ts)

O app roda 5 loops concorrentes no startup:

| Loop | Intervalo | Função |
|------|-----------|--------|
| `watchProcesses` | 2s | Playtime tracking |
| `watchDownloads` | 2s | Progresso de download |
| `getSeedStatus` | 2s | Status de seeding |
| `checkForUpdates` | 50min | Auto-updater |
| `syncState` (power) | 20s | Power save blocker |

---

## Arquivos Envolvidos

| Sistema | Caminhos |
|---------|----------|
| **Playtime** | `src/main/services/process-watcher.ts`, `native-addon.ts`, `services/library-sync/`, `events/library/reset-game-achievements.ts` |
| **Auto-Updater** | `src/main/services/update-manager.ts`, `events/autoupdater/`, `components/header/auto-update-sub-header.tsx` |
| **WebSocket** | `src/main/services/ws/ws-client.ts`, `events/friend-request.ts`, `events/notification.ts`, `events/friend-game-session.ts` |
| **System Tray** | `src/main/services/system-tray.ts` |
| **Power Save** | `src/main/services/power-save-blocker.ts` |
| **Disk** | `src/main/events/hardware/get-disk-free-space.ts`, `check-folder-write-permission.ts` |
| **Decky Plugin** | `src/main/services/decky-plugin.ts`, `events/misc/get-protonforge-decky-plugin-info.ts`, `install-protonforge-decky-plugin.ts` |
| **Game Config** | `src/renderer/src/pages/games/components/game-config-modal.tsx`, `services/game-config-service.ts` |
| **Wine Tools** | `src/renderer/src/pages/games/components/wine-tools-menu/`, `src/main/services/wine-tools/runner.ts`, `types.ts` |
