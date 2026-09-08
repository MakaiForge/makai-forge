# Plano de Migração: Node.js → Python via Venv

> Electron = thin client (UI + IPC bridge)
> Python = cérebro (toda lógica de sistema)
> Data: Julho 2026
> Venv: `/home/cas/Documentos/Makai-forge/tools/venv`

---

## Princípios

1. **Electron é só a interface** — React renderiza, IPC envia/recebe JSON
2. **Python faz tudo** — filesystem, spawn, download, deploy, detection, storage
3. **RPC único** — em vez de 3 canais diferentes (ModBridge, PythonCLI, ProtonForgeRPC), ter **um** protocolo JSON-lines via stdin/stdout
4. **Nada de child_process.spawn no Node.js** — zero operações de sistema no Electron
5. **Makaitricks é o winetricks** — não citar winetricks nunca mais

---

## Arquitetura Final

```
┌──────────────────────────────────────────────────────┐
│  UI (React) — ModManager.tsx + hooks                  │
│  Apenas renderiza estado e envia comandos             │
├──────────────────────────────────────────────────────┤
│  IPC Bridge (Electron main)                           │
│  events/*.ts → cada handler faz uma chamada RPC       │
│  ao Python e devolve o resultado pra UI               │
├──────────────────────────────────────────────────────┤
│  Python RPC Server (core/server.py)                    │
│  Escuta stdin, responde stdout (JSON-lines)           │
│  Métodos: play_game, install_mod, deploy, detect,     │
│           create_prefix, install_framework, etc.       │
│  ├── core/engine/   → proton, prefix, launch          │
│  ├── core/Games/    → 25+ game handlers               │
│  └── core/Utils/    → 31+ utility modules             │
└──────────────────────────────────────────────────────┘
```

---

## Fases

### Fase 0 — Infraestrutura (esta semana)
Criar o RPC server unificado e provar que funciona.

**Tarefas:**
- [ ] Criar `core/server.py` — servidor RPC JSON-lines que escuta comandos
- [ ] Criar `core/bridge.py` — cliente Node.js que se comunica com o server
- [ ] Testar: Electron envia `{id, method: "ping", params: {}}`, Python responde `{id, result: "pong"}`
- [ ] Converter `ModStorageService` para Python primeiro (já existe `config_paths.py`)
- [ ] Substituir chamadas a `ModBridge`, `ProtonForgeRPC`, `PythonCLI` pela bridge unificada

### Fase 1 — Play API (2 semanas)
O Play Flow é o pipeline mais crítico e onde ocorre o travamento.

**Tarefas:**
- [ ] Criar `core/play.py` — função `play_game(game_id, mode="stream")`
  - [ ] `load_config()` — ler config do jogo do storage
  - [ ] `detect_game()` — encontrar jogo (Steam/GOG)
  - [ ] `ensure_proton()` — localizar/instalar Proton
  - [ ] `ensure_prefix()` — criar prefix Wine
  - [ ] `bridge_to_steam()` — symlink compatdata
  - [ ] `apply_configs()` — DLL overrides + Makaitricks + registry
  - [ ] `ensure_frameworks()` — BepInEx/SMAPI/CET
  - [ ] `ensure_script_extender()` — SKSE/FOSE/F4SE
  - [ ] `deploy_mods()` — hardlink → symlink → copy
  - [ ] `launch_game()` — spawn Proton
  - [ ] Streaming de progresso via stdout (eventos JSON)

- [ ] Remover `play/play-game.ts`, `play/steps/*`, `play/python.ts`
- [ ] Remover `services/environment-scanner.ts`
- [ ] Remover `services/skse-downloader.ts`
- [ ] Remover `services/framework-installer.ts`
- [ ] Remover `services/external-tool-installer.ts`

### Fase 2 — Deploy API (1 semana)
**Tarefas:**
- [ ] Consolidar `core/Utils/deploy.py` com a lógica do `mod-deploy/core.ts`
  - [ ] hardlink → symlink → copy cascade
  - [ ] batches de 16
  - [ ] filemap (mapeamento de arquivos)
- [ ] Remover `services/mod-deploy/`
- [ ] Remover `games/_shared/symlink.ts`

### Fase 3 — Install API (1 semana)
**Tarefas:**
- [ ] Consolidar `core/install.py` com a pipeline do `services/install/`
  - [ ] `read_archive()`
  - [ ] `extract()`
  - [ ] `verify()`
  - [ ] `detect_type()`
  - [ ] `inventory()`
  - [ ] `write_meta()`
- [ ] Converter `install/mod-index.ts` para Python
- [ ] Remover `services/install/orchestrator.ts`

### Fase 4 — Mod Management API (2 semanas)
**Tarefas:**
- [ ] FOMOD: consolidar `Utils/fomod_parser.py` + `Utils/fomod_installer.py`
  - [ ] Remover `services/fomod/*`
- [ ] Plugin sort: consolidar `Utils/plugin_sort.py`
  - [ ] Remover `services/plugin-sort-service.ts`
