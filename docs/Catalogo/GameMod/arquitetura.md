# Mod Manager — Arquitetura Modular

> Makai Forge · Referência: Amethyst, ModSanity, MO2 Linux Installer  
> ~12.200 linhas · 155+ arquivos · 39 IPC handlers · 3 camadas (Render/Electron/Python)

---

## 1. Filosofia de Projeto

Cada responsabilidade tem **um arquivo, uma pasta, um hook**. Componentes da UI seguem o padrão `Nome/Nome/_layout.scss` — o SCSS mora ao lado do TSX que o usa. Nenhum estilo global, nenhum CSS vazando.

```
ComponentName/
├── index.tsx              ← re-export
├── ComponentName.tsx      ← lógica + JSX
├── ComponentName.scss     ← entry (1 linha: @use "./ComponentName" as *;)
└── ComponentName/
    └── _layout.scss       ← estilos reais do componente
```

---

## 2. Árvore Completa — Renderer (`src/renderer/src/pages/mods/`)

### Entry Point

```
ModManager.tsx          (290L) — orquestrador principal
ModManager.scss          (1L) — @use "./_layout/layout"
```

### Layout Partials (10 arquivos, 972L)

```
_layout/
├── _layout.scss         (61L)   — grid principal (.mod-manager)
├── _topbar.scss         (121L)  — ModManagerTopBar
├── _modlist.scss        (121L)  — ModListPanel
├── _right-panel.scss    (161L)  — RightPanel + abas
├── _modals.scss         (144L)  — todos os modais
├── _statusbar.scss      (38L)   — StatusBar
├── _proton-setup.scss   (42L)   — wizard Proton
├── _collections.scss    (144L)  — collections (futuro)
├── _fomod-misc.scss     (95L)   — FomodDialog
└── _downloads.scss      (45L)   — downloads (futuro)
```

### Types (5 arquivos, 217L)

```
types/
├── index.ts             (5L)    — re-export
├── mod.types.ts         (79L)   — ModlistEntry, DeployResult, GameConfig, Profile
├── fomod.types.ts       (36L)   — FomodConfig, FomodStep, FomodGroup, FomodPlugin
├── proton.types.ts      (75L)   — ProtonTool, GameProtonInfo, PrefixInfo
└── bridge.types.ts      (22L)   — BridgeCommand, BridgeResponse
```

### Utils (5 arquivos, 104L)

```
utils/
├── index.ts             (4L)    — re-export
├── bridge-helpers.ts    (11L)   — invokeBridge()
├── constants.ts         (5L)    — GAME_TYPES, BETTHESDA_GAME_TYPES
├── file-utils.ts        (49L)   — formatBytes, sanitizeFilename, parseGamePath
└── mod-helpers.ts       (35L)   — sortModsByPriority, filterModsBySearch
```

### Hooks (14 hooks em 4 grupos, ~1.227L)

```
hooks/
├── index.ts
│
├── config/                              ← configuração do jogo
│   ├── index.ts                    (3L)
│   ├── useGameConfig.ts            (99L)  — carrega/salva GameConfig
│   ├── useProtonConfig.ts          (178L) — detecta Proton, prefixo, Wine
│   └── useRightPanel.ts            (87L)  — aba ativa + path INI
│
├── deploy/                              ← deploy, FOMOD
│   ├── index.ts                    (2L)
│   ├── useDeploy.ts                (66L)  — deploy/restore mods (TS local)
│   └── useFomod.ts                 (182L) — parse + install FOMOD
│
├── mods/                                ← mods, plugins, instalação
│   ├── index.ts                    (5L)
│   ├── useMods.ts                  (114L) — lista, seleção, reordenação
│   ├── usePlugins.ts               (74L) — plugins list + enable/disable
│   ├── useInstallMod.ts            (113L) — instala archive (com password prompt)
│   ├── useSortPlugins.ts           (59L)  — Auto-Sort (topológico + masterlist)
│   └── useConflictBadges.ts        (22L)  — badges de conflito na modlist
│
├── ui/                                  ← estado da UI
│   ├── index.ts                    (3L)
│   ├── useProfiles.ts              (44L)  — CRUD de profiles
│   ├── useSplitPane.ts             (33L)  — redimensionamento painel
│   └── useModManagerShortcuts.ts   (37L)  — teclas de atalho
│
└── utils/                              ← utilidades
    ├── index.ts                    (2L)
    ├── useMedia.ts                 (77L)  — preview images, readmes
    └── useModLog.ts                (12L)  — logging de deploy
```

