# ARQUITETURA MAKAI FORGE — Árvore Genealógica Completa

## 1. VISÃO GERAL DA ARQUITETURA

```
┌─────────────────────────────────────────────────────────────┐
│                    ELECTRON (TypeScript)                     │
│  Renderer (React) ←→ Preload (IPC) ←→ Main Process (TS)    │
│                     MakaiRPC.call()                          │
└─────────────────────────────────────────────────────────────┘
                              │ JSON-lines stdin/stdout
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     PYTHON (O cérebro)                       │
│  server.py (RPC Server, 53+ métodos)                        │
│    ├── core.game_install.py  (instalação de jogos)          │
│    ├── core.play.py          (fluxo de jogar)               │
│    ├── core.detection.py     (detecção de jogos)            │
│    ├── core.deploy.py        (deploy de mods)               │
│    ├── core.engine.*         (launch, proton, registry...)  │
│    └── makai_time/           (runtime container)            │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. PÁGINAS/ABAS DO APLICATIVO (React → TypeScript)

### 2.1 Catálogo (`src/renderer/src/pages/catalogue/`)
| Arquivo | Função |
|---|---|
| `index.tsx` | Página principal de busca de jogos (~12.200+ JSONs) |
| `hooks/useCatalogueSearch.ts` | Hook de busca com paginação |
| `hooks/useCatalogueFilters.ts` | Filtros (categoria, preço, etc.) |
| `components/game-item/game-item.tsx` | Card de jogo no grid |
| `components/filter-item/` | Itens de filtro ativos |
| `components/filter-section/` | Seções de filtro (sidebar) |
| `components/pagination/` | Paginação |

**Origem dos dados**: `data/games-data/` (~12.200 JSONs) + `data/catalogs/` (análise de forks)

---

### 2.2 Library (`src/renderer/src/pages/library/`)
| Arquivo | Função |
|---|---|
| `library.tsx` | Grid de jogos com filtros, ordenação (713 linhas) |
| `library-game-card.tsx` | Card compacto |
| `library-game-card-large.tsx` | Card grande |
| `filter-options.tsx` | Filtros (coleções, instalados, etc.) |
| `view-options.tsx` | Alternância de visualização (grid/compact/large) |

**Dados**: `src/main/events/library/` — 49 handlers IPC (get-library, add-game, delete, etc.)

---

### 2.3 Games (`data/install-api/Games/` — A ABA "JOGOS")
| Arquivo | Função |
|---|---|
| `index.tsx` | **Página Games principal** (196 linhas) — seções Steam + Library |
| `hooks/useGamesPage.ts` | Orquestrador da página (218 linhas) |
| `components/toolbar/TopBar.tsx` | Barra superior (busca, filtros, sync Steam) |
| `components/gamebar/GameBar.tsx` | **Barra inferior** do jogo selecionado (Play, Config, Wine Tools, etc.) |
| `components/gamebar/index.tsx` | Container do GameBar com callbacks |
| `components/game-config-modal/index.tsx` | **Modal de configuração do jogo** (373 linhas, 10 abas) |
| `components/modals/` | Delete, Backup, Check-DLLs modals |
| `components/skeleton/` | Loading skeleton |
| `components/sections/SteamSection.tsx` | Seção de jogos Steam |
| `components/sections/LocalSection.tsx` | Seção de jogos locais |
| `components/game-card/` | Card de jogo no grid |
| `components/compact-row/` | Row para visualização compacta |
| `components/large-card/` | Card grande |

**Hook core**: `src/renderer/src/pages/games/hooks/use-games.ts` (328 linhas)
- `playGame()` → `window.electron.openGame()` (IPC)
- `stopGame()`, `hideGame()`, `favoriteGame()`, `deleteGame()`
- `runWineTool()` → Wine Tools

**Service**: `data/install-api/AddGame/games-service.ts` (232 linhas)
- `GameConfig` interface (77 campos!)
- `getAll()`, `getById()`, `save()`, `delete()`, `update()`

---

### 2.4 Game Details (`src/renderer/src/pages/game-details/`)
Tela de detalhes de um jogo específico (info, screenshots, etc.)

### 2.5 Game Launcher (`src/renderer/src/pages/game-launcher/`)
Tela que aparece quando o jogo está iniciando (progresso, logs)

### 2.6 Downloads (`src/renderer/src/pages/downloads/`)
Gerenciador de downloads (velocidade, progresso, seeding)

### 2.7 Home (`src/renderer/src/pages/home/`)
Página inicial

### 2.8 Settings (`src/renderer/src/pages/settings/`)
43 arquivos — 10+ abas de configuração (Proton, Downloads, Aparência, etc.)

---

## 3. FLUXO DE INSTALAÇÃO DE JOGOS (O CORAÇÃO)

### 3.1 Visão Geral do Fluxo

```
USUÁRIO clica "Play" em um jogo
  │
  ▼