- [ ] Load order LOOT: já vai pro ModBridge (Python)
- [ ] ESLify: já é Python
- [ ] Backup: consolidar `Utils/backup.py`
  - [ ] Remover `services/mod-backup-service.ts`
- [ ] Conflitos: consolidar `Utils/conflict.py`

### Fase 5 — Game Modules (2 semanas)
Consolidar os 33 GameModules TypeScript com os 25+ game handlers Python.

**Tarefas:**
- [ ] Mapear cada GameModule TS → game handler Python
- [ ] Garantir que deploy target, routing, frameworks, DLLs, winetricks estão corretos no Python
- [ ] Remover `games/registry.ts` e `games/*/`
- [ ] Remover `games/_shared/filemap.ts`
- [ ] Remover `games/_shared/prefix.ts`

### Fase 6 — Storage Unificado (1 semana)
**Tarefas:**
- [ ] Storage Python como fonte única de verdade
- [ ] Node.js consulta storage via RPC em vez de `ModStorageService`
- [ ] Remover `services/mod-storage-service.ts`

### Fase 7 — Limpeza Final (1 semana)
**Tarefas:**
- [ ] Remover todos os arquivos de sistema do Node.js
- [ ] Verificar que zero `child_process.spawn`/`execSync`/`fs.*Sync` existe nos handlers
- [ ] Testar todos os 65 canais IPC → RPC
- [ ] Remover `services/` inteiro (só guardar bridge context e storage client)

---

## RPC Protocol

Formato JSON-lines (uma linha por mensagem):

### Request (Node.js → Python)
```json
{"id": 1, "method": "play_game", "params": {"game_id": "skyrim", "mode": "stream"}}
```

### Response (Python → Node.js)
Resultado único:
```json
{"id": 1, "result": {"pid": 12345, "status": "running"}}
```

Erro:
```json
{"id": 1, "error": {"code": "PREFIX_NOT_FOUND", "message": "..."}}
```

### Event (Python → Node.js, sem id)
Streaming de progresso:
```json
{"event": "progress", "step": "prefix", "message": "Criando prefixo...", "percent": 30}
{"event": "progress", "step": "frameworks", "message": "Instalando BepInEx...", "percent": 55}
{"event": "log", "level": "info", "message": "Proton encontrado em /path/to/proton"}
```

---

## Estrutura Final Esperada

```
Mods_manager/
├── core/
│   ├── server.py               ← RPC server (único ponto de entrada)
│   ├── bridge.py                ← Client Node.js (opcional, Electron usa HTTP/stdin)
│   ├── play.py                  ← Play flow completo
│   ├── install.py               ← Install pipeline
│   ├── deploy.py                ← Deploy engine
│   ├── storage.py               ← JSON store
│   ├── detection.py             ← Steam/GOG detection
│   ├── fomod_parser.py          ← FOMOD XML parser
│   ├── fomod_installer.py       ← FOMOD installer
│   ├── plugin_sort.py           ← Plugin topological sort
│   ├── conflict.py              ← Mod conflict detection
│   ├── backup.py                ← Backup/restore
│   ├── scan_env.py              ← Environment scanning
│   ├── eslifier.py              ← .esp → .esl conversion
│   ├── engine/
│   │   ├── proton.py            ← Proton finder/installer
│   │   ├── prefix.py            ← Prefix creator/validator
│   │   ├── launch.py            ← Game launcher (spawn proton/umu)
│   │   ├── registry.py          ← Wine registry operations
│   │   ├── makaitricks.py       ← Makaitricks wrapper
│   │   └── network.py           ← Download helpers
│   ├── Games/                   ← 25+ game handlers (já existe)
│   └── Utils/                   ← 31+ utilities (já existe)
│
├── ui/                          ← React (Electron thin client)
├── events/                      ← IPC handlers (cada um vira RPC call)
│
├── docs/
│   └── PLAN_MIGRATION.md        ← Este arquivo
│
└── play/                        ← **REMOVIDO** (substituído por core/play.py)
    services/                    ← **REMOVIDO** (substituído por core/*.py)
    games/                       ← **REMOVIDO** (substituído por core/Games/)
```

---

## Critérios de Sucesso

- [ ] `npx tsc --noEmit` passa sem erros após cada fase
- [ ] Play flow roda 100% em Python: Electron só mostra overlay de progresso
- [ ] Install flow chama Python pra extrair, detectar, inventariar
- [ ] Deploy usa Python (hardlink → symlink → copy)
- [ ] Storage centralizado no Python, Electron consulta via RPC
- [ ] Zero `child_process.spawn` ou `fs.*Sync` nos handlers IPC
- [ ] Makaitricks é o único winetricks usado

---

## Prioridades Imediatas (Fase 0)

1. Criar `core/server.py` com método `ping` e `storage_get`/`storage_put`
2. Criar `core/bridge.py` ou adaptar IPC handlers para chamar o server
3. Fazer o Electron iniciar o server.py junto com o app (ou via forked process)
4. Verificar que `useGameConfig` e `saveGameConfig` funcionam via Python
5. Remover dependência direta de `ModStorageService` nos handlers existentes
