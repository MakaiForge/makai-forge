# Arquitetura Makai Forge — Plano de Modelização

## Princípio Fundamental
**Electron = UI / Python = Backend único**
Zero chamadas de sistema no Electron. Todo spawn de processo, acesso a
sistema de arquivos, container, Proton, prefixo → via RPC Python.

---

## Protocolo RPC (já existe)
JSON-lines sobre stdin/stdout do processo Python persistente.

```
Request:  {"id":1, "method":"play_game", "params":{"game_id":"x"}}
Response: {"id":1, "result":{"success":true, "pid":1234}}
Event:    {"event":"progress", "step":"launch", "message":"Iniciando..."}
```

O RPC server vive em `tools/Mods_manager/core/server.py` (ÚNICO servidor,
unificado em 15/07/2026 — substituiu protonforge-api e proton_recommended).

---

## Onde está o código (paths REAIS)

| Componente | Path real |
|---|---|
| RPC Server | `tools/Mods_manager/core/server.py` |
| Play flow | `tools/Mods_manager/core/play.py` |
| Engine (launch, proton, registry, makaitricks) | `tools/Mods_manager/core/engine/` |
| Storage | `tools/Mods_manager/core/storage.py` |
| Detection | `tools/Mods_manager/core/detection.py` |
| Deploy | `tools/Mods_manager/core/deploy.py` |
| Makai Time entry point | `tools/prefix/makai_time/makai_time.py` |
| Makai Time core | `tools/prefix/makai_time/core/` (container, gpu, sync, runtime, display, ldso) |
| Makai Time overrides | `tools/prefix/makai_time/overrides/` (capture, detect, mount) |
| Makai Time profiles | `tools/prefix/makai_time/profiles/` |
| Makai Time proton | `tools/prefix/makai_time/proton/` (definitions, intel, recommender) |
| Makaitricks | `tools/prefix/python/prefix/makaitricks.py` |
| Electron RPC bridge | `tools/Mods_manager/services/makai-rpc.ts` |
| Electron RPC bridge (deprecated) | `src/main/services/protonforge-rpc.ts` → delega ao MakaiRPC |

---

## Mapeamento: Electron → RPC Python

### 1. GAME LIFECYCLE

#### `play_game(game_id, profile?)` → `tools/Mods_manager/core/play.py:play_game()`

| Electron (O QUE REMOVER) | Linhas | O que faz |
|---|---|---|
| `tools/Mods_manager/play/steps/07-launch.ts` | 208-362 | spawn umu-run, proton direto |
| `data/install-api/ForgePipeline/services/makai-time.ts` | 106 | spawn `python3 -m makai_time.makai_time` |
| `data/install-api/ForgePipeline/helpers/launch-game.ts` | 58-330 | spawn wine, nativo, MakaiTime |
| `data/install-api/ForgePipeline/services/umu.ts` | 221 | spawn umu-run |
| `tools/Mods_manager/services/launch-service.ts` | — | spawn umu-run |
| `tools/Mods_manager/games/_shared/launch.ts` | — | spawn umu/proton |

**Python handler**: `tools/Mods_manager/core/play.py:play_game()` (JÁ EXISTE)
- Step 1: detecta jogo (core/detection.py)
- Step 2: encontra Proton (core/engine/proton.py)
- Step 3: cria prefixo (core/play.py:_step_prefix → prefix.core)
- Step 4: DLL overrides (core/play.py:_step_dll_overrides)
- Step 5: Bethesda registry (core/play.py:_step_bethesda_registry)
- Step 6: Makaitricks (core/play.py:_step_makaitricks)
- Step 7: Script extender (core/play.py:_step_script_extender)
- Step 8: Deploy mods (core/play.py:_step_deploy)
- Step 9: **Launch** → `core/engine/launch.py:_launch_with_proton()` → **Makai Time**
  (único método — sem fallbacks desde 15/07/2026)

**Makai Time** = ÚNICO método de execução. Sem fallback para umu-run,
pressure-vessel, ou Proton direto.

---

#### `kill_game(pid?)` → `tools/Mods_manager/core/server.py` → `core/engine/launch.py:kill_game()`

| Electron | Linhas | O que faz |
|---|---|---|
| `tools/Mods_manager/play/steps/07-launch.ts` | 70-100 | killGameProcess, pkill wineserver |
| `tools/Mods_manager/play/index.ts` | 70-78 | MakaiRPC.call("kill_game") + killGameProcess() |
| `src/main/services/kill-process.ts` | — | NativeAddon.killProcess |

**Python handler**: JÁ EXISTE em `core/engine/launch.py`
- `kill_game(pid)` → SIGTERM → SIGKILL
- `kill_stale_wineserver()` → pkill -9 wineserver
- RPC: `kill_game` (registrado no server.py)

---

#### `game_status(game_id?)` → `tools/Mods_manager/core/server.py:handle_game_status()`

| Electron | O que faz |
|---|---|
| Polling de processo ativo | `NativeAddon.listProcesses()` |

**Python handler**: JÁ EXISTE (RPC `game_status` — server.py)
- `status(game_id)` → {alive, pid, uptime, method}

