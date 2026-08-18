# Árvore Genealógica — Fluxo Play (Quem Chama Quem)

> Mapa de todas as chamadas entre componentes, do clique em Play ao jogo rodando.

---

## 1. Árvore de Início do Play

```
usuário clica "Play" na aba Games
│
└── React: useGamesPage() :: playGame(game)
    │
    └── IPC: window.electron.modPlayGame(gameId, profile, { deployMods })
        │
        └── Main: play/index.ts :: modPlayGame handler
            │
            ├── WindowManager.createGameLauncherWindow(shop, objectId)
            │
            ├── ensureGameConfig(gameId)
            │   ├── ModStorageService.get("game:gameId:config")
            │   ├── [Se não tem] → gamesStore.get(gameKey) → migra
            │   └── Retorna config
            │
            ├── [Se gamePath não existe]:
            │   └── setupGame(gameId, shop, objectId, config, send)
            │       ├── dialog.showOpenDialog() → seleciona pasta
            │       ├── autoDetectProton()
            │       ├── createPrefix()
            │       ├── MakaiRPC.call("detect_installer_type")
            │       ├── [Installer] installGame() + pickExecutable()
            │       ├── [Portable] createFolderSelectWindow() + waitForFolderSelection()
            │       └── Salva config: ModStorageService.put + gamesStore.put
            │
            └── playGame(gameId, send, profile, deployMods)
                └── (ver seção 2)
```

---

## 2. Árvore de playGame() — 8 Steps

```
playGame(gameId, send, profile, deployMods)
│
├── Step 0: SCAN
│   └── scanEnvironment({ gameId, autoFix: true })
│       ├── Verifica: gamePath, prefixValid, protonExists
│       └── Retorna: { ready, errors[], gamePath, prefixPath }
│
├── Step 2: PROTON
│   └── ensureProton(gameId, send, prefixPath)
│       ├── ModStorageService.get("proton_binary")
│       │   └── [Se existe] → usa direto
│       │
│       ├── [Se não]:
│       │   ├── ProtonRecommendationService.recommend(searchId)
│       │   │   └── Python: recommend_proton()
│       │   │
│       │   ├── getInstalledTools()
│       │   │   └── Escaneia diretórios de Proton
│       │   │
│       │   ├── [Se não encontrado]:
│       │   │   ├── findToolIdByForkName()
│       │   │   ├── getReleases(toolId)
│       │   │   ├── pickRelease(releases, version)
│       │   │   └── downloadTool({ toolId, release })
│       │   │
│       │   └── ModStorageService.put("proton_binary", path)
│       │
│       └── Retorna: { protonPath, useCustomPrefix }
│
├── Step 3: PREFIX
│   └── ensurePrefix(gameId, prefixPath, protonPath, ...)
│       ├── resolvePrefixDir()
│       ├── isValidPrefix() → user.reg + system.reg + drive_c + dosdevices
│       │
│       ├── [Se válido]:
│       │   ├── getStoredProtonVersion() → .makai-proton-version
│       │   ├── [Se versão mudou E sem dados]:
│       │   │   └── fs.rmSync() → recria
│       │   ├── [Se versão mudou E com dados]:
│       │   │   └── Mantém prefixo (wine atualiza)
│       │   └── setProtonVersion()
│       │
│       ├── [Se inválido]:
│       │   └── createPrefix() → spawn umu-run wineboot -u
│       │
│       ├── _ensureTrackedFiles()
│       └── ensureDosDevices()
│
├── Step 3b: BRIDGE
│   └── bridgePrefixToSteam(gameId, prefix, steamAppId)
│
├── Step 4: CONFIGS
│   └── applyGameConfigs(gameId, gamePath, prefixPath, protonPath, ...)
│       │
│       ├── DLL Overrides:
│       │   ├── mod.getWineDllOverrides()
│       │   ├── applyWineDllOverrides() → user.reg
│       │   └── verifyDllOverrides()
│       │
│       ├── MakaiTricks:
│       │   ├── mod.getAutoInstallDeps()
│       │   ├── mod.getWinetricksComponents()
│       │   └── MakaiRPC.call("install_makaitricks", ...)
│       │       └── Python: instala componentes
│       │
│       ├── Bethesda Registry:
│       │   ├── mod.seedRegistry() → Wine registry
│       │   └── verifyBethesdaRegistry() → system.reg
│       │
│       ├── DXVK Config:
│       │   └── Cria dxvk.conf
│       │
│       └── My Games:
│           └── Cria Documents/My Games/ + copia INIs
│
├── Step 5: FRAMEWORKS
│   └── ensureGameFrameworks(gameId, gamePath, send)
│       ├── mod.getAutoInstallFrameworks()
│       ├── isFrameworkInstalled()
│       └── ensureFrameworks() → download + install
│
├── Step 5.5: TOOLS
│   └── ensureGameExternalTools(gameId, gamePath, send)
│       ├── mod.getExternalTools()
│       ├── isToolInstalled()
│       └── ensureExternalTools() → download + install
│
├── Step 6: SKSE
│   └── ensureSkse(gameId, gamePath, send)
│       ├── mod.getScriptExtenderRelease()
│       ├── [Se existe] → verifyDataScripts()
│       └── [Se não] → downloadSkse() + verifyDataScripts()
│
├── Step 7: DEPLOY
│   ├── [Se deployMods = false]:
│   │   └── NÃO implanta mods
│   │
│   └── [Se deployMods = true]:
│       ├── ModStorageService.get("game:gameId:profile:Default:modlist")
│       ├── getDeployFunction(gameId)
│       └── deployFn(gameId, gamePath, stagingDir, modlist, profile, prefix)
│
└── Step 8: LAUNCH
    └── launchGame(gameId, gamePath, prefix, steamAppId, ..., protonPath, send)
        │
        ├── Encontra executável:
        │   ├── mod.getLaunchExe()
        │   ├── hasSkse ? sksePath
        │   ├── mod.preferredLaunchExe
        │   └── findCustomGameExecutable()
        │       ├── readdirSync(gamePath)
        │       ├── recursiveExeScan(prefixPath)
        │       └── gamesStore.get(gameId)
        │
        ├── buildLaunchEnv() → env vars
        ├── ensureSteamAppIdFile()
        │
        └── launchWithMakaiRunner()
            │
            ├── getUmuBinaryPath()
            ├── getPythonBin()
            ├── buildUmuEnv()
            │
            └── spawn(umuBinary, [exePath], { detached: true })
                └── Env: PROTON_LOG, WINEPREFIX, PROTONPATH, GAMEID
```