Games/hooks/use-games.ts :: playGame()
  │ window.electron.openGame(shop, objectId, executablePath)
  ▼
src/main/events/games/index.ts → openGame()
  │
  ▼
data/install-api/ForgePipeline/events/open-game/open-game.ts (128 linhas)
  │
  ├── Já tem executável dentro do prefixo?
  │   SIM → launchGame() direto
  │
  ├── SENÃO:
  │   ├── ensureProtonAvailable() → baixa Proton se necessário
  │   ├── create_prefix() via MakaiRPC → Python server.py
  │   │
  │   └── MakaiTime.installGame() → Bridge
  │       │
  │       ▼
  │     Python server.py :: install_game()
  │       │ core.game_install.install_game()
  │       │
  │       ├── detect_installer_type() → installer vs portable
  │       │   ├── INSTALLER: snapshot_prefix() + container_run_installer() + find_new_executables()
  │       │   └── PORTABLE: copy_to_prefix() + scan_prefix_for_exes()
  │       │
  │       └── Retorna { candidates, suggested_dir, method }
  │
  └── showExecutableSelect() → janela para escolher .exe
      └── Salva no store → launchGame()
```

### 3.2 Arquivos Envolvidos (TypeScript → Electron)

| Arquivo | Linhas | Função |
|---|---|---|
| `data/install-api/ForgePipeline/events/open-game/open-game.ts` | 128 | **ORQUESTRADOR**: decide fluxo, chama Python |
| `data/install-api/ForgePipeline/events/open-game/ensure-proton.ts` | 56 | Baixa/verifica Proton |
| `data/install-api/ForgePipeline/events/open-game/download-installer.ts` | 104 | Download do catálogo + detecção installer/portátil |
| `data/install-api/ForgePipeline/events/open-game/handle-prefix.ts` | 91 | Create prefix, scan prefix, show executable select |
| `data/install-api/ForgePipeline/events/open-game/send-progress.ts` | — | Envia progresso para launcher window |
| `data/install-api/ForgePipeline/services/makai-time.ts` | 139 | **BRIDGE**: MakaiTime.runExecutable(), .installGame(), .runInstaller() |
| `data/install-api/ForgePipeline/services/download/` | — | Sistema de download completo |
| `data/install-api/ForgePipeline/orchestrator/prefix-setup.ts` | — | setupPrefix() |
| `data/install-api/AddGame/add-custom-game-to-library.ts` | 166 | Adiciona jogo custom ao store SQLite |
| `data/install-api/AddGame/games-service.ts` | 232 | CRUD de jogos + GameConfig (77 campos) |

### 3.3 Arquivos Envolvidos (Python — a lógica real)

| Arquivo | Métodos RPC | Linhas | Função |
|---|---|---|---|
| **`tools/Mods_manager/core/game_install.py`** | — (chamado por server.py) | 628 | **CORPO DA INSTALAÇÃO**: 6 funções |
| `tools/Mods_manager/core/server.py` | `detect_installer_type`, `copy_to_prefix`, `scan_prefix_for_exes`, `snapshot_prefix`, `find_new_executables`, `install_game` | 1219 | Registro RPC + delega para game_install.py |
| `tools/Mods_manager/core/play.py` | `play_game` (via server.py) | 347 | Play flow: prefix, DLL overrides, Bethesda, Makaitricks, Script Extender, Deploy, Launch |

### 3.4 `game_install.py` — Funções Detalhadas (628 linhas)

```
game_install.py
│
├── _resolve_actual_prefix(prefix_path) → str
│   Resolve caminho real do prefixo (pode ter subdiretório pfx/)
│
├── detect_installer_type(source_path) → dict
│   Detecta se é instalador (.exe/.msi) ou pasta portátil
│   Retorna: { is_installer, installer_path, source_path, error, exe_count, total_files }
│
├── copy_to_prefix(source_path, prefix_path, progress_callback?) → dict
│   ★ CÓPIA COM VERIFICAÇÃO SHA256 ★
│   1. Lista arquivos com _walk_dir()
│   2. Calcula SHA256 pré-cópia (lotes de 20)
│   3. Copia em lotes de 50 com shutil.copy2()
│   4. Verifica contagem pós-cópia
│   5. Calcula SHA256 pós-cópia e compara
│   Retorna: { success, dest_path, files_count, hashes_ok, mismatches }
│
├── scan_prefix_for_exes(prefix_path) → dict
│   Escaneia drive_c/ por .exe jogáveis
│   Pula: SYSTEM_DIRS, NEGATIVE_DIRS, EXCLUDED_EXES, EXCLUDED_PATTERNS
│   Ordena por tamanho (maior primeiro)
│   Limite: MAX_CANDIDATES = 5
│   Retorna: { candidates: [{path, name, size}], suggested_dir }
│
├── snapshot_prefix(prefix_path) → list[dict]
│   Snapshot completo do drive_c/ (path, size, mtimeMs, isDirectory)
│   Usado para comparar antes/depois de instalador
│
├── find_new_executables(before, after) → list[dict]
│   Compara snapshots, retorna .exe NOVOS (não Wine-internos)
│   Prioriza: novos diretórios > diretórios existentes
│   Ordena por mtimeMs (mais recente primeiro)
│
└── install_game(source_path, prefix_path, proton_path, game_id?, existing_exe_path?, progress_callback?) → dict
    ★ ORQUESTRADOR PRINCIPAL ★
    1. Se existing_exe_path: copia pasta + scan (restore)
    2. Detecta tipo (detect_installer_type)
    3. Se INSTALLER:
       a. snapshot_prefix() BEFORE
       b. _run_installer_in_container() → Makai Time
       c. snapshot_prefix() AFTER
       d. find_new_executables() 
       e. Se nada encontrado: fallback copy_to_prefix + scan
    4. Se PORTÁTIL:
       a. Validações (exe_count, total_files, limites)
       b. copy_to_prefix() com progresso
       c. scan_prefix_for_exes()
    Retorna: { success, candidates, suggested_dir, method }