### Componentes (82 arquivos, ~2.990L)

```
components/
├── index.ts                          (9L) — re-exports

├── ModManagerTopBar/                  (77L) — botões: Auto-Sort, Deploy, Restore, Profile
├── ModManagerTabs/                    (25L) — abas: Plugins, Files, INI, Data

├── ModListPanel/                     (147L) — virtual scroll + search + drag
│   └── components/
│       ├── ModRow/                   (149L) — linha individual (nome, badges, toggle)
│       └── ModSearchBar/              (23L) — filtro de busca

├── RightPanel/                        (85L) — container das abas à direita
│   └── components/
│       ├── PluginListTab/             (40L) — plugins .esp/.esm/.esl
│       ├── ModFilesTab/               (30L) — árvore de arquivos
│       ├── IniEditorTab/              (42L) — editor INI
│       └── DataFolderTab/             (26L) — navegador da pasta Data

├── GameConfigPanel/                   (53L) — config do jogo (nome, path, proton)
├── ProtonConfigPanel/                 (73L) — Proton + prefixo + Wine tools

├── Modals/
│   ├── GameConfigModal/              (138L) — modal de configuração
│   ├── BackupModal/                  (126L) — backup/restore de profile
│   ├── DeployConfirmModal/            (73L) — confirmação antes do deploy
│   ├── DeployResultModal/             (23L) — resultado do deploy
│   ├── ConflictsModal/                (48L) — conflitos de plugin
│   ├── AddProfileModal/               (42L) — criar profile
│   ├── OverwriteModal/                (24L) — sobrescrever mod duplicado
│   ├── PreviewModal/                  (26L) — preview de imagem
│   └── ReadmeModal/                   (26L) — leitor de README

├── FomodDialog/                       (78L) — wizard FOMOD
│   └── components/
│       ├── FomodGroupPanel/           (39L) — grupo de plugins
│       ├── FomodPluginRow/            (31L) — plugin individual
│       └── FomodStepPanel/            (26L) — passo do wizard

├── proton-setup/                      (857L) — wizard completo de Proton
│   ├── AlternativeList.tsx             (43L)
│   ├── ManualSelector.tsx              (75L)
│   ├── match-fork.ts                   (20L)
│   ├── PrefixForm.tsx                  (55L)
│   ├── proton-setup-constants.ts       (33L)
│   ├── RecommendationCard.tsx          (96L)
│   ├── ResultScreen.tsx                (39L)
│   ├── SetupLog.tsx                    (33L)
│   └── ProtonSetup/_layout.scss        (451L)
│
└── shared/
    ├── FileTree/                       (50L) — árvore de arquivos (reutilizável)
    └── StatusBar/                      (24L) — barra de status inferior
```

---

## 3. Camada de IPC — Electron (`src/main/events/mods/`)

39 handlers, todos via `registerEvent()` (nunca `ipcMain.handle` bruto). Zero stubs.

### Handlers por Arquivo

| Arquivo | Handlers | Responsabilidade |
|---------|----------|-----------------|
| `mod-backup.ts` | 4 | listBackups, createBackup, restoreBackup, setBackupKept |
| `mod-bridge.ts` | 6 | modBridgeListGames, modBridgeDeploy, modBridgeLog, modBridgeDiscoverGames, getModCompatibleInfo, bsaInvalidate |
| `mod-config.ts` | 5 | saveGameConfig, getGameConfig, removeMod, deleteMod, listGameConfigs |
| `mod-conflicts.ts` | 1 | detectConflicts |
| `mod-deploy.ts` | 3 | checkModExists, deployMods, installModFromArchive |
| `mod-eslifier.ts` | 1 | eslify |
| `mod-exe-launcher.ts` | 4 | getExternalTools, saveExternalTool, removeExternalTool, launchExternalTool |
| `mod-fomod.ts` | 2 | parseFomod, installFomod |
| `mod-ini.ts` | 1 | listIniFiles |
| `mod-load-order.ts` | 2 | modLoadOrderSort, modValidateLoadOrder |
| `mod-media.ts` | 5 | listModFiles, listDataFolder, readModFile, checkModsMedia, scanModFolder |
| `mod-proton/` | 3 | getGameProtonInfo, preparePrefix, setupProtonEnvironment |
| `mod-storage.ts` | 2 | modsStoreGet, modsStorePut |

### Serviços TypeScript