---

### 2. PREFIX MANAGEMENT

#### `create_prefix(prefix_path, proton_path?)` → RPC `create_prefix`

| Electron | Linhas | O que faz |
|---|---|---|
| `data/install-api/ForgePipeline/orchestrator/prefix-setup.ts` | 68 | spawn umu-run wineboot -u |
| `tools/prefix/core/init.ts` | — | checkAndCreateWinePrefix |
| `tools/prefix/events/setup-proton-environment.ts` | — | setup completo |

**Python handler**: RPC `create_prefix` (server.py) → `prefix.core.create_prefix()`

---

#### `prefix_dll_overrides(path, overrides)` → JÁ EXISTE em `core/play.py`

| Electron | Linhas |
|---|---|
| `tools/prefix/core/dll-overrides.ts` | — |

---

#### `prefix_bethesda_registry(path, game)` → JÁ EXISTE em `core/play.py`

| Electron | Linhas |
|---|---|
| `tools/prefix/core/bethesda-registry.ts` | — |

---

### 3. PROTON MANAGEMENT

#### `list_protons()` → RPC `get_installed_protons`

| Electron | O que faz |
|---|---|
| `tools/proton-tools/main/services/tools.ts` | lista ~31 forks de Proton |
| `data/install-api/ForgePipeline/events/open-game/ensure-proton.ts` | verifica Proton instalado |

**Python handler**: JÁ EXISTE — RPC `get_installed_protons`, `list_available_forks`

---

### 4. INSTALLER

#### `install_executable(exe, prefix_path, proton_path?, env?)` → RPC `get_launch_command`

| Electron | Linhas | O que faz |
|---|---|---|
| `data/install-api/ForgePipeline/orchestrator/runner.ts` | 26 | MakaiTime.runInstaller() |
| `data/install-api/ForgePipeline/events/open-game/execute-installer.ts` | — | executa .exe |

**Python handler**: JÁ EXISTE — RPC `get_launch_command`

---

#### `extract_archive(archive, dest)` → RPC `extract_archive`

| Electron | Linhas |
|---|---|
| `data/install-api/scripts-install/extractor.ts` | — |

**Python handler**: JÁ EXISTE — RPC `extract_archive`

---

#### `install_framework(framework, prefix_path)` → RPC `install_game_dlls` / `install_makaitricks`

| Electron | Linhas |
|---|---|
| `tools/Mods_manager/play/steps/05-frameworks.ts` | — |
| `tools/Mods_manager/services/framework-installer.ts` | — |
| `data/install-api/ForgePipeline/events/open-game-winetricks.ts` | — |

**Python handler**: JÁ EXISTE — RPC `install_game_dlls`, `install_makaitricks`

---

#### `install_script_extender(game, prefix_path)` → JÁ EXISTE em `core/play.py`

| Electron | Linhas |
|---|---|
| `tools/Mods_manager/play/steps/06-skse.ts` | — |
| `tools/Mods_manager/services/skse-downloader.ts` | — |

**Python**: `core/play.py:_step_script_extender` (JÁ EXISTE)

---

### 5. SYSTEM / DETECTION

| Método RPC | Handler Python | Status |
|---|---|---|
| `gpu_info` | `makai_time/core/gpu.py:info()` | ✅ |
| `sync_info` | `makai_time/core/sync.py:info()` | ✅ |
| `runtime_info` | `tools/Mods_manager/core/server.py` | ✅ |
| `health_check` | `tools/Mods_manager/core/server.py` | ✅ |
| `analyze_exe` | `protonforge-api/api/services/compatflow_bridge.py` | ✅ |

---

### 6. GAME CONFIG / STORAGE

| Método RPC | Handler | Status |
|---|---|---|
| `storage_get/put/delete/keys/entries` | `core/storage.py` | ✅ |
| `game_config` | `play.py:_load_game_config` | ✅ |

---

### 7. DOWNLOAD

| Método RPC | Handler | Status |
|---|---|---|
| `download_file` | `server.py` (urllib) | ✅ |
| `extract_archive` | `server.py` (zipfile/tarfile/7z) | ✅ |

---

## Resumo: O Que cada Arquivo Electron Vira