```

---

## 4. FLUXO DE "JOGAR" (Play Flow)

### 4.1 TypeScript Side

```
use-games.ts :: playGame(game)
  → window.electron.openGame(shop, objectId, executablePath, launchOptions)
    → main/events/games/index.ts → openGame()
      → ForgePipeline/events/open-game/open-game.ts
        → MakaiRPC.call("play_game", { game_id })  [se for Mods_manager flow]
        → MakaiRPC.call("container_run", { exe_path, proton_path, prefix_path })  [se direto]
```

### 4.2 Python Side (`tools/Mods_manager/core/play.py`, 347 linhas)

```
play_game(game_id, profile)
  │
  ├── _step_proton() → find_proton() / find_compatibility_tool_path() / find_any_proton()
  │
  ├── _step_prefix() → create_prefix() se não existir
  │
  ├── _step_dll_overrides() → apply_dll_overrides() do games_registry.py
  │
  ├── _step_bethesda_registry() → register_bethesda_game_path() se for Bethesda
  │
  ├── _step_makaitricks() → run_multiple() com componentes do games_registry.py
  │
  ├── _step_script_extender() → check/install Script Extender (SKSE, F4SE, etc.)
  │
  ├── _step_deploy() → deploy_mods() se houver modlist
  │
  └── _step_launch() → launch_game() → Makai Time
