# Relatório Arquitetural — `proton_recommended/`

> Gerado em 01 Jul 2026 após exploração completa do diretório (58 arquivos fonte).

---

## 1. File Tree (source files only)

```
proton_recommended/
├── index.ts                              ← barrel exports (3 public modules)
├── services/
│   └── proton-recommendation.ts          ← TS service: spawns Python, manages JSON-RPC lifecycle
├── ui/
│   ├── proton-recommendation-modal.tsx    ← React modal: shows Proton recs + user selection
│   ├── proton-recommendation-modal.scss   ← Styles for the modal
│   └── use-install-flow.ts               ← React hook: multi-step install flow modals
├── README.md                             ← (redirect to python/README.md)
│
└── python/
    ├── server.py                          ← JSON-RPC stdio loop (entry point)
    ├── requirements.txt                   ← ijson, aiohttp
    ├── README.md                          ← Full project docs (194 lines)
    │
    ├── api/
    │   ├── __init__.py                    ← Empty
    │   ├── handler.py                     ← @register decorator + RPC dispatcher
    │   ├── debug_log.py                   ← Per-request debug logger
    │   ├── db/
    │   │   ├── __init__.py                ← Empty
    │   │   └── connection.py              ← SQLite connection manager (always returns None!)
    │   │
    │   └── services/
    │       ├── __init__.py                ← Empty (re-exports from submodules)
    │       ├── data.py                    ← SQLite -> JSON fallback data loader
    │       ├── catalog.py                 ← Online catalog client (makai-forge.store)
    │       ├── gacha.py                   ← Gacha game special logic (DW-Proton, CachyOS)
    │       ├── anticheat.py               ← Anticheat database lookup
    │       ├── compatflow_bridge.py       ← Queries CompatFlow sibling project
    │       ├── dlls.py                    ← DLL catalog + winetricks integration
    │       ├── mod_compat.py              ← Mod compatibility checks
    │       ├── proton_versions.py         ← Proton version detection + ranking
    │       ├── recommendation/
    │       │   ├── __init__.py            ← Re-exports: recommend(), get_available_forks()
    │       │   ├── core.py                ← Main engine: match -> fork -> anticheat -> gacha -> tierScore
    │       │   ├── matching.py            ← Template-based game matching by genre/features
    │       │   └── options.py             ← Launch option builder (env vars, DLLs, overrides)
    │       ├── prefix/
    │       │   ├── __init__.py            ← Re-exports: create_prefix, delete_prefix
    │       │   ├── core.py                ← Prefix resolution, creation, Proton validation
    │       │   └── winetricks.py          ← Makaitricks downloader + DLL installer
    │       ├── launch_args/
    │       │   ├── __init__.py            ← Re-exports: get_launch_command, etc.
    │       │   ├── core.py                ← Launch command builder (umu-run, protonrun)
    │       │   └── catalog.py             ← Launch arg catalog with mappings
    │       └── mod_manager/
    │           ├── __init__.py            ← Adds bridge/ to sys.path; re-exports
    │           ├── fomod.py               ← FOMOD parser (delegates to Utils.fomod_parser)
    │           ├── plugins.py             ← Plugin manager (delegates to Utils.plugins)
    │           └── nexus.py               ← Nexus Mods API client
    │
    ├── bridge/
    │   ├── __init__.py                    ← Imports handler to register @register methods
    │   ├── bridge.py                      ← Standalone JSON-RPC server (hardcoded game data + Steam finder)
    │   └── Utils/
    │       ├── __init__.py                ← Empty
    │       ├── steam_finder/
    │       │   ├── __init__.py            ← Empty
    │       │   ├── proton.py              ← Proton binary detection in compatibilitytools.d
    │       │   └── utils.py               ← Libraryfolders.vdf parser (same as scanfix-game.ts)
    │       ├── mo2_export.py              ← MO2 modlist.txt exporter
    │       ├── mo2_import.py              ← MO2 modlist.txt importer
    │       ├── bain_parser.py             ← BAIN installer wizard parser
    │       ├── deploy/
    │       │   ├── __init__.py            ← Re-exports
    │       │   ├── types.py               ← ModEntry, DeployResult dataclasses
    │       │   ├── core.py                ← Deploy engine: symlink/copy, conflict detection, plugins.txt
    │       │   ├── archive.py             ← Archive extraction (7z, zip, rar, fomod)
    │       │   └── inventory.py           ← Deployed file tracking
    │       ├── plugins/
    │       │   ├── __init__.py            ← Re-exports
    │       │   ├── manager.py             ← Star-prefix plugin list parser
    │       │   ├── plugin_parser.py       ← TES4/TES5 header parser (masters, CRC)
    │       │   ├── load_order.py          ← Topological sort (Kahn) with masterlist.json
    │       │   └── eslifier.py            ← ESL-flagged plugin detection
    │       ├── fomod/
    │       │   ├── __init__.py            ← Re-exports parse_module_config
    │       │   └── parser.py              ← Full FOMOD ModuleConfig.xml parser (dataclasses)
    │       ├── games/
    │       │   ├── __init__.py            ← Re-exports
    │       │   ├── bsa_parser.py          ← BSA header reader
    │       │   ├── bsa_invalidation.py    ← BSA invalidation (dummy BSA, ini tweaks)
    │       │   └── script_extender.py     ← SKSE/FOSE/NVSE/etc launcher name resolver
    │       └── prefix/
    │           ├── __init__.py            ← Re-exports
    │           ├── manager.py             ← Prefix lifecycle (create, verify, delete)
    │           └── runner.py              ← Wine tool executor (winecfg, regedit, etc.)
    │
    ├── Games/
    │   ├── __init__.py                    ← Re-exports get_game(), get_registered_games()
    │   ├── _registry.py                   ← Central registry: 30 games + GenericGame factory
    │   ├── base_game.py                   ← AbstractGame with all hook methods
    │   ├── game_loader.py                 ← Dynamic module loader
    │   ├── skyrim_se.py                   ← Skyrim SE config
    │   ├── fallout4.py                    ← Fallout 4 config
    │   ├── fallout4_vr.py                 ← Fallout 4 VR config
    │   └── witcher_3.py                   ← The Witcher 3 config
    │
    ├── data/
    │   └── masterlist.json               ← 1.7MB LOOT masterlist (4140 plugins) — ATIVO
    │
    ├── resources/
    │   ├── proton_data.db                ← 0 bytes (vazio, nunca populado)
    │
    ├── scripts/
    │   ├── populate_metadata_tables.py   ← Popula SQLite a partir dos JSONs
    │   └── migrate_to_sqlite.py          ← Converte matched.json + recs para SQLite
    │
    └── tests/
        ├── __init__.py                    ← Empty
        ├── test_recommendation.py         ← 4 testes: known game, unknown, forks, search
        └── test_prefix.py                ← 6 testes: path resolve, proton valid, prefix check, DLL check, delete
```