---

## 3. Árvore de Process Watcher

```
main-loop.ts (a cada 5s)
│
└── watchProcesses()
    │
    ├── gamesStore.values().all() → todos os jogos
    │
    ├── NativeAddon.getSystemProcessMap()
    │   ├── processMap: Map<exeName, Set<path>>
    │   ├── winePrefixMap: Map<path, winePrefix>
    │   └── linuxProcesses: [{ name, cwd, exe, steamCompatDataPath }]
    │
    └── Para cada jogo:
        │
        ├── [Verifica se rodando]:
        │   ├── processMap.get(executable)?.has(executablePath)
        │   └── hasLinuxCompatibilityProcessMatch()
        │       ├── cwd === gamePath
        │       ├── winePrefix === expectedWinePrefix
        │       └── name === executableName
        │
        ├── [COMECOU a rodar] → onOpenGame()
        │   ├── gamesPlaytime.set(gameKey, { lastTick, firstTick, lastSyncTick })
        │   ├── WindowManager.closeGameLauncherWindow()
        │   ├── [Se hideToTrayOnGameStart] → mainWindow.hide()
        │   ├── [Se shop === "steam"]:
        │   │   ├── [Se tem remoteId]:
        │   │   │   ├── trackGamePlaytime(game, deltaToSync, timestamp)
        │   │   │   └── gamesStore.put({ unsyncedDelta: 0 })
        │   │   ├── [Se NÃO tem remoteId]:
        │   │   │   └── createGame(game)
        │   │   └── [Se automaticCloudSync]:
        │   │       └── CloudSync.uploadSaveGame()
        │   └── mainWindow.webContents.send("on-games-running", [...])
        │
        ├── [CONTINUA rodando] → onTickGame()
        │   ├── delta = now - lastTick
        │   ├── game.playTimeInMilliseconds += delta
        │   ├── game.lastTimePlayed = new Date()
        │   ├── gamesStore.put(gameKey, updatedGame)
        │   ├── gamesPlaytime.set(gameKey, { ...gamePlaytime, lastTick: now })
        │   │
        │   └── [A cada 3 min]:
        │       ├── [Se tem remoteId]:
        │       │   └── trackGamePlaytime(game, deltaToSync, timestamp)
        │       └── [Se NÃO tem remoteId]:
        │           └── createGame(game)
        │
        └── [PAROU] → onCloseGame()
            ├── delta = now - lastTick
            ├── game.playTimeInMilliseconds += delta
            ├── game.lastTimePlayed = new Date()
            ├── gamesPlaytime.delete(gameKey)
            ├── PowerSaveBlockerManager.markGameClosed(gameKey)
            ├── [Se shop === "steam"]:
            │   ├── [Se automaticCloudSync]:
            │   │   └── CloudSync.uploadSaveGame()
            │   ├── [Se tem remoteId]:
            │   │   └── trackGamePlaytime(game, deltaToSync, timestamp)
            │   └── [Se NÃO tem remoteId]:
            │       └── createGame(game)
            └── mainWindow.webContents.send("on-games-running", [...])
```