| Serviço | Linhas | Função |
|---------|--------|--------|
| `mod-deploy-service.ts` | 22 | Re-exporta `mod-deploy/` (thin class) |
| `mod-deploy/core.ts` | 384 | deploy(), restore(), undeployMod(), buildFilemap(), symlink staging |
| `mod-deploy/archive.ts` | 60 | extractArchive() com 7z (suporta `-p` password) |
| `mod-deploy/inventory.ts` | 116 | inventoryMod(), detectModType(), detectPluginConflicts() |
| `mod-backup-service.ts` | 115 | backup/restore profiles |
| `mod-bridge-service.ts` | 164 | comunicação com Python via subprocess |
| `mod-conflict-service.ts` | 44 | detectConflitos entre mods |
| `mod-manager-service.ts` | 64 | gerencia estado dos mods |
| `mod-storage-service.ts` | 67 | persistência em disco |
| `plugin-sort-service.ts` | 120 | ordenação local (fallback) |

---

## 4. Camada Python — `src/python/protonforge-api/`

### Bridge (`bridge/bridge.py` — 334L, 10 comandos)

Loop stdin/stdout JSON. Nenhum stub — todos funcionais:

| Comando | Handler | Implementação |
|---------|---------|---------------|
| `list_games` | cmd_list_games | 42 configs conhecidas |
| `list_profiles` | cmd_list_profiles | scan de diretórios |
| `deploy` | cmd_deploy | **Utils.deploy.deploy()** — symlinks + plugins.txt |
| `restore` | cmd_restore | remove todos os symlinks |
| `discover_games` | cmd_discover_games | **steam_finder** + bibliotecas Steam |
| `sync_steam_games` | cmd_sync_steam_games | sync completo da biblioteca |
| `fomod_parse` | cmd_fomod_parse | **Utils.fomod.parser.parse_module_config()** |
| `fomod_install` | cmd_fomod_install | aplica seleções no staging |
| `loot_sort` | cmd_loot_sort | **Utils.plugins.load_order.optimize_load_order()** com masterlist de 4140 plugins |
| `bsa_invalidate` | cmd_bsa_invalidate | **Utils.games.bsa_invalidation** |

### Utils Python (17 arquivos, ~2.780L)

```
Utils/
├── deploy/
│   ├── __init__.py          (23L)   — exporta deploy(), restore()
│   ├── types.py             (84L)   — DeploymentResult, ModInfo, PluginEntry
│   ├── archive.py           (46L)   — extract_archive (7z, zip, rar, tar)
│   ├── core.py              (434L)  — deploy(), restore(), undeploy(), build_filemap()
│   └── inventory.py         (180L)  — inventory_mod(), detect_mod_type(), detect_plugin_conflicts()
│
├── plugins/
│   ├── __init__.py           (0L)
│   ├── manager.py           (319L)  — read/write plugins.txt, sort, conflict detection
│   ├── plugin_parser.py      (93L)  — parse binário TES4/TES5 (masters, flags, author)
│   ├── load_order.py        (326L)  — topological sort (Kahn) + masterlist + validação
│   └── eslifier.py          (165L)  — converte .esp → .esl (compact form IDs)
│
├── fomod/
│   ├── __init__.py           (0L)
│   └── parser.py            (152L)  — parse FOMOD ModuleConfig.xml
│
├── prefix/
│   ├── __init__.py           (29L)  — export
│   ├── manager.py           (165L)  — find_steam_appid, get_prefix_path, clean_prefix
│   └── runner.py            (194L)  — run_wineboot, run_winetricks, run_proton_command
│
└── games/
    ├── __init__.py           (0L)
    └── bsa_invalidation.py  (234L)  — BSA invalidation (dummy BSA + INI patch)
```

### Games ABC (`Games/` — 6 arquivos, 437L)

Hierarquia de jogos com `BaseGame(ABC)`, `deploy_rules` e `plugin_rules`:

```
Games/
├── base_game.py            (130L)  — ABC com detect_prefix, deploy_rules, plugin_rules, ini_defaults
├── game_loader.py           (97L)  — carrega todos os jogos registrados
├── _registry.py            (122L)  — registro automático via decorador @register_game
├── skyrim_se.py             (23L)  — Skyrim SE (1 deploy override)
├── fallout4.py              (23L)  — Fallout 4
├── fallout4_vr.py           (23L)  — Fallout 4 VR
└── witcher_3.py             (19L)  — The Witcher 3 (non-Bethesda)
```

### Steam Finder (`bridge/Utils/steam_finder/` — 3 arquivos, 464L)

