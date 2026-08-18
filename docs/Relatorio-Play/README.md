# Relatório Completo — Fluxo de Play (Aba Games)

> **Data:** 18/08/2026  
> **Objetivo:** Mapear todo o percurso de um clique em "Play" na aba Games — desde a detecção do jogo, passando por Proton, prefixo, configs, frameworks, SKSE, deploy de mods, até o jogo iniciar.

---

## Índice

1. [Visão Geral do Fluxo](#1-visão-geral-do-fluxo)
2. [Árvore Genealógica Completa](#2-árvore-genealógica-completa)
3. [Fase 0 — Entry Point (modPlayGame)](#3-fase-0--entry-point)
4. [Fase 1 — Detecção do Jogo](#4-fase-1--detecção-do-jogo)
5. [Fase 2 — Proton](#5-fase-2--proton)
6. [Fase 3 — Prefixo Wine](#6-fase-3--prefixo-wine)
7. [Fase 4 — Configs (DLL Overrides + Registry)](#7-fase-4--configs)
8. [Fase 5 — Frameworks e Tools](#8-fase-5--frameworks-e-tools)
9. [Fase 6 — Script Extender (SKSE)](#9-fase-6--script-extender)
10. [Fase 7 — Deploy de Mods](#10-fase-7--deploy-de-mods)
11. [Fase 8 — Launch](#11-fase-8--launch)
12. [Process Watcher — Monitoramento Pós-Launch](#12-process-watcher--monitoramento-pós-launch)
13. [Cloud Sync e Playtime](#13-cloud-sync-e-playtime)
14. [Arquivos Envolvidos](#14-arquivos-envolvidos)
15. [Fluxo de Dados entre Camadas](#15-fluxo-de-dados-entre-camadas)
16. [Pontos de Atenção](#16-pontos-de-atenção)

---

## 1. Visão Geral do Fluxo

```
usuário clica "Play" na aba Games
│
├── [SE gameTime configurado] → playGame() direto (8 steps)
│   ├── Step 0: Scan environment
│   ├── Step 2: Proton
│   ├── Step 3: Prefix
│   ├── Step 4: Configs (DLL overrides, registry, winetricks)
│   ├── Step 5: Frameworks
│   ├── Step 5.5: External Tools
│   ├── Step 6: SKSE
│   └── Step 8: Launch → umu-run
│
└── [SE NÃO configurado] → setupGame() → playGame()
    ├── Seleciona pasta/executável do jogo
    ├── Auto-detecta Proton
    ├── Cria prefixo Wine
    ├── Instala/copiado para prefixo
    └── Seleciona executável → salva config → playGame()
```

### Fluxo Simplificado

```
1. Usuário clica "Play"
   → modPlayGame(gameId, profile, { deployMods })
   → WindowManager.createGameLauncherWindow()

2. Se jogo não configurado:
   → setupGame() → seleção manual de pasta + Proton
   → Cria prefixo + instala jogo
   → Salva config em ModStorageService

3. playGame() — 8 steps sequenciais:
   ├── scanEnvironment() → valida gamePath, prefix, proton
   ├── ensureProton() → busca/baixa Proton recomendado
   ├── ensurePrefix() → cria/valida prefixo Wine
   ├── applyGameConfigs() → DLL overrides, winetricks, registry
   ├── ensureGameFrameworks() → BepInEx, SMAPI, CET, etc.
   ├── ensureGameExternalTools() → tools com downloadUrl
   ├── ensureSkse() → SKSE/F4SE/NVSE
   └── launchGame() → spawn umu-run com o executável

4. Process Watcher monitora:
   → Detecta se o jogo está rodando
   → Conta playtime
   → Sincroniza com API
   → Cloud sync de saves
```

---

## 2. Árvore Genealógica Completa

```
Makai Forge
│
├── ABA GAMES (app/Games/)
│   ├── GameCard → clica "Play"
│   │   └── useGamesPage() :: playGame(game)
│   │       └── window.electron.modPlayGame(gameId, profile, { deployMods })
│   │
│   ├── GameBar (barra inferior)
│   │   ├── ▶️ Play → modPlayGame()
│   │   ├── ⚙️ Config → GameConfigModal
│   │   ├── 🔧 Wine Tools → runWineTool()
│   │   └── 🗑️ Delete → deleteGameWithPrefix()
│   │
│   └── GameConfigModal (10 abas)
│       ├── Geral: título, coleção, favorito
│       ├── Executável: path, argumentos
│       ├── Proton: versão, path
│       ├── Prefixo: wine prefix path
│       ├── DLL Overrides: lista de overrides
│       ├── Winetricks: verbos
│       ├── Registry: registros Bethesda
│       ├── Cloud Save: Ludusavi config
│       ├── Steam: atalhos
│       └── Avançado: MangoHud, GameMode, DXVK, ESYNC, FSYNC
│
├── ENTRY POINT: modPlayGame (play/index.ts)
│   │
│   ├── registerEvent("modPlayGame", handler)
│   │   ├── Separação de responsabilidades:
│   │   │   ├── ABA GAMES: deployMods = false (só inicializar)
│   │   │   └── MOD MANAGER: deployMods = true (inicializar + mods)
│   │   │
│   │   ├── WindowManager.createGameLauncherWindow()
│   │   │   └── Janela de progresso do launch
│   │   │
│   │   ├── sendToWindows() → envia progresso para UI
│   │   │   ├── "mod-launch-progress" → renderer
│   │   │   └── "preflight-progress" → launcher window
│   │   │
│   │   ├── ensureGameConfig(gameId)
│   │   │   ├── Busca config em ModStorageService
│   │   │   ├── Se não tem → migra do gamesStore
│   │   │   └── Retorna config: { gamePath, protonVersion, protonPrefix, stagingDir }
│   │   │
│   │   ├── [Se gamePath não existe]:
│   │   │   └── setupGame() → seleção manual
│   │   │
│   │   └── playGame(gameId, send, profile, deployMods)
│   │       └── (ver Fases 1-8 abaixo)
│   │
│   └── registerEvent("modKillGame", handler)
│       └── killGameProcess() → MakaiRPC.call("kill_game")
│
├── SETUP GAME (play/setup-game.ts)
│   │
│   ├── [Se gamePath não configurado ou não existe]
│   │   │
│   │   ├── dialog.showOpenDialog() → seleciona pasta ou .exe
│   │   │
│   │   ├── Auto-detecta Proton:
│   │   │   ├── ~/.config/makai-forger/compat-tools/compatibilitytools.d/
│   │   │   ├── ~/.steam/steam/compatibilitytools.d/
│   │   │   └── ~/.local/share/Steam/steamapps/common/
│   │   │
│   │   ├── createPrefix() → cria prefixo Wine
│   │   │
│   │   ├── MakaiRPC.call("detect_installer_type") → Python
│   │   │
│   │   ├── [Se INSTALLER]:
│   │   │   ├── installGame() → instala no prefixo
│   │   │   └── pickExecutable() → dialog de seleção
│   │   │
│   │   ├── [Se PORTABLE]:
│   │   │   ├── WindowManager.createFolderSelectWindow()
│   │   │   ├── waitForFolderSelection()
│   │   │   └── pickExecutable() → dialog de seleção
│   │   │
│   │   └── Salva config:
│   │       ├── ModStorageService.put("game:gameId:config", config)
│   │       └── gamesStore.put(gameKey, { executablePath, winePrefixPath, protonPath })
│
├── PLAY GAME (play/play-game.ts) — 8 STEPS
│   │
│   ├── Step 0: SCAN ENVIRONMENT
│   │   └── scanEnvironment({ gameId, autoFix: true })
│   │       ├── Verifica: gamePath, gamePathExists, prefixValid, protonExists
│   │       ├── Se autoFix → corrige problemas automaticamente
│   │       └── Retorna: { ready, errors[], gamePath, prefixPath, ... }
│   │
│   ├── Step 2: PROTON
│   │   └── ensureProton(gameId, send, prefixPath)
│   │       ├── [Se proton_binary salvo] → usa direto
│   │       ├── [Se não] → ProtonRecommendationService.recommend(searchId)
│   │       │   └── Consulta proton_data.db → retorna fork recomendado
│   │       ├── [Se fork é GE e prefixo é Steam] → detecta mismatch
│   │       │   └── Usa Proton Steam compatível ou prefixo separado
│   │       ├── Busca Proton instalado:
│   │       │   ├── getInstalledTools() → lista todos
│   │       │   └── Match por: toolId, nome do fork, versão
│   │       ├── [Se não encontrado] → download:
│   │       │   ├── findToolIdByForkName()
│   │       │   ├── getReleases(toolId)
│   │       │   ├── pickRelease(releases, version)
│   │       │   └── downloadTool({ toolId, release })
│   │       └── Salva: ModStorageService.put("proton_binary", path)
│   │
│   ├── Step 3: PREFIX
│   │   └── ensurePrefix(gameId, prefixPath, protonPath, ...)
│   │       ├── resolvePrefixDir() → verifica user.reg, pfx/user.reg
│   │       ├── isValidPrefix() → user.reg + system.reg + drive_c + dosdevices
│   │       ├── [Se válido E versão Proton mudou]:
│   │       │   ├── [Sem dados de jogo] → recria prefixo
│   │       │   └── [Com dados de jogo] → mantém prefixo (wine atualiza)
│   │       ├── [Se inválido]:
│   │       │   └── createPrefix() → spawn umu-run wineboot -u
│   │       ├── _ensureTrackedFiles() → cria tracked_files
│   │       ├── setProtonVersion() → salva .makai-proton-version
│   │       └── ensureDosDevices() → cria dosdevices/c: → ../drive_c
│   │
│   ├── Step 3b: BRIDGE PREFIX TO STEAM
│   │   └── bridgePrefixToSteam(gameId, prefix, steamAppId, protonName)
│   │       └── Conecta prefixo custom ao Steam (se aplicável)
│   │
│   ├── Step 4: CONFIGS
│   │   └── applyGameConfigs(gameId, gamePath, prefixPath, protonPath, ...)
│   │       │
│   │       ├── DLL Overrides:
│   │       │   ├── mod.getWineDllOverrides() → { d3d9: "builtin", ... }
│   │       │   ├── applyWineDllOverrides() → grava em user.reg
│   │       │   └── verifyDllOverrides() → verifica se foram gravados
│   │       │
│   │       ├── Auto Install Deps (MakaiTricks):
│   │       │   ├── mod.getAutoInstallDeps() → ["vcrun2022", ...]
│   │       │   ├── mod.getWinetricksComponents() → ["d3dx9", ...]
│   │       │   └── MakaiRPC.call("install_makaitricks", { prefix, proton, verbs })
│   │       │
│   │       ├── Bethesda Registry:
│   │       │   ├── mod.seedRegistry() → grava no Wine registry
│   │       │   └── verifyBethesdaRegistry() → verifica em system.reg
│   │       │
│   │       ├── DXVK Config:
│   │       │   └── Cria dxvk.conf (GPL desligado para D3D9 antigo)
│   │       │
│   │       └── My Games (INI/saves):
│   │           └── Cria Documents/My Games/<game>/ no prefixo
│   │               └── Copia INIs do prefixo Steam se disponível
│   │
│   ├── Step 5: FRAMEWORKS
│   │   └── ensureGameFrameworks(gameId, gamePath, send)
│   │       ├── mod.getAutoInstallFrameworks() → [{ name, url, ... }]
│   │       ├── isFrameworkInstalled() → verifica existência
│   │       └── ensureFrameworks() → baixa e instala frameworks
│   │           └── Exemplos: BepInEx, SMAPI, CET, MelonLoader
│   │
│   ├── Step 5.5: EXTERNAL TOOLS
│   │   └── ensureGameExternalTools(gameId, gamePath, send)
│   │       ├── mod.getExternalTools() → [{ name, downloadUrl, ... }]
│   │       ├── isToolInstalled() → verifica existência
│   │       └── ensureExternalTools() → baixa e instala tools
│   │
│   ├── Step 6: SKSE
│   │   └── ensureSkse(gameId, gamePath, send)
│   │       ├── mod.getScriptExtenderRelease() → { loaderName, url, ... }
│   │       ├── [Se existe] → verifica Data/Scripts/
│   │       └── [Se não existe] → downloadSkse()
│   │           └── Verifica Data/Scripts/ (obrigatório para mods SKSE)
│   │
│   ├── Step 7: DEPLOY MODS
│   │   ├── [Se deployMods = false (Aba Games)]:
│   │   │   └── NÃO implanta mods (só inicializar jogo)
│   │   │
│   │   ├── [Se deployMods = true (Mod Manager)]:
│   │   │   ├── ModStorageService.get("game:gameId:profile:Default:modlist")
│   │   │   ├── getDeployFunction(gameId) → deploy do registry
│   │   │   └── deployFn(gameId, gamePath, stagingDir, modlist, profile, prefix)
│   │   │       └── Copia/liga arquivos de mods para o prefixo
│   │   │
│   │   └── [Se sem mods habilitados]:
│   │       └── Log: "Sem mods habilitados — nada a implantar"
│   │
│   └── Step 8: LAUNCH
│       └── launchGame(gameId, gamePath, prefix, steamAppId, ...)
│           │
│           ├── Encontra executável:
│           │   ├── mod.getLaunchExe() → exe específico do jogo
│           │   ├── hasSkse ? sksePath : null
│           │   ├── mod.preferredLaunchExe → exe preferido
│           │   └── findCustomGameExecutable() → scan recursivo
│           │       ├── Busca no gamePath
│           │       ├── Scan recursivo do prefixo (drive_c/)
│           │       └── Busca no gamesStore
│           │
│           ├── buildLaunchEnv() → env vars:
│           │   ├── PROTONPATH
│           │   ├── WINEPREFIX
│           │   ├── STEAM_COMPAT_DATA_PATH (se compatdata)
│           │   ├── STEAM_COMPAT_INSTALL_PATH
│           │   ├── SteamAppId / SteamGameId / GAMEID
│           │   └── envOverrides do módulo
│           │
│           ├── ensureSteamAppIdFile() → cria steam_appid.txt
│           │
│           └── launchWithMakaiRunner() → spawn umu-run
│               ├── umuBinary = app/_resources/binaries/umu-run
│               ├── Env: PROTON_LOG, WINEPREFIX, PROTONPATH, GAMEID
│               └── spawn(detached: true) → processo isolado
│
├── PROCESS WATCHER (process-watcher.ts)
│   │
│   ├── watchProcesses() → chamado a cada 5s pelo main-loop
│   │   ├── NativeAddon.getSystemProcessMap() → lista processos
│   │   ├── Para cada jogo no gamesStore:
│   │   │   ├── Verifica se o processo do executável está rodando
│   │   │   └── [Linux] hasLinuxCompatibilityProcessMatch()
│   │   │       └── Verifica: cwd, name, winePrefix, STEAM_COMPAT_DATA_PATH
│   │   │
│   │   ├── [Se jogo COMECOU a rodar] → onOpenGame()
│   │   │   ├── gamesPlaytime.set(gameKey, { lastTick, firstTick, lastSyncTick })
│   │   │   ├── WindowManager.closeGameLauncherWindow()
│   │   │   ├── hideToTrayOnGameStart → mainWindow.hide()
│   │   │   ├── trackGamePlaytime() → API sync
│   │   │   └── CloudSync.uploadSaveGame() → backup de saves
│   │   │
│   │   ├── [Se jogo CONTINUA rodando] → onTickGame()
│   │   │   ├── Calcula delta de tempo
│   │   │   ├── Atualiza playTimeInMilliseconds
│   │   │   └── A cada 3 min → trackGamePlaytime() (sync API)
│   │   │
│   │   └── [Se jogo PAROU] → onCloseGame()
│   │       ├── Calcula delta final
│   │       ├── Atualiza playTimeInMilliseconds + lastTimePlayed
│   │       ├── trackGamePlaytime() → sync final
│   │       └── CloudSync.uploadSaveGame() → backup final
│   │
│   └── gamesPlaytime Map:
│       └── gameKey → { lastTick, firstTick, lastSyncTick }
│
├── LAUNCH (launch/launch-game.ts)
│   │
│   ├── launchGameDetached() → para fluxo direto (open-game.ts)
│   │   ├── buildUmuEnv() → env vars completas
│   │   ├── spawn(umuBinary, [exePath], { detached: true })
│   │   └── Log em ~/.cache/makai-forge/umu-launch-*.log
│   │
│   └── launchGame() → para fluxo playGame()
│       ├── buildUmuEnv() → env vars completas
│       ├── spawn(umuBinary, [exePath], { stdio: "pipe" })
│       ├── stdout/stderr → onLog callback
│       └── Retorna: { success, pid, method: "umu-run" }
│
└── LAUNCH DIRETO (ForgePipeline/helpers/launch-game.ts)
    │
    └── launchGame(options) → para "Jogar" na aba Games (sem Mod Manager)
        │
        ├── [Se .exe Windows]:
        │   ├── resolveProtonPathForLaunch()
        │   ├── Wine.getEffectivePrefixPath()
        │   ├── checkAndCreateWinePrefix()
        │   ├── cleanupStaleCompatibilityProcesses()
        │   ├── Monta gameEnv:
        │   │   ├── DXVK_ENABLE, DXVK_ASYNC
        │   │   ├── WINEESYNC, WINEFSYNC
        │   │   ├── PROTON_EAC_ENABLE, PROTON_BATTLEYE_ENABLE
        │   │   ├── DOTNET_ROOT
        │   │   └── env personalizada do jogo
        │   └── launchGameDetached()
        │
        └── [Se nativo Linux]:
            └── launchNatively()
                ├── resolveLaunchCommand()
                ├── [Se gamemode] → gamemoderun
                ├── [Se mangohud] → mangohud
                └── spawn() ou shell.openPath()
```

---

## 3. Fase 0 — Entry Point

### 3.1 modPlayGame

Localização: `app/Games/services/game-launcher/play/index.ts`

O evento `modPlayGame` é o entry point para TODOS os plays:

```
window.electron.modPlayGame(gameId, profile, { deployMods })
```

**gameId formato:** `steam:12345` ou `custom:uuid`

**Separação de responsabilidades:**
- **Aba Games**: `deployMods = false` → só inicializa o jogo
- **Mod Manager**: `deployMods = true` → inicializa + implanta mods

> ⚠️ **IMPORTANTE:** Rodar deploy de mods por acidente no play da aba Games já apagou jogos no prefixo (linkAll({}) → removeDeployedLinks destruía os arquivos).

### 3.2 createGameLauncherWindow

Antes de tudo, uma janela de progresso é criada:
```typescript
WindowManager.createGameLauncherWindow(shop, objectId)
```

### 3.3 ensureGameConfig

```
ensureGameConfig(gameId)
│
├── Busca em ModStorageService: `game:${gameId}:config`
│
├── [Se não tem config]:
│   ├── gameId.split(":") → [shop, objectId]
│   ├── gamesStore.get(gameKey)
│   └── Migra: { gamePath, protonVersion, protonPrefix, stagingDir }
│
└── Retorna config
```

### 3.4 sendToWindows

Progresso é enviado para DUAS janelas:
1. **Renderer** → `sender.send("mod-launch-progress", { step, message, status })`
2. **Launcher Window** → `WindowManager.gameLauncherWindow.webContents.send("preflight-progress", ...)`

Mapeamento step → preflight status:
```typescript
const stepToPreflight = {
  scan: "checking",
  proton: "checking",
  prefix: "installing",
  configs: "installing",
  frameworks: "installing",
  tools: "installing",
  skse: "installing",
  deploy: "installing",
  bridge: "installing",
  launch: "complete",
};
```

---

## 4. Fase 1 — Detecção do Jogo

### 4.1 scanEnvironment

Localização: `app/_main/container/core/scanEnvironment` (importado em play-game.ts)

```
scanEnvironment({ gameId, autoFix: true })
│
├── Verifica:
│   ├── gamePath → caminho do executável
│   ├── gamePathExists → se o arquivo existe
│   ├── prefixPath → caminho do prefixo Wine
│   ├── prefixValid → se o prefixo tem user.reg, system.reg, drive_c
│   ├── protonPath → caminho do Proton
│   ├── protonExists → se o Proton está instalado
│   ├── steamAppId → ID do jogo na Steam
│   └── libraryPath → caminho da biblioteca Steam
│
├── [Se autoFix]:
│   └── Tenta corrigir problemas automaticamente
│
└── Retorna: { ready, errors[], gamePath, prefixPath, ... }
```

### 4.2 Bloqueios

```
[Se !env.gamePath]:
  └── return { success: false, error: "Jogo não configurado", failedStep: "detect" }

[Se !env.gamePathExists]:
  └── return { success: false, error: "Caminho não encontrado: ...", failedStep: "detect" }
```

---

## 5. Fase 2 — Proton

### 5.1 ensureProton

Localização: `app/Games/services/game-launcher/play/steps/02-proton.ts`

```
ensureProton(gameId, send, prefixPath)
│
├── [Se proton_binary salvo]:
│   └── Usa direto (ModStorageService.get("proton_binary"))
│
├── [Se não]:
│   ├── ProtonRecommendationService.recommend(searchId)
│   │   └── Consulta proton_data.db → retorna fork recomendado
│   │       ├── primary: { fork, name, version, tierScore }
│   │       └── alternatives: [...]
│   │
│   ├── Detecta mismatch de Proton:
│   │   ├── [Se fork é GE e prefixo é Steam]:
│   │   │   ├── readPrefixVersion() → lê arquivo version
│   │   │   ├── [Se prefixo é Steam e recomendação é GE]:
│   │   │   │   └── findSteamProton() → busca Proton Steam
│   │   │   └── Se não achar → useCustomPrefix = true
│   │   │       └── Usa prefixo SEPARADO para não corromper Steam
│   │   │
│   │   └── [Se não mismatch]:
│   │       └── Continua normalmente
│   │
│   ├── Busca Proton instalado:
│   │   ├── getInstalledTools() → lista todos os Protons
│   │   └── Match por:
│   │       ├── toolId (ex: "proton-ge" matches "ge-proton")
│   │       ├── nome do diretório
│   │       └── versão
│   │
│   ├── [Se encontrado]:
│   │   └── ModStorageService.put("proton_binary", bestMatch.path)
│   │
│   └── [Se não encontrado → download]:
│       ├── findToolIdByForkName({ fork, name })
│       ├── getToolById(toolId) → tool definition
│       ├── getReleases(toolId) → cache em data/releases/
│       ├── pickRelease(releases, version, forkName)
│       │   └── Match: tag_name, versão normalizada
│       └── downloadTool({ toolId, release })
│           ├── downloadFile(url, dest)
│           └── extractArchive(tar.xz/tar.gz/zip)
│               └── Ex: ~/.config/makai-forger/compat-tools/GE-Proton9-7/
│
└── Retorna: { protonPath, useCustomPrefix }
```

---

## 6. Fase 3 — Prefixo Wine

### 6.1 ensurePrefix

Localização: `app/Games/services/game-launcher/play/steps/03-prefix.ts`

```
ensurePrefix(gameId, prefixPath, protonPath, steamAppId, gamePath, libraryPath, send)
│
├── resolvePrefixDir() → encontra dir com user.reg
│   ├── Verifica: prefixPath/user.reg
│   └── Verifica: prefixPath/pfx/user.reg
│
├── [Se válido]:
│   ├── isValidPrefix() → user.reg + system.reg + drive_c + dosdevices
│   │
│   ├── Compara versão do Proton:
│   │   ├── getStoredProtonVersion() → lê .makai-proton-version
│   │   └── currentVersion = path.basename(protonPath)
│   │
│   ├── [Se versão mudou E SEM dados de jogo]:
│   │   ├── fs.rmSync(configuredPfx, { recursive: true })
│   │   └── Recria prefixo
│   │
│   ├── [Se versão mudou E COM dados de jogo]:
│   │   ├── NÃO destrói prefixo
│   │   └── Apenas atualiza marker: setProtonVersion()
│   │
│   └── [Se versão igual]:
│       └── Retorna direto
│
├── [Se inválido]:
│   └── createPrefix() → spawn umu-run wineboot -u
│       ├── Env: WINEPREFIX, PROTONPATH
│       ├── timeout: 120000
│       └── onProgress callback
│
├── _ensureTrackedFiles() → cria tracked_files no compatData
├── setProtonVersion() → salva .makai-proton-version
└── ensureDosDevices() → cria dosdevices/c: → ../drive_c
```

### 6.2 prefixHasGameData

Função crítica que impede deleção acidental:
```typescript
function prefixHasGameData(pfxPath: string): boolean {
  const driveC = path.join(pfxPath, "drive_c");
  for (const entry of fs.readdirSync(driveC)) {
    if (!WINE_SYSTEM_DIRS.has(entry.name)) return true; // Tem algo além do wine
  }
  return false;
}
```

---

## 7. Fase 4 — Configs

### 7.1 applyGameConfigs

Localização: `app/Games/services/game-launcher/play/steps/04-configs.ts`

```
applyGameConfigs(gameId, gamePath, prefixPath, protonPath, send, steamAppId, libraryPath)
│
├── DLL Overrides:
│   ├── mod.getWineDllOverrides() → { "d3d9": "builtin", ... }
│   ├── applyWineDllOverrides(prefixPath, overrides)
│   │   └── Grava em user.reg: [Software\\Wine\\DllOverrides]
│   └── verifyDllOverrides(prefixPath, overrides)
│       └── Verifica se foram gravados corretamente
│
├── Auto Install Deps (MakaiTricks):
│   ├── mod.getAutoInstallDeps() → ["vcrun2022", "d3dx9", ...]
│   ├── mod.getWinetricksComponents() → ["d3dx11_43", ...]
│   └── MakaiRPC.call("install_makaitricks", {
│         prefix_path, proton_path, verbs
│       })
│       └── Python: instala componentes no prefixo
│
├── Bethesda Registry:
│   ├── mod.seedRegistry() → grava registros no Wine
│   │   └── Ex: HKLM\\Software\\Bethesda Softworks\\Skyrim
│   └── verifyBethesdaRegistry() → verifica em system.reg
│       └── Lê system.reg e procura a entrada
│
├── DXVK Config:
│   └── Cria dxvk.conf no gamePath:
│       ├── d3d9.maxAvailableMemory = 4096
│       ├── d3d9.presentInterval = 1
│       ├── dxvk.enableGraphicsPipelineLibrary = False
│       └── dxvk.numCompilerThreads = 2
│
└── My Games (INI/saves):
    ├── Cria Documents/My Games/<gameSubpath>/ no prefixo
    ├── Copia INIs do prefixo Steam se disponível
    └── [Skyrim LE] → borderless fix (previne crash com DXVK)
```

---

## 8. Fase 5 — Frameworks e Tools

### 8.1 ensureGameFrameworks

Localização: `app/Games/services/game-launcher/play/steps/05-frameworks.ts`

```
ensureGameFrameworks(gameId, gamePath, send)
│
├── mod.getAutoInstallFrameworks() → [{ name, url, ... }]
│   └── Exemplos: BepInEx, SMAPI, CET, MelonLoader
│
├── [Se sem frameworks]:
│   └── "Nenhum framework adicional necessário"
│
├── isFrameworkInstalled() → verifica existência
│
├── [Se todos instalados]:
│   └── "Todos os frameworks já instalados"
│
└── ensureFrameworks() → baixa e instala
    └── Para cada framework:
        ├── downloadFile(url, dest)
        └── extractToGamePath()
```

### 8.2 ensureGameExternalTools

Localização: `app/Games/services/game-launcher/play/steps/05.5-external-tools.ts`

```
ensureGameExternalTools(gameId, gamePath, send)
│
├── mod.getExternalTools() → [{ name, downloadUrl, ... }]
│
├── [Se sem tools com download]:
│   └── "Nenhuma tool com download disponível"
│
├── isToolInstalled() → verifica existência
│
└── ensureExternalTools() → baixa e instala
```

---

## 9. Fase 6 — Script Extender

### 9.1 ensureSkse

Localização: `app/Games/services/game-launcher/play/steps/06-skse.ts`

```
ensureSkse(gameId, gamePath, send)
│
├── mod.getScriptExtenderRelease() → { loaderName, url, ... }
│   └── Exemplos:
│       ├── SKSE (Skyrim) → skse64_loader.exe
│       ├── F4SE (Fallout 4) → f4se_loader.exe
│       ├── NVSE (Fallout NV) → nvse_loader.exe
│       └── OBSE (Oblivion) → obse_loader.exe
│
├── [Se sem script extender]:
│   └── "Jogo sem script extender conhecido"
│
├── [Se existe]:
│   ├── Verifica: fs.existsSync(sksePath)
│   └── verifyDataScripts() → verifica Data/Scripts/
│       ├── [Se tem .pex files] → OK
│       └── [Se vazio] → "mods podem não carregar"
│
└── [Se não existe → download]:
    ├── downloadSkse(gameId, gamePath)
    └── verifyDataScripts()
```

---

## 10. Fase 7 — Deploy de Mods

### 10.1 Lógica de Deploy

```
Step 7: DEPLOY MODS
│
├── [Se deployMods = false (Aba Games)]:
│   ├── NÃO implanta mods
│   ├── Log: "Aba Games: sem deploy de mods"
│   └── send("deploy", "Aba Games: sem deploy de mods", "done")
│
├── [Se deployMods = true (Mod Manager)]:
│   ├── ModStorageService.get("game:gameId:profile:Default:modlist")
│   ├── Filtra: enabled && !isSeparator
│   │
│   ├── [Se sem mods habilitados]:
│   │   └── "Sem mods habilitados — nada a implantar"
│   │
│   └── [Se tem mods]:
│       ├── getDeployFunction(gameId) → do game registry
│       └── deployFn(gameId, gamePath, stagingDir, modlist, profile, prefix)
│           ├── Copia arquivos de mods para o prefixo
│           ├── Cria symlinks
│           └── Retorna: { success, log[], error? }
│
└── [Se erro no deploy]:
    └── return { success: false, error, failedStep: "deploy" }
```

---

## 11. Fase 8 — Launch

### 11.1 launchGame (Step 8)

Localização: `app/Games/services/game-launcher/play/steps/07-launch.ts`

```
launchGame(gameId, gamePath, prefixPath, steamAppId, ..., hasSkse, sksePath, protonPath, send)
│
├── Encontra executável:
│   ├── mod.getLaunchExe(gamePath, hasSkse, sksePath)
│   │   └── Função específica do jogo que retorna o exe correto
│   ├── hasSkse ? sksePath : null
│   ├── mod.preferredLaunchExe → exe preferido
│   └── findCustomGameExecutable(gameId, gamePath, prefixPath)
│       ├── Busca no gamePath → readdirSync
│       ├── Scan recursivo do prefixo (drive_c/)
│       │   └── Pula: Program Files, Windows, users, etc.
│       └── Busca no gamesStore → stored.executablePath
│
├── [Se sem executável]:
│   └── "Nenhum executável encontrado"
│
├── buildLaunchEnv() → env vars:
│   ├── PROTONPATH
│   ├── STEAM_COMPAT_DATA_PATH (se compatdata)
│   ├── STEAM_COMPAT_INSTALL_PATH
│   ├── SteamAppId / SteamGameId / GAMEID
│   └── customEnv do módulo
│
├── ensureSteamAppIdFile() → cria steam_appid.txt
│
└── launchWithMakaiRunner() → spawn umu-run
    │
    ├── getUmuBinaryPath():
    │   └── app/_resources/binaries/umu-run
    │
    ├── getPythonBin():
    │   ├── MAKAI_UMU_PYTHON
    │   ├── tools/venv/bin/python
    │   ├── /usr/bin/python3
    │   └── python3
    │
    ├── buildUmuEnv() → env vars completas:
    │   ├── PROTON_LOG=1
    │   ├── WINEPREFIX=<resolvedPrefix>
    │   ├── PROTONPATH=<resolvedProton>
    │   ├── GAMEID=umu-<gameId>
    │   ├── STEAM_COMPAT_INSTALL_PATH
    │   └── Remove: PYTHONHOME, PYTHONPATH, PYTHONSTARTUP, PYTHONOPTIMIZE
    │
    ├── [Se umuBinary existe]:
    │   └── spawn(umuBinary, [exePath], { detached: true })
    │
    └── [Se não existe]:
        └── spawn(pythonBin, [umuBinary, exePath], { detached: true })
```

### 11.2 Lançamento Direto (open-game.ts)

Para o fluxo "Play" na aba Games SEM passar pelo Mod Manager:

```
launchGame(options) → ForgePipeline/helpers/launch-game.ts
│
├── [Se .exe Windows]:
│   ├── resolveProtonPathForLaunch()
│   ├── Wine.getEffectivePrefixPath()
│   ├── checkAndCreateWinePrefix()
│   ├── cleanupStaleCompatibilityProcesses()
│   │   └── NativeAddon.listProcesses() → mata processos Wine antigos
│   ├── Monta gameEnv:
│   │   ├── DXVK_ENABLE, DXVK_ASYNC
│   │   ├── WINEESYNC, WINEFSYNC
│   │   ├── PROTON_EAC_ENABLE, PROTON_BATTLEYE_ENABLE
│   │   ├── DOTNET_ROOT=C:\Program Files\dotnet
│   │   └── env personalizada do jogo
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

## 12. Process Watcher — Monitoramento Pós-Launch

### 12.1 watchProcesses

Localização: `app/Games/services/process-watcher.ts`

Chamado a cada 5 segundos pelo main-loop:
```typescript
wrapInLoop(() => watchProcesses(), 5000);
```

```
watchProcesses()
│
├── Lista todos os jogos no gamesStore
│
├── NativeAddon.getSystemProcessMap()
│   ├── processMap: Map<exeName, Set<path>>
│   ├── winePrefixMap: Map<path, winePrefix>
│   └── linuxProcesses: [{ name, cwd, exe, steamCompatDataPath }]
│
├── Para cada jogo:
│   ├── Verifica se o processo está rodando:
│   │   ├── processMap.get(executable)?.has(executablePath)
│   │   └── [Linux] hasLinuxCompatibilityProcessMatch()
│   │       ├── Verifica: cwd === gamePath
│   │       ├── Verifica: winePrefix === expectedWinePrefix
│   │       └── Verifica: name === executableName
│   │
│   ├── [Se COMECOU a rodar] → onOpenGame()
│   │   ├── gamesPlaytime.set(gameKey, { lastTick, firstTick, lastSyncTick })
│   │   ├── WindowManager.closeGameLauncherWindow()
│   │   ├── hideToTrayOnGameStart → mainWindow.hide()
│   │   ├── trackGamePlaytime() → API sync
│   │   └── CloudSync.uploadSaveGame() → backup de saves
│   │
│   ├── [Se CONTINUA rodando] → onTickGame()
│   │   ├── Calcula delta = now - lastTick
│   │   ├── Atualiza: playTimeInMilliseconds += delta
│   │   ├── Atualiza: lastTimePlayed = new Date()
│   │   └── A cada 3 min → trackGamePlaytime() (sync API)
│   │
│   └── [Se PAROU] → onCloseGame()
│       ├── Calcula delta final
│       ├── Atualiza playTimeInMilliseconds + lastTimePlayed
│       ├── trackGamePlaytime() → sync final
│       └── CloudSync.uploadSaveGame() → backup final
│
└── Envia lista de jogos rodando para UI:
    └── mainWindow.webContents.send("on-games-running", gamesRunning)
```

---

## 13. Cloud Sync e Playtime

### 13.1 Playtime Tracking

```
gamesPlaytime Map:
  "steam:12345" → {
    lastTick: performance.now(),     // último tick
    firstTick: performance.now(),    // início da sessão
    lastSyncTick: performance.now()  // último sync com API
  }
```

**Sync com API (a cada 3 minutos):**
```
trackGamePlaytime(game, deltaToSync, timestamp)
│
├── [Se tem remoteId]:
│   └── PUT /api/games/{remoteId}/playtime
│       └── body: { deltaInMilliseconds }
│
└── [Se NÃO tem remoteId]:
    └── POST /api/games
        └── body: { shop, objectId, title, playTimeInMilliseconds }
```

### 13.2 Cloud Sync

```
CloudSync.uploadSaveGame(objectId, shop, savePath, label)
│
├── Encontra saves do jogo:
│   └── Ludusavi integration → encontra pastas de save
│
├── Comprime saves:
│   └── .tar.gz com timestamp
│
└── Upload para cloud:
    └── PUT /api/saves/{objectId}/{label}
```

**Quando sincroniza:**
- Ao abrir o jogo (onOpenGame) → backup inicial
- Ao fechar o jogo (onCloseGame) → backup final
- Se `automaticCloudSync === true`

---

## 14. Arquivos Envolvidos

### 14.1 Renderer (React)

| Arquivo | Função |
|---------|--------|
| `app/Games/index.tsx` | Página principal Games |
| `app/Games/hooks/useGamesPage.ts` | Orquestrador da página |
| `app/Games/components/gamebar/GameBar.tsx` | Barra inferior (Play, Config, etc.) |
| `app/Games/components/modals/` | Delete, Backup, Check-DLLs |

### 14.2 Main Process — Play Flow

| Arquivo | Função |
|---------|--------|
| `app/Games/services/game-launcher/play/index.ts` | **Entry point** (modPlayGame, modKillGame) |
| `app/Games/services/game-launcher/play/play-game.ts` | **Orquestrador** (8 steps) |
| `app/Games/services/game-launcher/play/setup-game.ts` | Setup manual (seleção de pasta + Proton) |
| `app/Games/services/game-launcher/play/steps/01-detect.ts` | Detecção do jogo |
| `app/Games/services/game-launcher/play/steps/02-proton.ts` | Proton (busca/baixa/recomendação) |
| `app/Games/services/game-launcher/play/steps/03-prefix.ts` | Prefixo Wine (criação/validação) |
| `app/Games/services/game-launcher/play/steps/04-configs.ts` | Configs (DLL, registry, winetricks) |
| `app/Games/services/game-launcher/play/steps/05-frameworks.ts` | Frameworks (BepInEx, SMAPI, etc.) |
| `app/Games/services/game-launcher/play/steps/05.5-external-tools.ts` | Tools externas |
| `app/Games/services/game-launcher/play/steps/06-skse.ts` | Script Extender (SKSE, F4SE) |
| `app/Games/services/game-launcher/play/steps/07-launch.ts` | **Launch** (umu-run) |
| `app/Games/services/game-launcher/play/activity-logger.ts` | Logger de atividades |
| `app/Games/services/game-launcher/play/logger.ts` | Logger simples (play.log) |
| `app/Games/services/game-launcher/play/python.ts` | Runner Python CLI |
| `app/Games/services/game-launcher/play/types.ts` | Tipos (PlayResult, SendProgress) |

### 14.3 Main Process — Launch

| Arquivo | Função |
|---------|--------|
| `app/Games/services/game-launcher/launch/launch-game.ts` | **umu-run** (spawn) |
| `app/Games/services/game-launcher/launch/types.ts` | Tipos LaunchOptions, LaunchResult |
| `app/_main/installer-api/ForgePipeline/helpers/launch-game.ts` | Launch direto (sem Mod Manager) |

### 14.4 Main Process — Monitoramento

| Arquivo | Função |
|---------|--------|
| `app/Games/services/process-watcher.ts` | **Process Watcher** (playtime, cloud sync) |
| `app/_main/installer-api/ForgePipeline/services/wine.ts` | Wine prefix helpers |
| `app/_main/installer-api/ForgePipeline/services/umu.ts` | Umu helpers |

### 14.5 Shared/Hooks

| Arquivo | Função |
|---------|--------|
| `app/_shared/hooks/index.ts` | Re-exports de hooks |

---

## 15. Fluxo de Dados entre Camadas

```
┌─────────────────────────────────────────────────────────────┐
│                    RENDERER (React)                          │
│                                                             │
│  useGamesPage() → playGame(game)                            │
│    → window.electron.modPlayGame(gameId, profile, opts)     │
│                                                             │
│  ← on-games-running (lista de jogos rodando)                │
│  ← mod-launch-progress (step, message, status)              │
│  ← preflight-progress (status, detail, percent)             │
│                                                             │
└────────────────────────────┬────────────────────────────────┘
                             │ IPC (invoke)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                  MAIN PROCESS (Electron)                     │
│                                                             │
│  modPlayGame handler                                        │
│    ├── ensureGameConfig() → ModStorageService               │
│    ├── setupGame() → se necessário                          │
│    └── playGame() → 8 steps                                 │
│                                                             │
│  ModStorageService (LevelDB)                                │
│    ├── "proton_binary" → path do Proton                     │
│    ├── "game:steam:12345:config" → gamePath, proton, prefix │
│    └── "game:steam:12345:profile:Default:modlist" → mods    │
│                                                             │
│  gamesStore (LevelDB)                                       │
│    └── key: "steam:12345" → executablePath, protonPath, ... │
│                                                             │
│  ProtonRecommendationService                                │
│    └── recommend(searchId) → { primary, alternatives }      │
│                                                             │
│  MakaiRPC.call(method, params) ──────────────────────┐      │
│                                                       │      │
│  process-watcher.ts → watchProcesses()                │      │
│    ├── NativeAddon.getSystemProcessMap()              │      │
│    ├── gamesPlaytime Map                              │      │
│    └── CloudSync.uploadSaveGame()                     │      │
│                                                       │      │
└───────────────────────────────────────────────────────│──────┘
                                                        │ JSON-lines
                                                        ▼
┌─────────────────────────────────────────────────────────────┐
│                     PYTHON (server.py)                       │
│                                                             │
│  install_makaitricks({ prefix, proton, verbs })             │
│  kill_game({})                                              │
│  detect_installer_type({ source_path })                     │
│  copy_to_prefix({ source_path, prefix_path })               │
│  scan_prefix_for_exes({ prefix_path })                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 16. Pontos de Atenção

### 16.1 Jogo não inicia
- Verificar se `executablePath` está configurado no gamesStore
- Verificar se o Proton está acessível
- Verificar logs: `~/.config/makai-forger/logs/play.log`

### 16.2 Prefixo corrompido
- **NUNCA** deletar prefixo que contém dados de jogo
- `prefixHasGameData()` verifica se tem algo além do wine
- Se versão do Proton mudou com dados de jogo → mantém prefixo

### 16.3 Deploy de mods apaga jogo
- **Aba Games**: `deployMods = false` → NUNCA implanta mods
- **Mod Manager**: `deployMods = true` → implanta mods
- O bug antigo: `linkAll({}) → removeDeployedLinks` destruía arquivos

### 16.4 Process Watcher não detecta jogo
- Verificar se `executablePath` está correto
- Verificar se o processo está no `processMap`
- Linux: verifica `cwd`, `name`, `winePrefix`

### 16.5 SKSE não encontrado
- Verificar se `Data/Scripts/` existe
- Verificar se `.pex` files estão presentes
- Sem SKSE → mods SKSE não funcionarão

### 16.6 Proton mismatch
- Se prefixo é Steam e recomendação é GE → detecta mismatch
- Usa Proton Steam compatível ou prefixo separado
- Prefixo custom: NÃO define `STEAM_COMPAT_DATA_PATH`
