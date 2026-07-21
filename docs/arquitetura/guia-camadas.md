# Guia de Arquitetura — Python vs TypeScript

## Princípio: cada camada faz o que faz melhor

| Camada | Responsabilidade | Linguagem |
|--------|-----------------|-----------|
| **IPC Bridge** | Comunicação com Python | Python (bridge.py) |
| **Serviços de Mod** | Deploy, extração, FOMOD, plugins, ini | TypeScript (main process) |
| **Serviços de Proton** | Detecção Steam, prefix, DLLs | TypeScript (main process) |
| **API de Recomendação** | matched.json, forks, hardware matching | Python (server.py) |
| **Catálogo de Jogos** | SQLite + buscas | Python (via bridge) |
| **Renderizador** | UI, estado, chamadas IPC | TypeScript (React) |

---

## O que cada um faz (e o que o outro NÃO faz)

### ✅ TypeScript faz (main process)
| Tarefa | Arquivo |
|--------|---------|
| Deploy de mods (symlinks) | `services/mod-deploy-service.ts` |
| Extração de arquivos (7z/zip) | `services/mod-deploy-service.ts` |
| Parse FOMOD XML | `services/fomod/fomod-parser.ts` |
| Detecção de conflitos | `events/mods/mod-conflicts.ts` |
| Detecção Steam + Proton (VDF, App ID) | `events/mods/mod-proton.ts` |
| Configuração de prefixo Wine | `events/mods/mod-proton.ts` (ProtonfixService) |
| Lista de arquivos/plugins/ini | `events/mods/mod-media.ts`, `mod-plugins.ts`, `mod-ini.ts` |
| Storage (SQLite) | `services/db/sqlite-store.ts` |

### ✅ Python faz (via bridge ou server.py)
| Tarefa | Arquivo | Conectado? |
|--------|---------|-----------|
| Listar jogos (hardcoded 42) | `bridge/bridge.py:cmd_list_games` | ✅ Sim |
| Descobrir jogos Steam instalados | `bridge/bridge.py:cmd_discover_games` | ✅ Sim (+ steam_finder.py) |
| Listar perfis | `bridge/bridge.py:cmd_list_profiles` | ✅ Sim |
| Recomendar Proton (matched.json) | `api/services/recommendation/core.py` | ❌ Não |
| Catálogo SQLite (busca) | `api/services/catalog.py` | ❌ Não |
| Instalar DLLs (winetricks) | `api/services/prefix/winetricks.py` | ❌ Não |
| Launch args por jogo | `api/services/launch_args/core.py` | ❌ Não |

### ❌ Stubs (nada faz)
| Tarefa | Status | Alternativa |
|--------|--------|------------|
| Deploy via Python | Stub "requires Amethyst" | TS `ModDeployService.deploy()` ✅ |
| Restore via Python | Stub | TS `ModDeployService.restore()` ✅ |
| FOMOD via Python | Stub | TS `FomodService` ✅ |
| LOOT sort | Stub | N/A (não tem LOOT no Linux) |

---

## Fluxo de Decisão: Onde implementar uma feature nova

```
Feature nova
├── É sobre gerenciamento de mods (deploy/extração/plugins)?
│   ├── Sim → TypeScript (main process)
│   └── Não ↓
├── É sobre detecção de jogo Steam ou Proton (VDF/appmanifest)?
│   ├── Sim → TypeScript (main process) + steam_finder.py (bridge)
│   └── Não ↓
├── É sobre recomendação de Proton (matched.json, hardware matching)?
│   ├── Sim → Python API (server.py, a conectar)
│   └── Não ↓
├── É sobre catálogo de jogos ou busca (SQLite)?
│   ├── Sim → Python (via bridge)
│   └── Não ↓
├── É sobre DLLs, winetricks, launch args?
│   ├── Sim → Python API (server.py) ou TS (mod-proton.ts)
│   └── Não ↓
└── É UI/estado/eventos?
    └── TypeScript (renderer React)
```

---

## Dependências entre camadas

```
Renderer (React)
  │
  ├── IPC → Main Process (TypeScript)
  │     ├── mod-storage.ts       → SQLite
  │     ├── mod-deploy.ts        → ModDeployService (extração, deploy)
  │     ├── mod-fomod.ts         → FomodService (XML parsing)
  │     ├── mod-proton.ts        → ProtonfixService (Steam, prefix)
  │     ├── mod-config.ts        → SqliteStore (game configs)
  │     ├── mod-media.ts         → FileSystem (mod files)
  │     └── mod-bridge.ts        → subprocess Python bridge
  │
  └── IPC → Bridge (Python)
        ├── list_games           → GAMES[42] + configs
        └── discover_games       → steam_finder.py → libraryfolders.vdf
```

## Por que não unificar tudo em TypeScript?

| Motivo | Explicação |
|--------|-----------|
| **matched.json (1.5GB+)** | TS não tem `ijson` — parse incremental de JSON gigante é nativo no Python |
| **Winetricks** | Python tem `subprocess` + `shutil` maduros; TS dependeria de `child_process` |
| **SQLite grande** | Catálogo de 263MB com FTS5 — Python tem `sqlite3` built-in com timeout/WAL |
| **Algoritmos de matching** | Cálculo de distância de hardware (GPU/CPU/RAM) — Python com numpy seria melhor |