```

---

## 5. ABA Catálogo vs ABA Games vs Library

### 5.1 Catálogo (`src/renderer/src/pages/catalogue/`)
- **Propósito**: Navegar/BUSCAR jogos disponíveis para baixar
- **Fonte**: `data/games-data/` (~12.200 JSONs)
- **Ação principal**: Clica no jogo → vai para game-details → "Download" → baixa + instala

### 5.2 Library (`src/renderer/src/pages/library/`)
- **Propósito**: Biblioteca de jogos (Steam + custom + GOG, etc.)
- **Fonte**: `src/main/events/library/` (49 handlers IPC)
- **Store**: SQLite (`gamesStore`)
- **Ação principal**: Clica → joga

### 5.3 Games (`data/install-api/Games/`)
- **Propósito**: **ABA PRINCIPAL** onde o usuário gerencia jogos
- **Fonte**: `gamesService.getAll()` → library store
- **Dividido em**:
  - `Seção Steam` — jogos detectados da Steam
  - `Seção Local` — jogos adicionados manualmente
- **Ações**: Play, Configurar, Wine Tools, Backup, Delete, Favoritar
- **GameBar**: Barra inferior com ações quando um jogo está selecionado
- **GameConfigModal**: 10 abas de configuração

---

## 6. COMUNICAÇÃO ELECTRON ↔ PYTHON

```
┌──────────────────────────────────────────────────────────┐
│                   MAKAI RPC (JSON-lines)                  │
│                                                          │
│  Electron: tools/Mods_manager/services/makai-rpc.ts      │
│    → spawn("tools/venv/bin/python3", ["server.py",       │
│       "--stdio"])                                        │
│    → JSON request via stdin                              │
│    ← JSON response/events via stdout                     │
│                                                          │
│  Python: tools/Mods_manager/core/server.py               │
│    → Lê JSON da stdin                                    │
│    → Dispara @register("method")                         │
│    ← Escreve JSON na stdout                              │
└──────────────────────────────────────────────────────────┘
```

---

## 7. O PROBLEMA: ONDE AS COISAS ESTÃO vs ONDE DEVERIAM ESTAR

### 7.1 Estado Atual (Bagunçado)

| Lógica | Onde está | Onde deveria estar | Status |
|---|---|---|---|
| Instalação de jogo | TypeScript (ForgePipeline/events/open-game/) | **Python** (já migrado parcialmente) | ❌ DUPLICADO |
| Cópia com SHA256 | TypeScript (orchestrator/prefix-copier.ts) | **Python** (game_install.py) | ✅ JÁ EM PYTHON |
| Scan de executáveis | TypeScript (orchestrator/prefix-scanner.ts) | **Python** (game_install.py) | ✅ JÁ EM PYTHON |
| Snapshot + diff | TypeScript (orchestrator/snapshot.ts + change-detector.ts) | **Python** (game_install.py) | ✅ JÁ EM PYTHON |
| Detect installer vs portable | TypeScript (download-installer.ts) | **Python** (game_install.py) | ✅ JÁ EM PYTHON |
| **Orquestração do fluxo** | TypeScript (open-game.ts) | **Python** | ❌ AINDA EM TS |
| Download do catálogo | TypeScript (download-installer.ts + download/) | TypeScript (ok aqui) | ✅ CERTO |
| Proton recommendation | TypeScript + Python (api/services/) | Misto (ok) | ✅ CERTO |
| GameConfig (77 campos) | TypeScript (games-service.ts) | **Deveria ser tipo compartilhado** | ⚠️ PODE MELHORAR |

### 7.2 O Problema Específico do `game_install.py`

`game_install.py` **JÁ está em Python** e **JÁ está registrado no server.py** com 6 métodos RPC:
- `detect_installer_type` ✅
- `copy_to_prefix` ✅
- `scan_prefix_for_exes` ✅
- `snapshot_prefix` ✅
- `find_new_executables` ✅
- `install_game` ✅ (orquestrador completo)

**MAS** o `open-game.ts` (TypeScript) ainda chama `MakaiTime.installGame()` que redireciona para `MakaiRPC.call("install_game", ...)` — então na prática o Python já é usado. O problema é que o TypeScript ainda tem **DUPLICATAS** da lógica em:
- `data/install-api/ForgePipeline/orchestrator/` (se existir)
- `data/install-api/ForgePipeline/events/open-game/download-installer.ts` (tem lógica de detecção duplicada)

---

## 8. RECOMENDAÇÕES DE ORGANIZAÇÃO

### 8.1 Separação Clara de Responsabilidades

```
Electron (TypeScript) — APENAS UI + ORQUESTRAÇÃO MÍNIMA
├── Renderer: React pages, hooks, components
├── Preload: IPC bridges
├── Main Events: Apenas registro de IPC + chamadas RPC
└── Store: SQLite operations

