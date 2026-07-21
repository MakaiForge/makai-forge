# AGENTS.md — Memória do Agente Makai Forge

## [[CORE: NUNCA ESQUECER]]

### Arquitetura do Projeto
```
Electron (TypeScript) = UI/Interface APENAS
    ↓ IPC invoke
Main Process (TypeScript) = Orquestração fina + pontes
    ↓ MakaiRPC.call() — JSON-lines stdin/stdout
Python (3.10) = Toda lógica de background
```

### Python: venv OBRIGATÓRIO
- **Path**: `/home/cas/Documentos/Makai-forge/app/_venv`
- **Versão**: Python 3.10.15
- **Usar SEMPRE**: `app/_venv/bin/python3`
- **NUNCA** usar Python do sistema

### Comunicação Electron ↔ Python
- **Protocolo**: JSON-lines sobre stdin/stdout
- **Classe bridge**: `app/_main/rpc/makai-rpc.ts` → `MakaiRPC`
- **Servidor**: `app/Catalogo/GameMod/core/server.py` (1142 linhas, 53+ métodos RPC)
- **Spawn**: `MakaiRPC.spawn()` → `cp.spawn("app/_venv/bin/python3", ["server.py", "--stdio"])`

---

## O PROBLEMA: Lógica de Games Quebrada na Refatoração

### Como ERA (arquitetura antiga — TUDO no Electron)
```
add-custom-game-to-library.ts   → salva Game no store
open-game.ts                    → orquestra reparo completo
  ├─ ensureProtonAvailable()    → baixa Proton se necessário
  ├─ createPrefixWithDlls()     → cria prefixo Wine
  ├─ downloadFromCatalog()      → baixa jogo, detecta installer vs portátil
  ├─ handlePortableGame()       → COPIA pasta p/ prefixo + SHA256 + scan
  └─ executeInstaller()         → installAndScan()
       ├─ setupPrefix()         → via ProtonRecommendationService → Python
       ├─ runInstaller()        → MakaiTime.runInstaller() → MakaiRPC
       ├─ snapshot + compare    → takeSnapshot() + findNewExecutables()
       ├─ copyFolderToPrefix()  → SHA256 verified copy
       └─ scanPrefixForExes()   → escaneia .exe no prefixo
```

### Como ESTÁ (nova arquitetura — Python é o cérebro)
```
Python (server.py) tem MÉTODOS:
  ✅ play_game()      → fluxo completo para jogos já configurados
  ✅ container_run()  → Makai Time detached (jogar)
  ✅ container_run_installer() → Makai Time wait (instalar)
  ✅ create_prefix()  → cria prefixo Wine
  ✅ install_game_dlls() → instala DLLs via Makaitricks
  ✅ analyze_exe()    → classifica .exe (game/installer/etc)

Python NÃO TEM:
  ❌ install_game()           → orquestração completa de instalação
  ❌ copy_to_prefix()         → cópia com SHA256 verification
  ❌ scan_prefix_for_exes()   → escaneia .exe no prefixo
  ❌ detect_installer_type()  → instalador vs portátil
  ❌ take_snapshot()          → estado pré-instalação
  ❌ find_new_executables()   → diff pós-instalação
```

### O QUE AINDA ESTÁ em TypeScript (e DEVERIA estar em Python)
- `app/_main/installer-api/ForgePipeline/orchestrator/orchestrator.ts` — `installAndScan()` (335 linhas)
- `app/_main/installer-api/ForgePipeline/orchestrator/prefix-copier.ts` — `copyFolderToPrefix()` (SHA256)
- `app/_main/installer-api/ForgePipeline/orchestrator/prefix-scanner.ts` — `scanPrefixForExes()`
- `app/_main/installer-api/ForgePipeline/orchestrator/snapshot.ts` — `takeSnapshot()`
- `app/_main/installer-api/ForgePipeline/orchestrator/change-detector.ts` — `findNewExecutables()`
- `app/_main/installer-api/ForgePipeline/events/open-game/handle-portable.ts` — `handlePortableGame()`
- `app/_main/installer-api/ForgePipeline/events/open-game/execute-installer.ts` — `executeInstaller()`
- `app/_main/installer-api/ForgePipeline/events/open-game/download-installer.ts` — `downloadFromCatalog()` + detecção

