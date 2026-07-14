# Proton Tools — Documentacao Completa

> Gestao completa de ferramentas de compatibilidade Proton/Wine/DXVK/VKD3D. Caminho base: `tools/proton-tools/`

---

## Estrutura de Diretorios

```
proton-tools/
├── main/
│   ├── events/
│   │   ├── index.ts                    # Registra todos handlers IPC
│   │   ├── recommend-proton.ts         # IPC: recomendar melhor fork Proton
│   │   ├── install-game-with-proton.ts # IPC: baixar + instalar fork Proton
│   │   ├── analyze-game-exe.ts         # IPC: analisar .exe para compatibilidade
│   │   ├── get-fork-catalog.ts         # IPC: listar forks instalados
│   │   └── get-proton-db.ts            # IPC: consultar dados ProtonDB
│   └── services/
│       ├── index.ts                    # Fachada: getTools, downloadTool, etc.
│       ├── types.ts                    # ProtonTool, ProtonRelease, InstalledTool
│       ├── tools.ts                    # Catalogo de 22 forks
│       ├── db.ts                       # Query SQLite fork_catalog.db
│       ├── installer.ts                # Scan de ferramentas instaladas
│       └── downloader.ts               # Download HTTP com arch filtering
│       └── extractor.ts                # Extracao de archives
├── renderer/
│   ├── assets/protondb-logo.svg
│   ├── components/
│   │   ├── protondb-badge/
│   │   ├── protondb-section/
│   │   └── proton-path-picker/
│   └── pages/proton-tools/
│       ├── index.tsx                   # Pagina principal
│       ├── types.ts
│       ├── hooks/
│       │   ├── useGamesTab.ts
│       │   ├── useProtonTools.ts
│       │   └── useReleases.ts
│       ├── services/proton-api.ts
│       ├── components/
│       │   ├── download-progress/
│       │   ├── games-tab/
│       │   ├── prefix-progress-modal/
│       │   ├── proton-info-modal/
│       │   └── version-list/
│       └── css/
```

---

## Arvore Genealogica de Execucao

### FLUXO 1: Recomendar Proton

```
[UI] recommendProton(gameId)
  → events/recommend-proton.ts
    → ProtonRecommendationService.recommend(gameId)
      └── Consulta python-rpc/protonforge-api
      └── Multi-tier: game_match → fork_recommendations → anticheat → gacha → tierScore
```

### FLUXO 2: Baixar e Instalar Fork

```
[UI] downloadProtonTool(toolId, version)
  → events/install-game-with-proton.ts
    → services/downloader.ts: downloadFile(tool, release, dest, onProgress)
      ├── Filtra por arch (x86_64)
      ├── HTTP download com progresso
      └── Retorna arquivo local
    → services/extractor.ts: extract(archive, dest)
    └── Salva .version
```

### FLUXO 3: Analisar EXE

```
[UI] analyzeGameExe(exePath)
  → events/analyze-game-exe.ts
    → python-rpc: analyze_exe(exe_path)
      └── Identifica: app nativo, jogo conhecido, porta, ou desconhecido
```

### FLUXO 4: Consultar ProtonDB

```
[UI] getProtonDbData(gameId)
  → events/get-proton-db.ts
    → Consulta SQLite proton_recommended.db
```

---

## Catalogo de Ferramentas (22)

| Categoria | Ferramentas |
|-----------|------------|
| **Proton** (15) | Valve Proton, Proton-GE, Proton-CachyOS, DW-Proton, Proton-EM, Proton-GE RTSP, Proton-Tkg, Luxtorpeda, Roberta, Boxtron, Steam Tinker Launch, Proton-Sarek, UMU-Proton, Proton-Plop, Proton-Lina, Proton-LFX2, Proton-SpeedHack |
| **Wine** (3) | Wine-Vanilla (Kron4ek), Wine-Staging (Kron4ek), Wine-Staging-Tkg (Kron4ek) |
| **DXVK** (2) | DXVK (doitsujin), DXVK GPL+Async (Ph42oN) |
| **VKD3D** (1) | VKD3D-Proton (HansKristian-Work) |

---

## Todas as Funcoes Exportadas (services/)

| Funcao | Descricao |
|--------|-----------|
| `getTools()` | Retorna array PROTON_TOOLS (22) |
| `getToolById(id)` | Busca por ID |
| `getToolsByCategory(cat)` | Filtra por categoria |
| `findToolIdByForkName(fork)` | Mapeia recomendacao → tool ID |
| `formatDirName(tool, version)` | Gera nome do diretorio |
| `findToolByFolder(folder)` | Reverse-lookup: folder → tool |
| `downloadFile(tool, release, dest, onProgress?)` | Download HTTP |
| `getReleasesByForkId(forkId)` | Query SQLite |
| `getInstalledTools()` | Scan filesystem |
| `getCategoryDir(category)` | Path base por categoria |

---

## Eventos IPC

| IPC Event | Handler | Descricao |
|-----------|---------|-----------|
| `getProtonTools` | getTools() | Lista 22 ferramentas |
| `getProtonToolsByCategory` | getToolsByCategory(cat) | Filtra |
| `getProtonReleases` | getReleases(toolId) | Releases do DB |
| `downloadProtonTool` | downloadTool(opts) | Download + extrair |
| `getInstalledProtonTools` | getInstalledTools() | Scan filesystem |
| `removeProtonTool` | removeToolByPath(toolId, path) | Deletar |
| `fetchProtonReadme` | fetchReadme(repoUrl) | README GitHub |
| `recommendProton` | recommend(gameId) | Recomendacao |
| `downloadProton` | download(fork) | Instalar fork |
| `analyzeGameExe` | analyze(exePath) | Analisar .exe |
| `getForkCatalog` | getInstalledForks()` | Forks do DB |
| `getProtonDbData` | getData(gameId)` | ProtonDB data |

---

## Como se Encaixa no Makai Forge

Hub de **gestao de camadas de compatibilidade**. O Play flow chama `ensureProton()` que usa este modulo para encontrar/instalar a versao Proton correta. O motor de recomendacao consulta o servidor Python RPC para sugerir o melhor fork por jogo. Download usa fila serial com progresso via `webContents.send()`.
