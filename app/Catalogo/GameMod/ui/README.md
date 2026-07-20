# Mod Manager — Guia do Projeto

**Arquivo principal:** `ModManager.tsx` (299L) — orquestra 11 hooks, 6 modais

---

## Arquitetura Técnica

### Stack
| Camada | Tecnologia |
|--------|-----------|
| GUI | React 18 + TypeScript |
| CSS | SCSS modules com prefixo BEM |
| IPC | `window.electron.*` (tipado em `declaration.d.ts`) |
| Main process | `src/main/events/mods/` — 11 arquivos, 36 handlers IPC |
| Bridge Python | `bridge/bridge.py` — stdin/stdout JSON, só `list_games`/`list_profiles` usados |
| Python API (recomendação) | `src/python/protonforge-api/server.py` — RPC sobre stdin/stdout |

### Fluxo de Dados (3 camadas)

```
[Renderizador React]
  hooks/ (estado + IPC calls)
    ↓ IPC (via window.electron.*)
[Main Process] (events/mods/ — handlers IPC)
    ↓ subprocess stdin/stdout (opcional)
[Python Backend] (bridge/bridge.py — só list_games/list_profiles)
```

### 11 Hooks

| Hook | Linhas | O que gerencia | IPC channels que chama |
|------|--------|---------------|----------------------|
| `useGameConfig` | 99 | games[], selectedGame, stagingDir | `modBridgeListGames`, `modBridgeDiscoverGames`, `listGameConfigs`, `getGameConfig`, `saveGameConfig` |
| `useMods` | 114 | mods[], filteredMods, search, media | `modsStoreGet`, `modsStorePut`, `checkModsMedia`, `removeMod`, `installModFromArchive` |
| `useProfiles` | 44 | profiles[], selectedProfile | `modsStoreGet`, `modsStorePut` |
| `useDeploy` | 64 | deploying, preview, conflicts | `deployMods`, `detectConflicts` |
| `useFomod` | 151 | FOMOD parsing+selections+install | `parseFomod`, `installFomod`, `showOpenDialog` |
| `useProtonConfig` | 178 | proton config, forks, env vars | `getInstalledProtonTools`, `getGameProtonInfo`, `setupProtonEnvironment` |
| `useRightPanel` | 85 | tabs, files, plugins, ini, data | `listModFiles`, `getGameConfig`, `listIniFiles`, `listDataFolder` |
| `useMedia` | 77 | preview images, readmes | `readModFile`, `scanModFolder` |
| `useSplitPane` | 33 | leftWidth (drag) | Nenhum |
| `useModLog` | 12 | log[] | Nenhum (console bridge) |
| `useModManagerShortcuts` | 37 | event listeners | Nenhum |

### IPC Handlers — 36 registrados, 22 vivos, 14 mortos

| Evento | Arquivo | Status |
|--------|---------|--------|
| `deployMods`, `installModFromArchive` | mod-deploy.ts | ✅ Vivo |
| `extractArchive`, `restoreMods` | mod-deploy.ts | 💀 Morto (só chamados via service, não IPC) |
| `modsStoreGet`, `modsStorePut` | mod-storage.ts | ✅ Vivo |
| `modsStoreValues` | mod-storage.ts | 💀 Morto (nunca chamado) |
| `parseFomod`, `installFomod` | mod-fomod.ts | ✅ Vivo |
| `preparePrefix`, `getGameProtonInfo`, `setupProtonEnvironment` | mod-proton.ts | ✅ Vivo (preparePrefix é chamado internamente) |
| `saveGameConfig`, `getGameConfig`, `removeMod`, `listGameConfigs` | mod-config.ts | ✅ Vivo |
| `detectConflicts` | mod-conflicts.ts | ✅ Vivo |
| `modBridgeListGames`, `modBridgeDiscoverGames`, `modBridgeLog` | mod-bridge.ts | ✅ Vivo |
| `modBridgeDeploy`, `modBridgeRestore`, `modBridgeFomodParse`, `modBridgeFomodInstall`, `modBridgeLootSort` | mod-bridge.ts | 💀 Morto (só stubs bridge) |
| `listModFiles`, `listDataFolder`, `readModFile`, `checkModsMedia`, `scanModFolder` | mod-media.ts | ✅ Vivo |
| `listIniFiles`, `readIniFile` | mod-ini.ts | ✅ Vivo (readIniFile nunca chamado) |
| `readPlugins`, `writePlugins` | mod-plugins.ts | 💀 Morto |
| `getStagingDir`, `detectModType` | mod-detection.ts | 💀 Morto |