---

## 4. Árvore de Launch (umu-run)

```
launchWithMakaiRunner(options)
│   [launch/launch-game.ts]
│
├── getUmuBinaryPath()
│   └── app/_resources/binaries/umu-run
│
├── getPythonBin()
│   ├── MAKAI_UMU_PYTHON
│   ├── tools/venv/bin/python
│   ├── /usr/bin/python3
│   └── python3
│
├── buildUmuEnv()
│   ├── PROTON_LOG=1
│   ├── WINEPREFIX=<resolvedPrefix>
│   ├── PROTONPATH=<resolvedProton>
│   ├── GAMEID=umu-<gameId>
│   ├── STEAM_COMPAT_INSTALL_PATH
│   └── Remove: PYTHONHOME, PYTHONPATH, PYTHONSTARTUP, PYTHONOPTIMIZE
│
├── [Se umuBinary existe]:
│   └── spawn(umuBinary, [exePath], {
│         stdio: ["ignore", "pipe", "pipe"],
│         detached: true,
│         env: spawnEnv
│       })
│       ├── stdout → onLog callback
│       └── stderr → onLog callback
│
└── [Se não existe]:
    └── spawn(pythonBin, [umuBinary, exePath], { ... })
```

---

## 5. Árvore de Lançamento Direto (open-game.ts)

```
launchGame(options)
│   [ForgePipeline/helpers/launch-game.ts]
│
├── parseExecutablePath(executablePath)
├── gamesStore.get(gameKey)
├── db.get(userPreferences)
│
├── [Se .exe Windows]:
│   ├── resolveProtonPathForLaunch(game.protonPath)
│   │   ├── [Se válido] → usa
│   │   └── [Se não] → userPreferences.defaultProtonPath
│   │
│   ├── Wine.getEffectivePrefixPath(game.winePrefixPath, objectId)
│   │
│   ├── checkAndCreateWinePrefix()
│   │
│   ├── cleanupStaleCompatibilityProcesses()
│   │   ├── NativeAddon.listProcesses()
│   │   ├── Filtra: STEAM_COMPAT_DATA_PATH === winePrefix
│   │   └── process.kill(pid, "SIGKILL")
│   │
│   ├── Monta gameEnv:
│   │   ├── DXVK_ENABLE, DXVK_ASYNC
│   │   ├── WINEESYNC, WINEFSYNC
│   │   ├── PROTON_EAC_ENABLE, PROTON_BATTLEYE_ENABLE
│   │   ├── DOTNET_ROOT=C:\Program Files\dotnet
│   │   └── game.env
│   │
│   └── launchGameDetached()
│       └── spawn umu-run com env completo
│
└── [Se nativo Linux]:
    └── launchNatively()
        ├── resolveLaunchCommand()
        ├── [Se gamemode] → gamemoderun
        ├── [Se mangohud] → mangohud
        └── spawn() ou shell.openPath()
```