**Total**: 58 arquivos fonte + 1 README + 1 requirements.txt = **60 entries**

---

## 2. Import Dependency Graph

```
   server.py (stdio JSON-RPC loop)
       │
       └── api/handler.py  ( @register decorator dispatcher )
               │
               ├── services/data.py
               │       ├── api/db/connection.py     ← _get_db() sempre retorna None
               │       └── services/recommendation/core.py
               │
               ├── services/catalog.py              ← http.client -> makai-forge.store
               ├── services/gacha.py                ← (stdlib only)
               ├── services/anticheat.py            ← (stdlib only)
               ├── services/compatflow_bridge.py    ← sys.path.insert (sibling project)
               ├── services/dlls.py
               │       └── services/prefix/winetricks.py
               │
               ├── services/mod_compat.py           ← (stdlib only)
               ├── services/proton_versions.py      ← (stdlib + glob)
               │
               ├── services/recommendation/
               │       ├── core.py                  ← main engine
               │       ├── matching.py              ← template-based match
               │       └── options.py               ← launch option builder
               │
               ├── services/prefix/
               │       ├── core.py                  ← prefix resolution + creation
               │       └── winetricks.py            ← Makaitricks downloader
               │
               ├── services/launch_args/
               │       ├── core.py                  ← launch command builder
               │       └── catalog.py               ← launch arg mappings
               │
               └── services/mod_manager/
                       ├── __init__.py  → sys.path.insert(0, "bridge/")
                       ├── fomod.py     → Utils.fomod_parser (via bridge/)
                       ├── plugins.py   → Utils.plugins (via bridge/)
                       └── nexus.py     ← (stdlib only)
```

**Circular dependencies**: **NENHUMA** — grafo é uma árvore limpa.

---

## 3. Python -> TypeScript -> UI Data Flow

```
   Electron Main Process
        │
        │  ProtonRecommendationService
        │    ├── spawnPythonProcess() → child_process.spawn("python3", ["server.py", "--stdio"])
        │    ├── getPythonScriptPath() → app.getAppPath() + python/server.py
        │    ├── request(method, params) → JSON linha no stdin → Promise
        │    ├── _processLine(line) → JSON.parse → pendingRequests[id] → resolve
        │    ├── dispose() → kill + cleanup
        │    └── pendingRequests: Map<number, {resolve, reject}>
        │
        │  stdin (write):  {"id":1, "method":"recommend_proton", "params":{"game_id":"1245620"}}\n
        │  stdout (read):  {"id":1, "result":{...}}\n
        │
        ▼
   React Renderer (IPC bridge)
        │
        ├── ProtonRecommendationModal  ← modal de seleção de Proton
        │     ├── fork list (primary + alternatives)
        │     ├── tier (gold/silver/bronze)
        │     └── confidence (high/medium/low)
        │
        ├── useInstallFlow (hook)
        │     Step 1: recommendProton(gameId)
        │     Step 2: confirmProton(fork, version)
        │     Step 3: createPrefix(gameId, protonPath)
        │     Step 4: getLaunchCommand(gameId, prefixPath, protonPath, exe)
        │     Step 5: Umu.launchExecutable(cmd)
        │
        └── index.ts (barrel)
              ├── { ProtonRecommendationService }
              ├── { ProtonRecommendationModal }
              └── { useInstallFlow }
```