### POR QUE QUEBROU
1. `handlePortableGame()` chama `copyFolderToPrefix()` + `scanPrefixForExes()` → TUDO em TS, deveria ser Python
2. `executeInstaller()` chama `installAndScan()` → fluxo complexo em TS que mistura chamadas Python (prefix, run) com lógica TS (snapshot, copy, scan)
3. `MakaiTime.runInstaller()` existe mas os resultados (`exitCode`) não são usados para detectar novos arquivos
4. `play_game()` em Python existe mas é para jogos PRONTOS (com prefixo, .exe configurado) — não cobre o fluxo de "primeira instalação"

---

## O QUE PRECISA SER RECRIADO em Python

### 1. RPC Methods Novos em `server.py`

```python
@register("install_game")
def handle_install_game(params):
    """
    Fluxo completo de instalação.
    params: {
        source_path: str,       # .exe ou pasta do jogo
        prefix_path: str,
        proton_path: str,
        game_id: str,
        existing_exe_path: str | None,
    }
    Returns: {
        success: bool,
        candidates: [{path, name, size}],
        suggested_dir: str | None,
        installed_dlls: [str],
    }
    """
    # 1. Detecta se source é installer ou portátil
    # 2. Se portátil: copy_to_prefix(source, prefix) + scan
    # 3. Se installer: run_installer + snapshot + find_new_exes
    # 4. Se nada encontrado: copy_to_prefix + scan
    # 5. Retorna candidatos
```

```python
@register("copy_to_prefix")
def handle_copy_to_prefix(params):
    """
    Copia pasta para prefixo com SHA256 verification.
    params: { source_path, prefix_path }
    Returns: { success, dest_path, files_count, hashes_ok }
    """
```

```python
@register("scan_prefix_for_exes")
def handle_scan_prefix_for_exes(params):
    """
    Escaneia prefixo por .exe jogáveis.
    params: { prefix_path }
    Returns: { candidates: [{path, name, size}], suggested_dir }
    """
```

```python
@register("detect_installer_type")
def handle_detect_installer_type(params):
    """
    Detecta se source é installer ou portátil.
    params: { source_path }
    Returns: { is_installer: bool, installer_path: str | None }
    """
```

### 2. Lógica de Detecção (copiar de `download-installer.ts`)

```python
INSTALLER_PATTERNS = [re.compile(r"setup", re.I), re.compile(r"install", re.I), re.compile(r"msi", re.I)]

def detect_installer_type(source_path: str) -> dict:
    if os.path.isfile(source_path):
        ext = os.path.splitext(source_path)[1].lower()
        if ext in (".exe", ".msi"):
            return {"is_installer": True, "installer_path": source_path}
        return {"is_installer": False, "installer_path": None}
    
    # Pasta: procurar .exe com nome de instalador
    for root, dirs, files in os.walk(source_path):
        depth = root[len(source_path):].count(os.sep)
        if depth > 2:
            continue
        for f in files:
            if f.lower().endswith(".exe") and any(p.search(f) for p in INSTALLER_PATTERNS):
                return {"is_installer": True, "installer_path": os.path.join(root, f)}
    
    return {"is_installer": False, "installer_path": None}
```

### 3. Lógica de Cópia (copiar de `prefix-copier.ts`)

```python
import hashlib, os, shutil

def copy_to_prefix(source_path: str, prefix_path: str) -> dict:
    drive_c = os.path.join(prefix_path, "drive_c")
    folder_name = os.path.basename(source_path)
    dest_path = os.path.join(drive_c, folder_name)
    
    if os.path.exists(dest_path):
        shutil.rmtree(dest_path)
    
    # SHA256 pré-cópia
    source_hashes = {}
    for root, dirs, files in os.walk(source_path):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, source_path)
            source_hashes[rel] = _sha256(full)
    
    # Cópia
    for rel, src_hash in source_hashes.items():
        dest_file = os.path.join(dest_path, rel)
        os.makedirs(os.path.dirname(dest_file), exist_ok=True)
        shutil.copy2(os.path.join(source_path, rel), dest_file)
    
    # SHA256 pós-cópia + verificação
    dest_hashes = {}
    for root, dirs, files in os.walk(dest_path):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, dest_path)
            dest_hashes[rel] = _sha256(full)
    
    mismatches = []
    for rel, expected in source_hashes.items():
        actual = dest_hashes.get(rel)
        if actual != expected:
            mismatches.append(rel)
    
    return {
        "success": len(mismatches) == 0,
        "dest_path": dest_path,
        "files_count": len(source_hashes),
        "mismatches": mismatches,
    }
```