---

## 6. Mapa de Eventos IPC

| Evento IPC | Arquivo Registrador | Função |
|------------|---------------------|--------|
| `modPlayGame` | `play/index.ts` | Play do jogo |
| `modKillGame` | `play/index.ts` | Mata processo do jogo |
| `openGame` | `open-game.ts` | Play direto (sem Mod Manager) |
| `closeGame` | `close-game.ts` | Fecha jogo |
| `runWineTool` | `run-wine-tool.ts` | Wine Tools |
| `selectGameProtonPath` | `select-game-proton-path.ts` | Seleciona Proton |
| `selectGameWinePrefix` | `select-game-wine-prefix.ts` | Seleciona prefixo |
| `updateGameConfig` | `update-game-config.ts` | Atualiza config |
| `updateLaunchOptions` | `update-launch-options.ts` | Atualiza launch options |
| `checkGameDlls` | `check-game-dlls.ts` | Verifica DLLs |
| `getGameLaunchProtonVersion` | `get-game-launch-proton-version.ts` | Versão do Proton |
| `installLibrary` | `install-library.ts` | Instala DLLs |

---

## 7. Mapa de Store Keys

```
ModStorageService (LevelDB)
├── "proton_binary"
│   └── path do Proton configurado
│       Ex: "/home/user/.config/makai-forger/compat-tools/GE-Proton9-7/"
│
├── "game:steam:12345:config"
│   └── {
│         gamePath: "/home/user/.steam/steam/steamapps/common/Skyrim/",
│         protonVersion: "/home/user/.config/makai-forger/compat-tools/GE-Proton9-7/",
│         protonPrefix: "/home/user/Games/Makai-forger/skyrim/",
│         stagingDir: "/home/user/Games/Mods/steam:12345/staging"
│       }
│
└── "game:steam:12345:profile:Default:modlist"
    └── [{ name, enabled, isSeparator, ... }]

gamesStore (LevelDB)
└── key: "steam:12345"
    └── {
          executablePath: "/home/user/.steam/.../SkyrimSE.exe",
          winePrefixPath: "/home/user/Games/Makai-forger/skyrim/",
          protonPath: "/home/user/.config/makai-forger/compat-tools/GE-Proton9-7/",
          protonVersion: "GE-Proton9-7",
          playTimeInMilliseconds: 3600000,
          lastTimePlayed: "2026-08-18T10:00:00Z",
          autoRunMangohud: true,
          autoRunGamemode: false,
          dxvk: true,
          esync: true,
          fsync: true,
          enableEac: false,
          enableBattlEye: false,
          env: { "DXVK_HUD": "fps" }
        }

gamesPlaytime Map (runtime)
└── "steam:12345" → {
      lastTick: 1692345678000,
      firstTick: 1692345678000,
      lastSyncTick: 1692345678000
    }
```

---

## 8. Resumo dos Estados do Jogo

```
                    ┌─────────────┐
                    │  CONFIGURAR │
                    │  (setupGame)│
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  PLAYING    │ ← gamesPlaytime.has(gameKey)
                    │  (rodando)  │    onOpenGame() → session-open
                    │             │    process-watcher detecta
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │ TICK     │ │ CLOSE    │ │ KILL     │
       │ (cada 5s)│ │ (fecha)  │ │ (mata)   │
       │ onTick   │ │ onClose  │ │ killGame │
       └──────────┘ └────┬─────┘ └──────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │  IDLE        │ ← gamesPlaytime.delete(gameKey)
                  │  (parado)    │    playTimeInMilliseconds atualizado
                  └──────────────┘    lastTimePlayed atualizado
                                       CloudSync.uploadSaveGame()
```