Python — TODA LÓGICA PESADA
├── server.py: RPC methods registry
├── game_install.py: Instalação de jogos
├── play.py: Play flow
├── engine/launch.py: Makai Time execution
├── engine/proton.py: Proton detection
└── makai_time/: Runtime container
```

### 8.2 O Que Mover/Consolidar

1. **Remover código duplicado do TypeScript**: Os arquivos em `data/install-api/ForgePipeline/orchestrator/` e `events/open-game/` que foram migrados para Python devem ser apagados ou marcados como `@deprecated`.

2. **Centralizar tipos de jogo**: O `GameConfig` (77 campos em `games-service.ts`) e o `LibraryGame` (`@types`) deveriam ser unificados.

3. **`game_install.py` está no lugar certo** mas dentro do Mods_manager. Deveria estar em `tools/prefix/python/prefix/` ou em `core/` nível superior. Sugestão: mover para `tools/Mods_manager/core/` (onde já está) — está OK.

4. **Consolidar AddGame**: O fluxo "Adicionar Jogo Custom" está espalhado entre:
   - `data/install-api/AddGame/add-custom-game-to-library.ts` (criação no store)
   - `data/install-api/ForgePipeline/events/open-game/open-game.ts` (pós-criação)
   - `data/install-api/Games/` (UI)
   Sugestão: unificar em `data/install-api/Games/`

### 8.3 Onde `game_install.py` se encaixa na hierarquia ideal

```
tools/
├── Mods_manager/
│   ├── core/
│   │   ├── server.py              ← RPC server (orquestrador)
│   │   ├── game_install.py        ← ★ INSTALAÇÃO (aqui mesmo, OK)
│   │   ├── play.py                ← Play flow
│   │   ├── detection.py           ← Detecção de jogos
│   │   ├── deploy.py              ← Deploy de mods
│   │   ├── games_registry.py       ← Dados de jogos
│   │   └── engine/                ← Launch, Proton, Makaitricks, Registry
│   ├── services/                  ← TypeScript bridge
│   ├── games/                     ← Módulos de jogos (TS)
│   └── ui/                        ← React Mod Manager
└── prefix/
    └── makai_time/                ← Runtime container
```

---

## 9. ÁRVORE DE CHAMADAS — "O QUÊ CHAMA O QUÊ"

### 9.1 "Adicionar Jogo Custom"

```
games-service.ts :: save(game)
  → window.electron.addCustomGameToLibrary(...)
    → add-custom-game-to-library.ts :: addCustomGameToLibrary()
      → Cria objectId (UUID)
      → Cria Game no gamesStore (SQLite)
      → Salva JSON em userData/games/{objectId}.json
      → Download de covers (Steam CDN)
      → Cria diretório do prefixo
  → Retorna game object
```

### 9.2 "Jogar Jogo"

```
use-games.ts :: playGame(game)
  → window.electron.openGame(shop, objectId, executablePath, launchOptions)
    → open-game.ts :: openGame()
      ├── Se Steam: launchGame() direto
      ├── Se já configurado: launchGame() direto
      └── Se precisa configurar:
          ├── ensureProtonAvailable() → download ou valida Proton
          ├── create_prefix() → MakaiRPC.call("create_prefix", ...)
          └── MakaiTime.installGame(sourcePath, options)
              └── MakaiRPC.call("install_game", params)
                  └── Python: game_install.install_game()
                      ├── detect_installer_type()
                      ├── [installer] snapshot_prefix() + container_run_installer() + find_new_executables()
                      ├── [portable] copy_to_prefix() + scan_prefix_for_exes()
                      └── Retorna { candidates, suggested_dir, method }
          ├── showExecutableSelect() → janela de seleção
          └── Salva executablePath → launchGame()
```

### 9.3 "Play via Mods Manager"

```
play_game.ts (ou server.py :: play_game)
  → core.play.play_game(game_id, profile)
    → _step_proton() → core.engine.proton.find_proton()
    → _step_prefix() → prefix.core.create_prefix()
    → _step_dll_overrides() → core.engine.registry.apply_dll_overrides()
    → _step_bethesda_registry() → core.engine.registry.register_bethesda_game_path()
    → _step_makaitricks() → core.engine.makaitricks.run_multiple()
    → _step_script_extender() → core.games_registry.install_script_extender()
    → _step_deploy() → core.deploy.deploy_mods()
    → _step_launch() → core.engine.launch.launch_game()
      → makai_time.makai_time.run()