### 4. Lógica de Snapshot (copiar de `snapshot.ts` + `change-detector.ts`)

```python
def take_snapshot(prefix_path: str) -> dict:
    """Registra estado atual do prefixo (arquivos .exe + stats)."""
    snapshot = {}
    for root, dirs, files in os.walk(os.path.join(prefix_path, "drive_c")):
        for f in files:
            if f.lower().endswith(".exe"):
                full = os.path.join(root, f)
                try:
                    stat = os.stat(full)
                    snapshot[full] = {"size": stat.st_size, "mtime": stat.st_mtime}
                except OSError:
                    pass
    return snapshot

def find_new_executables(before: dict, after: dict) -> list:
    """Compara snapshots, retorna .exe novos."""
    new = {}
    for path, info in after.items():
        if path not in before:
            new[path] = info
    return [{"path": p, "name": os.path.basename(p), "size": info["size"]} for p, info in new.items()]
```

---

## FLUXO REFATORADO (Electron UI + Python Background)

```
RENDERER (React)
  │
  │ "Add Custom Game" → seleciona .exe + título
  │ "Play" → clica no jogo
  │
  ▼
MAIN PROCESS (Electron TS) — ORQUESTRAÇÃO MÍNIMA
  │
  ├─ addCustomGameToLibrary()
  │   → Salva Game no store (SQLite)
  │   → Cria diretório do prefixo
  │   → Salva JSON backup
  │
  ├─ openGame()
  │   → Verifica se precisa reparo
  │   → Se NÃO precisa: MakaiRPC.call("container_run", params)
  │   → Se PRECISA: abre janela de progresso + chama Python
  │
  └─ repairGame()
      → MakaiRPC.call("install_game", {
           source_path: download ou dialog,
           prefix_path: game.winePrefixPath,
           proton_path: game.protonPath,
           game_id: game.objectId,
         })
      → Python faz TODO o trabalho pesado
      → Retorna candidatos
      → Electron abre seletor de executável
      → Salva executablePath no store

PYTHON (server.py) — LÓGICA PESADA
  │
  ├─ container_run()       → Makai Time (jogar)
  ├─ container_run_installer() → Makai Time (instalar, wait)
  ├─ create_prefix()       → prefix.core.create_prefix()
  ├─ install_game_dlls()   → Makaitricks
  ├─ install_game()        → ★ NOVO: fluxo completo de instalação
  ├─ copy_to_prefix()      → ★ NOVO: SHA256 verified copy
  ├─ scan_prefix_for_exes()→ ★ NOVO: escaneia .exe
  ├─ detect_installer_type()→ ★ NOVO: installer vs portátil
  └─ analyze_exe()         → CompatFlow (classifica .exe)
```

---

## SNAPSHOT DO CÓDIGO ATUAL (15/07/2026)

### Arquivos TypeScript que PRECISAM ser refatorados para Python

| Arquivo TS | Linhas | Função | Destino Python |
|---|---|---|---|
| `app/_main/installer-api/ForgePipeline/orchestrator/orchestrator.ts` | 335 | `installAndScan()` | `play.py` or new `install.py` |
| `app/_main/installer-api/ForgePipeline/orchestrator/prefix-copier.ts` | 155 | `copyFolderToPrefix()` | New RPC method |
| `app/_main/installer-api/ForgePipeline/orchestrator/prefix-scanner.ts` | 28 | `scanPrefixForExes()` | New RPC method |
| `app/_main/installer-api/ForgePipeline/orchestrator/snapshot.ts` | ~40 | `takeSnapshot()` | New utility |
| `app/_main/installer-api/ForgePipeline/orchestrator/change-detector.ts` | ~30 | `findNewExecutables()` | New utility |
| `app/_main/installer-api/ForgePipeline/events/open-game/download-installer.ts` | 104 | `downloadFromCatalog()` + detecção | `detect_installer_type()` + keep download in TS |
| `app/_main/installer-api/ForgePipeline/events/open-game/handle-portable.ts` | 59 | `handlePortableGame()` | New RPC method |
| `app/_main/installer-api/ForgePipeline/events/open-game/execute-installer.ts` | 56 | `executeInstaller()` | New RPC method |

### Arquivos TypeScript que FICAM no Electron