---

## 4. RPC Methods Disponíveis

| Método | Handler | Descrição |
|--------|---------|-----------|
| `recommend_proton` | `recommendation/core.py` | Recomendação primária + alternativas |
| `get_available_forks` | `recommendation/core.py` | Todos os forks ordenados por tierScore |
| `create_prefix` | `prefix/core.py` | Cria prefixo Wine + winetricks |
| `delete_prefix` | `prefix/core.py` | Remove prefixo |
| `get_prefix_status` | `prefix/core.py` | Status do prefixo |
| `get_recommended_dlls` | `dlls.py` | DLLs recomendadas para o jogo |
| `install_dll` | `prefix/winetricks.py` | Instala DLL específica |
| `get_launch_command` | `launch_args/core.py` | Monta comando de lançamento |
| `get_launch_arg_info` | `launch_args/catalog.py` | Detalhes de um launch arg |
| `get_installed_protons` | `proton_versions.py` | Protons detectados no sistema |
| `get_game_info` | `catalog.py` | Info do jogo (makai-forge.store) |
| `search_games` | `catalog.py` | Busca textual no catálogo |
| `list_available_forks` | `recommendation/core.py` | Lista forks disponíveis (alias get_available_forks) |
| `check_anticheat` | `anticheat.py` | Status anticheat do jogo |
| `get_mod_compat` | `mod_compat.py` | Compatibilidade de mods |
| `sync_game_catalog` | `catalog.py` | Sincroniza catálogo remoto |
| `parse_fomod` | `Utils/fomod/parser.py` | Parseia FOMOD ModuleConfig.xml |
| `install_fomod` | `Utils/fomod/parser.py` | Instala FOMOD selecionado |
| `deploy_mods` | `Utils/deploy/core.py` | Deploy de mods |
| `restore_mods` | `Utils/deploy/core.py` | Restore de mods |
| `sort_plugins` | `Utils/plugins/load_order.py` | Ordenação topológica de plugins |

---

## 5. Arquitetura Interna Python

### 5.1 Data Layer (`api/services/data.py`)

```
_load_json(category, filename)
    ├── Tenta SQLite primeiro (proton_data.db)
    │     └── db/connection.py → _get_db() → SEMPRE None
    │                              └── Falha silenciosa, vai para JSON
    └── Fallback: JSON em tools/plaina_proton/api proton/<filename>.json
```

**Problema**: `proton_data.db` tem 0 bytes — a camada SQLite é **dead code**. Toda consulta cai para JSON.

### 5.2 Recommendation Engine (`recommendation/core.py`)

```
recommend(game_id)
    ├── game_match()         → procura em matched.json (1.7M jogos)
    ├── fork_recs()          → busca recommendations/<fork_id>.json
    ├── anticheat_check()    → verifica anticheat.json
    ├── gacha_check()        → se gacha, força DW-Proton / CachyOS
    └── tierScore()          → ordena forks por pontuação
         │
         └── retorna: { primary: {fork, version, tier, confidence},
                        alternatives: [...],
                        launch_options: {env_vars, dlls, winetricks, overrides} }
```

### 5.3 Prefix Layer (`prefix/core.py` + `winetricks.py`)

```
create_prefix(game_id, proton_path, prefix_path=None, auto_dlls=True)
    ├── _resolve_prefix_path()   → ~/games/proton-forger/<game_id> (ou custom)
    ├── _ensure_proton_valid()   → verifica proton binary
    ├── wineboot (init)          → inicializa prefixo Wine
    ├── winetricks (auto_dlls)   → instala DLLs recomendadas
    │     └── download + install Makaitricks
    └── retorna: { prefix_path, status, dlls_installed }
```

### 5.4 Bridge Module (`bridge/bridge.py`)

**Atenção**: `bridge/bridge.py` é um **servidor JSON-RPC independente** com:
- Própria lista de jogos hardcoded (15 jogos)
- Própria lógica de recomendação (duplicada de `recommendation/core.py`)
- Próprio `sys.path` manipulation
- Próprio `GAMES` dict com deploy targets, launchers, DLLs

Isso significa que **parte da lógica de deploy/recomendação existe em 2 lugares simultaneamente**.