```

---

## 10. RESUMO DOS ARQUIVOS MAIS IMPORTANTES

### Arquivos que NUNCA devem ser apagados

| Prioridade | Arquivo | Motivo |
|---|---|---|
| 🔴 | `tools/Mods_manager/core/server.py` | **ÚNICO** servidor RPC (53+ métodos) |
| 🔴 | `tools/Mods_manager/core/game_install.py` | **Lógica de instalação** (628 linhas) |
| 🔴 | `tools/Mods_manager/core/play.py` | **Play flow completo** (347 linhas) |
| 🔴 | `tools/prefix/makai_time/makai_time.py` | **Entry point Makai Time** (719 linhas) |
| 🟡 | `data/install-api/ForgePipeline/events/open-game/open-game.ts` | Orquestrador Electron (128 linhas) |
| 🟡 | `data/install-api/ForgePipeline/services/makai-time.ts` | Bridge MakaiTime→RPC (139 linhas) |
| 🟡 | `tools/Mods_manager/services/makai-rpc.ts` | Classe RPC bridge Electron↔Python (245 linhas) |
| 🟢 | `data/install-api/AddGame/add-custom-game-to-library.ts` | Add game to store (166 linhas) |
| 🟢 | `data/install-api/Games/` | UI da aba Games |
| 🟢 | `src/renderer/src/pages/games/hooks/use-games.ts` | Hook de jogos (328 linhas) |

### Convenções de Paths (Aliases TypeScript)

| Alias | Path real |
|---|---|
| `@main` | `src/main/` |
| `@renderer` | `src/renderer/src/` |
| `@types` | `src/types/` |
| `@provision` | `data/install-api/` |
| `@mods-manager` | `tools/Mods_manager/` |

---

## 11. GLOSSÁRIO DE TERMOS

| Termo | Significado |
|---|---|
| **Prefix/Prefixo** | Diretório Wine que simula C:\ (drive_c, user.reg, system.reg) |
| **Makai Time** | Runtime container (bwrap + steamrt4) |
| **MakaiRPC** | Bridge JSON-lines entre Electron e Python |
| **MakaiTricks** | Winetricks customizado (instala DLLs, componentes) |
| **ForgePipeline** | Pipeline de instalação (download → extract → install → scan) |
| **GameConfig** | Interface com 77 campos de configuração de jogo |
| **CompatFlow** | Classificador de executáveis (.exe) |
| **Proton Intelligence** | Sistema de recomendação de Proton baseado em fork detection |
| **Script Extender** | SKSE/F4SE/NVSE/etc — plugins que extendem jogos Bethesda |
| **SRT** | Steam Runtime Tools (pressure-vessel da Valve) |

---

## 12. CONCLUSÃO: ONDE ESTÁ A BAGUNÇA

### 🥇 MAIOR BAGUNÇA: `data/install-api/` vs `tools/Mods_manager/`

O `data/install-api/` contém:
- `ForgePipeline/` — Pipeline de instalação EM TYPESCRIPT (que devia estar em Python)
- `AddGame/` — Add game flow
- `Games/` — UI da aba Games
- `scripts-install/` — Scripts de instalação

O `tools/Mods_manager/core/` contém:
- `game_install.py` — Instalação EM PYTHON (que substitui o ForgePipeline)
- `server.py` — RPC server

**PROBLEMA**: Temos DUAS implementações da mesma lógica:
1. TypeScript em `data/install-api/ForgePipeline/` (ANTIGA)
2. Python em `tools/Mods_manager/core/game_install.py` (NOVA)

### 🥈 SEGUNDA BAGUNÇA: GameConfig duplicado

O tipo `GameConfig` (77 campos) está em `data/install-api/AddGame/games-service.ts`, mas `LibraryGame` nos tipos em `src/types/` tem campos similares mas diferentes. Precisam ser unificados.

### 🥉 TERCEIRA BAGUNÇA: Aba Games dividida

A UI da aba Games está em `data/install-api/Games/` mas os hooks estão em `src/renderer/src/pages/games/` — duas localizações diferentes para a mesma feature.

---

## Como proceder?

1. **DECIDIR** se o fluxo de instalação será 100% Python (recomendado) ou híbrido
2. **APAGAR** código TypeScript duplicado em `ForgePipeline/orchestrator/` se Python já cobre
3. **UNIFICAR** `data/install-api/Games/` com `src/renderer/src/pages/games/`
4. **UNIFICAR** `GameConfig` e `LibraryGame` num único tipo
5. **CONSOLIDAR** `game_install.py` — está OK onde está, mas documentar que substitui ForgePipeline