```
bridge/Utils/steam_finder/
├── __init__.py             (190L)  — find_steam_libraries, find_game_by_steam_id, find_installed_games
├── proton.py               (251L)  — find_proton_for_game, proton_run_command, list_installed_proton
└── utils.py                 (23L)  — normalize_vdf_path
```

### Masterlist (`data/masterlist.json` — 1.8MB, 4140 plugins)

Fonte: ModSanity (MIT). Estrutura:
```json
{
  "plugins": {
    "SkyUI.esp": {
      "load_after": ["SKSE"],
      "group": "ui",
      "message": [{"type": "say", "content": "..."}],
      "requirements": ["SKSE"]
    }
  }
}
```

---

## 5. Matriz de Features

### Status vs Referências

| Feature | Makai | Amethyst | ModSanity | MO2 Linux |
|---------|-------|----------|-----------|-----------|
| Deploy symlink | ✅ core.py + core.ts | ✅ | ✅ | ✅ |
| Staging directory | ✅ | ✅ | ✅ | ✅ |
| FOMOD installer | ✅ parser + wizard | ✅ | ✅ | ✅ |
| Plugin sorting (manual) | ✅ drag-drop | ✅ | ✅ | ✅ |
| Plugin sorting (topológico) | ✅ masterlist + Kahn | ✅ | ✅ | ❌ |
| ESL flag detection | ✅ binário header | ✅ | ✅ | ❌ |
| ESLify converter | ✅ eslifier.py | ✅ | ✅ | ❌ |
| BSA invalidation | ✅ dummy + INI patch | ✅ | ❌ | ✅ |
| BSA/BA2 extraction | ❌ | ✅ | ✅ | ✅ |
| Profile system | ✅ CRUD + backup | ✅ | ✅ | ✅ |
| Backup/restore | ✅ zip + kept flag | ✅ | ❌ | ✅ |
| Conflict detection | ✅ by plugin | ✅ | ✅ | ✅ |
| File conflict dashboard | ❌ | ❌ | ✅ | ✅ |
| INI editor | ✅ tabs + save | ✅ | ❌ | 👎 |
| Proton prefix | ✅ wineboot + winetricks | ✅ | ❌ | ✅ |
| Proton discovery | ✅ 3 layers (Steam/snap/flatpak) | ✅ | ❌ | ✅ |
| Wine tools | ✅ winecfg, regedit, taskmgr, control | ❌ | ❌ | ✅ |
| External tools | ✅ SSEEdit, FNIS, Bodyslide | ✅ | ❌ | ✅ |
| Collections (mod packs) | ❌ | ✅ | ✅ | ❌ |
| Auto-categorization | ❌ | ❌ | ✅ (100+ rules) | ❌ |
| Import MO2 modlist | ❌ | ✅ | ❌ | — |
| Script extender auto-install | ❌ | ✅ | ✅ | ✅ |
| ModIndex binary cache | ❌ | ❌ | ✅ (msgpack) | ❌ |
| Nexus API | ❌ | ✅ | ❌ | ❌ |
| LOOT binary | ❌ | ✅ (external) | — | ✅ |
| Cross-platform | ✅ Linux + macOS | 🟡 Win/Linux | ✅ | 🟡 Linux |
| UI virtual scroll | ✅ | ❌ | ❌ | ❌ |
| Preview images | ✅ readme + screenshot | ✅ | ❌ | ❌ |

### Legenda
- ✅ — implementado e funcional
- ❌ — não implementado
- 👎 — implementado mas limitado
- 🟡 — parcial

---

## 6. Fluxo de Dados

### Deploy de Mod
```
[Render] useDeploy.ts
    → window.electron.deployMods(gameId, profile)
    → IPC: events/mods/mod-deploy.ts
        → mod-deploy/core.ts: deploy()
            → inventory.ts (opcional)
            → archive.ts (se vier archive path)
            → build_filemap()
            → cria symlinks no staging dir
            → plugins.txt (se Bethesda)
    → retorna DeploymentResult
```

### Sort de Plugins
```
[Render] useSortPlugins.ts
    → window.electron.modLoadOrderSort(gameId, plugins)
    → IPC: events/mods/mod-load-order.ts
        → mod-bridge-service.ts → bridge.py
            → Utils.plugins.load_order.optimize_load_order()
                → plugin_parser.py (masters do header)
                → data/masterlist.json (regras LOOT)
    → { sorted, warnings, validation }
```

