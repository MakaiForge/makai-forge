# IPC Handlers — Mapa Completo

## Legenda
- ✅ **Vivo** — Registrado no IPC e chamado pelo renderer
- 💀 **Morto** — Registrado no IPC mas NUNCA chamado pelo renderer
- ⚡ **Externo** — Registrado em outro módulo (fora de `events/mods/`)
- 🧩 **Service-only** — Função exportada, chamada direta (sem IPC)

---

## 36 Handlers em `events/mods/` (11 arquivos)

### mod-deploy.ts (4 handlers, 2 vivos)

| Handler | Status | Quem chama | Notas |
|---------|--------|-----------|-------|
| `extractArchive` | 🧩 Service-only | `installModFromArchive` handler chama `ModDeployService.extractArchive()` direto | Não precisa ser IPC |
| `deployMods` | ✅ Vivo | `useDeploy.ts:15` | `window.electron.deployMods()` |
| `restoreMods` | 💀 Morto | Ninguém | Pode remover |
| `installModFromArchive` | ✅ Vivo | `useMods.ts:91`, `ModManager.tsx:54` | `window.electron.installModFromArchive()` |

### mod-storage.ts (3 handlers, 2 vivos)

| Handler | Status | Quem chama | Notas |
|---------|--------|-----------|-------|
| `modsStoreGet` | ✅ Vivo | `useMods.ts:17`, `useProfiles.ts:12` | `window.electron.modsStore.get()` |
| `modsStorePut` | ✅ Vivo | `useMods.ts:51`, `useProfiles.ts:23,31` | `window.electron.modsStore.put()` |
| `modsStoreValues` | 💀 Morto | Ninguém na `pages/mods/` | Pode remover |

### mod-fomod.ts (2 handlers, 2 vivos)

| Handler | Status | Quem chama | Notas |
|---------|--------|-----------|-------|
| `parseFomod` | ✅ Vivo | `useFomod.ts:35` | `window.electron.parseFomod()` |
| `installFomod` | ✅ Vivo | `useFomod.ts:102` | `window.electron.installFomod()` |

### mod-proton.ts (3 handlers)

| Handler | Status | Quem chama | Notas |
|---------|--------|-----------|-------|
| `preparePrefix` | ✅ Vivo (cadeia) | `setupProtonEnvironment` chama `ProtonfixService.preparePrefix()` direto | Service-only na prática |
| `getGameProtonInfo` | ✅ Vivo | `useProtonConfig.ts:53` | `window.electron.getGameProtonInfo()` |
| `setupProtonEnvironment` | ✅ Vivo | `useProtonConfig.ts:107` | `window.electron.setupProtonEnvironment()` |

### mod-config.ts (4 handlers, 4 vivos)

| Handler | Status | Quem chama | Notas |
|---------|--------|-----------|-------|
| `saveGameConfig` | ✅ Vivo | `useGameConfig.ts:52,69` | |
| `getGameConfig` | ✅ Vivo | `useGameConfig.ts:42`, `useRightPanel.ts:49` | |
| `removeMod` | ✅ Vivo | `useMods.ts:79` | |
| `listGameConfigs` | ✅ Vivo | `useGameConfig.ts:26` | |

### mod-conflicts.ts (1 handler, 1 vivo)

| Handler | Status | Quem chama |
|---------|--------|-----------|
| `detectConflicts` | ✅ Vivo | `useDeploy.ts:28` |

### mod-bridge.ts (8 handlers, 3 vivos + 5 mortos)

| Handler | Status | Quem chama | Notas |
|---------|--------|-----------|-------|
| `modBridgeListGames` | ✅ Vivo | `useGameConfig.ts:17` | Bridge → Python list_games |
| `modBridgeDeploy` | 💀 Morto | Nunca chamado | Bridge stub "requires Amethyst" |
| `modBridgeRestore` | 💀 Morto | Nunca chamado | Bridge stub |
| `modBridgeFomodParse` | 💀 Morto | Nunca chamado | Substituído por `parseFomod` TS |
| `modBridgeFomodInstall` | 💀 Morto | Nunca chamado | Substituído por `installFomod` TS |
| `modBridgeLog` | ✅ Vivo | `useModLog.ts:8` | |
| `modBridgeLootSort` | 💀 Morto | Nunca chamado | LOOT não tem no Linux |
| `modBridgeDiscoverGames` | ✅ Vivo | `useGameConfig.ts:65` | Bridge → Python discover_games |

### mod-media.ts (5 handlers, 5 vivos)

| Handler | Status | Quem chama |
|---------|--------|-----------|
| `listModFiles` | ✅ Vivo | `useRightPanel.ts:23` |
| `listDataFolder` | ✅ Vivo | `useRightPanel.ts:52` |
| `readModFile` | ✅ Vivo | `useMedia.ts:14,54` |
| `checkModsMedia` | ✅ Vivo | `useMods.ts:24` |
| `scanModFolder` | ✅ Vivo | `useMedia.ts:23,52` |

### mod-ini.ts (2 handlers, 1 vivo + 1 morto)

| Handler | Status | Quem chama |
|---------|--------|-----------|
| `listIniFiles` | ✅ Vivo | `useRightPanel.ts:37` |
| `readIniFile` | 💀 Morto | Nunca chamado pelo renderer |

### mod-plugins.ts (2 handlers, 2 mortos)

| Handler | Status | Quem chama |
|---------|--------|-----------|
| `readPlugins` | 💀 Morto | Nunca chamado pelo renderer |
| `writePlugins` | 💀 Morto | Nunca chamado pelo renderer |

### mod-detection.ts (2 handlers, 2 mortos)

| Handler | Status | Quem chama |
|---------|--------|-----------|
| `getStagingDir` | 💀 Morto | Nunca chamado (é usado internamente) |
| `detectModType` | 💀 Morto | Nunca chamado pelo renderer |

---

## Handlers Externos (fora de `events/mods/`)

| Handler | Onde está | Quem chama no Mod Manager |
|---------|-----------|--------------------------|
| `showOpenDialog` | `events/misc/show-open-dialog.ts` | `useFomod.ts:120`, `ModManager.tsx:209,217` |
| `getInstalledProtonTools` | `events/proton/index.ts` | `useProtonConfig.ts:36,135` |

---

## Resumo

| Status | Quantidade |
|--------|-----------|
| ✅ Vivos | 22 |
| 💀 Mortos | 14 |
| 🧩 Service-only | 2 (extractArchive, preparePrefix) |
| ⚡ Externos | 2 showOpenDialog, getInstalledProtonTools) |
| **Total registrados** | **36** |
| **Total chamados pelo renderer** | **22** |