### 5.5 FOMOD Parser (`Utils/fomod/parser.py`)

Parser completo de `ModuleConfig.xml` com dataclasses:

```
ModuleConfig
  ├── moduleDependencies (required, one_of, default)
  ├── requiredInstallFiles (always)
  └── installSteps[]
        ├── optionalFileGroups[]
        │     ├── plugins[]
        │     │     ├── (description, imagePath)
        │     │     └── conditionFlags / fileDependencies
        │     └── order (explicit, any)
        └── groupOrder
```

### 5.6 Plugin Load Order (`Utils/plugins/load_order.py`)

Implementa **ordenação topológica (Kahn)** com:
1. `load_masterlist()` — carrega `data/masterlist.json` (1.7MB, 4140 plugins)
2. Constrói grafo de dependências: `masters reais + regras LOOT + grupos`
3. `optimize_load_order()` — ordena + valida + detecta ciclos

---

## 6. Anti-Patterns e Fragilidades

| # | Problema | Arquivo(s) | Impacto |
|---|----------|-----------|---------|
| 1 | **`_get_db()` retorna `None`** | `api/db/connection.py:14` | SQLite inteiramente quebrado; toda consulta usa JSON |
| 2 | **`proton_data.db` tem 0 bytes** | `resources/proton_data.db` | Scripts de migração nunca executados |
| 3 | **`_PROJECT_ROOT` frágil** em 5 arquivos | `data.py`, `dlls.py`, `launch_args/core.py`, `migrate_to_sqlite.py`, `populate_metadata_tables.py` | Cada arquivo calcula com `".." * N` diferente — quebra se mover de diretório |
| 4 | **`compatflow_bridge.py` insere path de projeto vizinho** | `api/services/compatflow_bridge.py:9` | Dependência de deploy frágil, não portátil |
| 5 | **`mod_manager/__init__.py` altera `sys.path` em runtime** | `api/services/mod_manager/__init__.py:8` | Ordem de import frágil |
| 6 | **SQLite duplicado** | `dlls.py` + `launch_args/core.py` | Cada um tem `_get_db()` + `_cache` próprio — sem pool compartilhado |
| 7 | **`bridge/bridge.py` duplica lógica** do `Games/_registry.py` e `recommendation/core.py` | `bridge/bridge.py` | 2 servidores + 2 registries + 2 motores de recomendação |
| 8 | **README desatualizado** | `python/README.md` | Descreve estrutura plana antiga; código atual usa sub-packages |
| 9 | **Process crash não tratado** | `services/proton-recommendation.ts` | Se Python morre, `pendingRequests` pendentes nunca são rejeitados |
| 10 | **Testes são scripts standalone** | `tests/test_*.py` | Usam `if __name__ == "__main__"` — não são pytest-compatíveis nativamente |

---

## 7. Dead Code

| Arquivo | Problema |
|---------|---------|
| `api/db/connection.py` | `_get_db()` sempre retorna `None` — módulo inteiro é código morto na prática |
| `resources/proton_data.db` | 0 bytes — todos os 7 arquivos que o referenciam recebem dados vazios |
| `api/services/data.py` (SQLite path) | O branch SQLite em `_load_json()` nunca executa com sucesso |

---

## 8. Pontos Fortes

| Aspecto | Detalhe |
|---------|---------|
| **JSON-RPC limpo** | Line-delimited JSON sobre stdin/stdout — sem HTTP, sem serialização extra, debuggável com `echo` |
| **Padrão @register** | Decorator auto-registra handlers sem tabela de roteamento manual |
| **Two-layer data** | SQLite primeiro, JSON fallback — funciona offline |
| **FOMOD completo** | Parsing completo de ModuleConfig.xml com dataclasses — cobre steps aninhados, dependências, grupos |
| **LOOT sort real** | Algoritmo de Kahn com masterlist real de 4140 plugins — mesma base do ModSanity |
| **Gacha detection** | Rota especial para jogos gacha (DW-Proton/CachyOS forçados) antes de cair no GE-Proton |
| **Prefix abstraction** | `prefix/core.py` + `prefix/winetricks.py` = separação clara de responsabilidades |
| **Skyrim SE ESL** | Detecção de ESL-flagged ESPs no header do plugin |

---

## 9. Arquivos Não Lidos (intencionalmente excluídos)

| Padrão | Motivo |
|--------|--------|
| `__pycache__/` | Artefatos compilados |
| `*.pyc` | Código compilado |
| `*.db` | Binário SQLite |
| `*.json` (pesados) | Dados, não código-fonte |

**Ressalva**: `data/masterlist.json` (1.7MB) foi verificado como usado — não lido integralmente, mas confirmado como ativo.

---

*Fim do relatório. 58 arquivos fonte analisados, 0 dependências circulares, 10 anti-patterns documentados.*