### Component Tree

```
ModManager (299L)
 ├── ModManagerTopBar (67L)
 ├── ModToolbar (90L)
 ├── ModListPanel (108L)
 │    ├── ModSearchBar (23L)
 │    └── ModRow (65L) × N
 ├── RightPanel (85L)
 │    ├── ModFilesTab + FileTree
 │    ├── PluginListTab + PluginRow
 │    ├── IniEditorTab + FileTree
 │    └── DataFolderTab + FileTree
 ├── StatusBar (24L)
 ├── Modals (6)
 │    ├── GameConfigModal, AddProfileModal, ConflictsModal
 │    ├── DeployConfirmModal, PreviewModal, ReadmeModal
 └── proton-setup/
      ├── RecommendationCard, AlternativeList, ManualSelector
      └── PrefixForm, SetupLog, ResultScreen
```

### Mod Lifecycle

```
1. Discover games   → useGameConfig (bridge list_games + SQLite)
2. Select game      → useGameConfig.setSelectedGame()
3. Select profile   → useProfiles.setSelectedProfile()
4. Load modlist     → useMods.loadMods() (modsStore.get)
5. Install mod      → useMods.installMod() → IPC → ModDeployService
6. Detect FOMOD     → useFomod → IPC → FomodService
7. Configure mod    → useRightPanel (files, plugins, ini)
8. Deploy           → useDeploy → IPC → ModDeployService.deploy()
9. Toggle/Reorder   → useMods.toggleMod() / reorderMods()
```

## Serviços Principais (Main Process)

| Serviço | Arquivo | Linhas | O que faz |
|---------|---------|--------|-----------|
| ModDeployService | `services/mod-deploy-service.ts` | 488 | deploy/restore/extract/detect/inventory |
| FomodService | `services/fomod/` | 3 arquivos | parse XML FOMOD, install |
| ProtonfixService | (em mod-proton.ts) | 612 | prefix, proton detection, DLLs |
| SqliteStore | `services/db/sqlite-store.ts` | genérico | key-value store pra mods |

## Python API (ProtonForge API)

A API Python em `src/python/protonforge-api/` é **completa** mas **não está conectada ao Electron atualmente**:

| Serviço | Arquivo | Funcional? | Conectado? |
|---------|---------|-----------|-----------|
| Recommendation (matched.json) | `api/services/recommendation/` | ✅ Sim | ❌ Não |
| DLLs | `api/services/dlls.py` | ✅ Sim | ❌ Não |
| Prefix (winetricks) | `api/services/prefix/` | ✅ Sim | ❌ Não |
| Proton versions | `api/services/proton_versions.py` | ✅ Sim | ❌ Não |
| Launch args | `api/services/launch_args/` | ✅ Sim | ❌ Não |
| Bridge (list_games) | `bridge/bridge.py` | ✅ Sim | ✅ Sim |
| Bridge (deploy/fomod) | `bridge/bridge.py` | ❌ Stubs | ❌ Não (TS substitui) |

### steam_finder.py

O recém-criado `bridge/Utils/steam_finder.py` permite que o bridge descubra jogos Steam instalados escaneando:
- `libraryfolders.vdf` → bibliotecas Steam
- `appmanifest_*.acf` → jogos instalados por App ID

## Próximos Passos Prioritários

1. Conectar Python API (recommend_proton, create_prefix) ao Electron
2. Remover 14 handlers IPC mortos
3. Dividir `ModDeployService` (488L)
4. Dividir `mod-proton.ts` (612L)
5. Substituir lógica inline de Proton em ModManager.tsx por `useProtonConfig`