| Arquivo Electron | Ação | Vira |
|---|---|---|
| `tools/Mods_manager/play/steps/07-launch.ts` | REMOVER | RPC `play_game` (backend decide método) |
| `tools/Mods_manager/play/index.ts` | MANTER | IPC → RPC `play_game` (já faz) |
| `tools/Mods_manager/play/steps/04-configs.ts` | REMOVER parcial | RPC `create_prefix`, `install_game_dlls` |
| `tools/Mods_manager/play/steps/05-frameworks.ts` | REMOVER | RPC `install_game_dlls` |
| `tools/Mods_manager/play/steps/06-skse.ts` | REMOVER | RPC já existe em `play.py:_step_script_extender` |
| `tools/Mods_manager/services/launch-service.ts` | REMOVER | RPC `play_game` |
| `tools/Mods_manager/games/_shared/launch.ts` | REMOVER | RPC `play_game` |
| `tools/Mods_manager/services/framework-installer.ts` | REMOVER | RPC `install_game_dlls` |
| `tools/Mods_manager/services/skse-downloader.ts` | REMOVER | RPC já existe em Python |
| `tools/Mods_manager/services/external-tool-installer.ts` | REMOVER | RPC `download_file` |
| `data/install-api/ForgePipeline/services/makai-time.ts` | REMOVER | RPC `play_game` |
| `data/install-api/ForgePipeline/services/umu.ts` | REMOVER | Makai Time substitui |
| `data/install-api/ForgePipeline/helpers/launch-game.ts` | REMOVER | RPC `play_game` |
| `data/install-api/ForgePipeline/orchestrator/runner.ts` | REMOVER | RPC `get_launch_command` |
| `data/install-api/ForgePipeline/orchestrator/prefix-setup.ts` | REMOVER | RPC `create_prefix` |
| `data/install-api/ForgePipeline/events/open-game-winetricks.ts` | REMOVER | RPC `install_makaitricks` |
| `data/install-api/ForgePipeline/events/open-game/execute-installer.ts` | REMOVER | RPC `get_launch_command` |
| `tools/prefix/core/init.ts` | REMOVER | RPC `create_prefix` |
| `tools/prefix/core/dll-overrides.ts` | REMOVER | RPC já existe em `play.py` |
| `tools/prefix/core/bethesda-registry.ts` | REMOVER | RPC já existe em `play.py` |
| `tools/Mods_manager/services/health-check/index.ts` | REMOVER | RPC `health_check` |
| `tools/python-rpc/protonforge-api/server.py` | REMOVIDO (stub) | Unificado em server.py |
| `data/install-api/proton_recommended/python/server.py` | REMOVIDO (stub) | Unificado em server.py |
| `src/main/services/protonforge-rpc.ts` | REMOVIDO (stub) | Delega ao MakaiRPC |

---

## Fluxo Final (Target)

```
[Usuário clica "Jogar"]
         ↓
Electron IPC "modPlayGame"                     ← UI layer
         ↓
tools/Mods_manager/play/index.ts               ← IPC handler
  └─ MakaiRPC.call("play_game", {game_id, profile})
         ↓ (JSON-lines stdin)
Python RPC Server (tools/Mods_manager/core/server.py)  ← Backend
  └─ dispatch("play_game")
       └─ core.play.play_game()
            ├─ step_proton   → lê config, acha Proton
            ├─ step_prefix   → create_prefix se necessário
            ├─ step_dlls     → prefix_dll_overrides
            ├─ step_frameworks → install_game_dlls
            ├─ step_launch   → launch.py:_launch_with_proton
            │                   → makai_time.run()
            │                     → build_bwrap_cmd()
            │                     → subprocess.run(bwrap)
            └─ return {success, pid, method}
         ↓ (JSON-lines stdout)
Electron recebe resultado
  └─ UI: "Jogando..."
  └─ Polling: MakaiRPC.call("game_status", {game_id})
```

---

## Ordem de Implementação

### Fase 1 ✅ (concluída 15/07/2026)
- `server.py` unificado com 43 métodos (register pattern)
- `launch.py` sem fallbacks (apenas Makai Time)
- `kill_game`, `game_status`, `health_check` como RPC
- `protonforge-api/server.py` → stub de redirecionamento
- `proton_recommended/python/server.py` → stub de redirecionamento
- `protonforge-rpc.ts` → delega ao MakaiRPC

### Fase 2 (próximo passo)
1. Migrar `launch-service.ts` → RPC `play_game`
2. Migrar `ForgePipeline/services/umu.ts` → remover
3. Migrar `ForgePipeline/services/makai-time.ts` → remover
4. Migrar `ForgePipeline/helpers/launch-game.ts` → RPC
5. Migrar `play/steps/07-launch.ts` → RPC

### Fase 3
1. Migrar `play/steps/04-configs.ts` → RPC `create_prefix` + `install_game_dlls`
2. Migrar `play/steps/05-frameworks.ts` → RPC `install_game_dlls`
3. Migrar `play/steps/06-skse.ts` → RPC (já existe em Python)
4. Migrar `orchestrator/prefix-setup.ts` → RPC `create_prefix`
5. Migrar `events/open-game-winetricks.ts` → RPC `install_makaitricks`

### Fase 4
1. Migrar `services/framework-installer.ts` → RPC
2. Migrar `services/skse-downloader.ts` → RPC
3. Migrar `services/external-tool-installer.ts` → RPC `download_file`
4. Migrar `scripts-install/extractor.ts` → RPC `extract_archive`

### Fase 5
1. Migrar `services/health-check/index.ts` → RPC `health_check`
2. Migrar `services/launch-service.ts` → RPC `play_game`
3. Migrar `games/_shared/launch.ts` → RPC `play_game`
4. Remover `tools/proton-tools/main/services/tools.ts` → RPC `get_installed_protons`

### Fase 6
1. Remover TODO `spawn`/`execFileSync`/`execSync` do Electron
2. Electron 100% thin client
3. `index.ts` = único IPC handler
4. Python = única fonte de verdade