### FOMOD Install
```
[Render] useFomod.ts
    → window.electron.parseFomod(stagingDir)
    → IPC: mod-fomod.ts → FomodService.parse()
        → Python bridge? Não — local TS parser (fomod-types.ts)
    → Render: wizard UI com steps/groups/plugins
    → User seleciona → useFomod.install()
        → window.electron.installFomod(stagingDir, targetDir, selections)
        → IPC: mod-fomod.ts → FomodService.install()
```

### Python Bridge (deploy via Python, backup via TS)
```
[Render] useDeploy.ts (bridge path: obsoleto, TS é default)
    → window.electron.modBridgeDeploy(game, profile)
    → IPC: mod-bridge.ts → mod-bridge-service.ts → subprocess bridge.py
        → Utils.deploy.deploy()
    → { success, mods_deployed, plugins_txt }

[Render] BackupModal
    → window.electron.createBackup(gameId, profile)  ← TS puro
    → IPC: mod-backup.ts → mod-backup-service.ts
        → zip do staging + plugins.txt
```

---

## 7. Mapa de Influência dos Projetos de Referência

### Amethyst (Python/CTk, ~15K linhas)
- **Utils/deploy/**: port completo (core.py → symlink staging, inventory.py, archive.py)
- **Utils/fomod/parser.py**: port do parse de ModuleConfig.xml
- **Utils/games/bsa_invalidation.py**: port direto
- **Utils/eslifier.py**: port do compact form ID
- **Games/base_game.py + registry**: adaptado do Amethyst (ABC com deploy_rules)
- **steam_finder/**: expandido (Amethyst só tinha find_game_by_steam_id, adicionamos flatpak/snap + Proton)

### ModSanity (Rust, 16 módulos + masterlist)
- **data/masterlist.json**: 1.8MB importado do ModSanity (MIT)
- **Utils/plugins/load_order.py**: Kahn topological sort inspirado no ModSanity
- **Utils/plugins/plugin_parser.py**: parse header binário (não existia no Amethyst)
- **Auto-categorization**: planejado (100+ rules do ModSanity)
- **ModIndex cache**: planejado (msgpack)

### MO2 Linux Installer (Bash, 20+ scripts)
- **mod-bridge-service.ts**: conceito de "subprocess wrapper" adaptado
- **prefix/manager.py + runner.py**: Proton prefix detection + wineboot/winetricks
- **Wine tools runner**: inspirado no MO2 Linux (umu-run wrapper)

---

## 8. Features Planejadas (Prioridade)

### P0 — Core faltando
- [ ] BSA/BA2 extraction + parsing (formato .bsa e .ba2 da Bethesda)
- [ ] Script extender auto-install (SKSE, F4SE, NVSE, OBSE)
- [ ] Import MO2 modlist (`modlist.txt` parser)

### P1 — Qualidade de vida
- [ ] File conflict dashboard (árvore de arquivos com origem por mod)
- [ ] Auto-categorization (100+ regras do ModSanity)
- [ ] Nexus API integration (download direto)
- [ ] LOOT binary integration (fallback externo)

### P2 — Performance
- [ ] ModIndex binary cache (msgpack, scanning <100ms)
- [ ] Virtual scrolling otimizado (windowed)
- [ ] Lazy loading de previews

### P3 — Ecossistema
- [ ] Collections / mod packs (formato Nexus)
- [ ] Deploy_rules ativos por jogo (hierarquia ABC já existe mas não é usada no deploy real)
- [ ] Perfil de compatibilidade (reporta incompatibilidades conhecidas)
- [ ] Export/import de modlist (JSON)

---

## 9. Convenções do Projeto

### Nomenclatura de Arquivos
- Hooks: `use[Nome].ts` — PascalCase com prefixo `use`
- Componentes: `NomeComponente.tsx` — PascalCase
- Utilitários: `kebab-case.ts`
- SCSS: `_layout.scss` (partial) dentro de `Componente/`
- SCSS entry: `Componente.scss` (1 linha: `@use "./Componente" as *;`)

### Estrutura de Componente
```
MeuComponente/
├── index.ts                  ← export { MeuComponente } from "./MeuComponente"
├── MeuComponente.tsx         ← implementação
├── MeuComponente.scss        ← @use "./MeuComponente" as *;
└── MeuComponente/
    └── _layout.scss          ← estilos
```

### Estrutura de Hook
```
hooks/grupo/
├── index.ts                  ← export { useMeuHook } from "./useMeuHook"
├── useMeuHook.ts             ← implementação (puro TS, sem JSX)
```

### Camadas
```
Render (TSX) → IPC (event) → Service (TS) → [Python bridge]
                                 ↕
                          SqliteStore (electron-store)
```