| Arquivo TS | Motivo |
|---|---|
| `app/_main/installer-api/AddGame/add-custom-game-to-library.ts` | Store/DB operations (UI domain) |
| `app/_main/installer-api/ForgePipeline/events/open-game/open-game.ts` | Orquestração fina (UI flow) |
| `app/_main/installer-api/ForgePipeline/events/open-game/ensure-proton.ts` | Download management (UI domain) |
| `app/_main/installer-api/ForgePipeline/events/open-game/handle-prefix.ts` | Window management (UI domain) |
| `src/main/events/library/*` | IPC event registration (must be TS) |
| `src/preload/library.ts` | Preload API (must be TS) |

---

## ARQUIVOS CRÍTICOS

### Electron (UI)
| Arquivo | Função |
|---|---|
| `src/main/index.ts` | Entry point Electron |
| `src/main/events/library/index.ts` | Registro de todos os eventos de library |
| `src/main/events/library/get-library.ts` | Lista jogos do store |
| `app/_main/installer-api/AddGame/add-custom-game-to-library.ts` | Adiciona jogo custom |
| `app/_main/installer-api/ForgePipeline/events/open-game/open-game.ts` | Abrir/reparar jogo |
| `app/_main/installer-api/ForgePipeline/services/makai-time.ts` | Bridge MakaiTime → MakaiRPC |
| `app/_main/rpc/makai-rpc.ts` | Classe MakaiRPC (bridge Electron↔Python) |
| `src/preload/library.ts` | API exposta ao renderer |

### Python (Background)
| Arquivo | Função |
|---|---|
| `app/Catalogo/GameMod/core/server.py` | ★ Servidor RPC (53+ métodos) |
| `app/Catalogo/GameMod/core/play.py` | play_game() — fluxo de jogar |
| `app/Catalogo/GameMod/core/detection.py` | detect_game() — detecção de jogo |
| `app/Catalogo/GameMod/core/games_registry.py` | Dados de ~30 jogos |
| `app/Catalogo/GameMod/core/engine/launch.py` | launch_game() → Makai Time |
| `app/Catalogo/GameMod/core/engine/proton.py` | find_proton() |
| `app/Catalogo/GameMod/core/engine/makaitricks.py` | run_multiple() |
| `app/_main/container/makai_time/engine/python/prefix/core.py` | create_prefix(), delete_prefix() |
| `app/_main/container/makai_time/engine/python/prefix/makaitricks.py` | DLL management |
| `app/_main/container/makai_time/engine/python/prefix/container.py` | build_bwrap_cmd() |
| `app/_main/container/makai_time/engine/python/prefix/runner.py` | Proton runner |
| `app/_main/container/makai_time/makai_time.py` | ★ Entry point Makai Time (run()) |
| `app/_main/container/makai_time/core/gpu.py` | GPU detection |
| `app/_main/container/makai_time/core/sync.py` | ntsync/fsync/esync |
| `app/_main/container/makai_time/core/runtime.py` | Steam Runtime download |
| `app/_main/container/makai_time/overrides/capture.py` | GPU overrides |
| `app/_main/container/makai_time/proton/intel.py` | Proton Intelligence (fork detection) |
| `app/_main/container/makai_time/proton/definitions/*.py` | 31 definições de Proton |

---

## COMANDOS ÚTEIS

```bash
# Dev server
cd /home/cas/Documentos/Makai-forge
npm run dev

# Typecheck
npx tsc --noEmit

# Makai Time (dry-run)
cd /home/cas/Documentos/Makai-forge/app/_main/container
app/_venv/bin/python3 -m makai_time.makai_time \
  --game-exe "/path/to/game.exe" \
  --proton-path "/path/to/proton" \
  --prefix-path "/path/to/prefix" \
  --dry-run --verbose

# Makai Time (real)
app/_venv/bin/python3 -m makai_time.makai_time \
  --game-exe "/path/to/game.exe" \
  --proton-path "/path/to/proton" \
  --prefix-path "/path/to/prefix"

# Testar RPC server
echo '{"id":1,"method":"ping"}' | app/_venv/bin/python3 \
  app/Catalogo/GameMod/core/server.py

# Ver venv
app/_venv/bin/python3 --version  # Deve ser 3.10.15
```

## RED FLAGS (NUNCA IGNORAR)
- **NÃO criar Proton próprio** — usar catálogo (20+ forks em tools.ts)
- **NÃO usar Python do sistema** — sempre `app/_venv/bin/python3`
- **NÃO referenciar Heroic/Total** — concorrentes proibidos
- **NÃO colocar lógica pesada no Electron** — Python é o cérebro
- **NÃO esquecer de registrar métodos no server.py** — `@register("nome_metodo")`
