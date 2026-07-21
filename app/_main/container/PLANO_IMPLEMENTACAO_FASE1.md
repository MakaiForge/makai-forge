# Plano de Implementação — Makai Runtime Engine (Fase 1)

## Visão Geral

Substituir o pressure-vessel do UMU (`_v2-entry-point` + `umu-shim`) pelo **Makai Time Engine**: container bwrap próprio + inteligência de Proton por jogo + injeção de features.

```
ANTES:                       DEPOIS:
makrun                       makrun
  └─ command.py                 ├─ feature_injector.py  ← NOVO
    └─ _v2-entry-point          │   └─ lê proton/definitions/{fork}.py
       └─ umu-shim              │   └─ aplica env vars + compat_config
          └─ proton script      ├─ container_builder.py ← NOVO
                                │   └─ bwrap + makai-runtime + overrides
                                ├─ command.py
                                │   └─ bwrap + proton script  ← MODIFICADO
                                └─ manifest.py ← NOVO
                                    └─ container.json por prefixo
```

---

## Fase 1: Proton Intelligence Engine

### 1.1 Integrar as definições do zip no makrun

**O que**: Copiar `proton/intel.py` + `proton/definitions/` do zip para dentro de `makrun/`.

**Por que**: O `intel.py` já tem o sistema de carregar definições de fork dinamicamente. Cada definição (ex: `proton_cachyos.py`) contém features, env vars, patches.

**Arquivos de origem** (do zip):
```
proton/intel.py                    → makrun/intel/__init__.py
proton/definitions/*.py            → makrun/intel/definitions/*.py
```

**Estrutura final**:
```
makrun/
├── intel/
│   ├── __init__.py       ← identifica Proton, carrega definições
│   └── definitions/
│       ├── __init__.py
│       ├── proton_cachyos.py
│       ├── proton_dw.py      ← DW-Proton definition
│       ├── proton_ge.py
│       ├── proton_em.py
│       ├── proton_valve.py
│       ├── umu_proton.py
│       └── ...
```

### 1.2 Feature Injector

**O que**: Módulo que lê a definição do Proton identificado e aplica as features como env vars.

```python
# makrun/intel/injector.py

def inject_features(proton_path: str, game_id: str | None = None) -> dict[str, str]:
    """
    Identifica o fork do Proton, carrega a definição,
    e retorna um dict de env vars para injetar no ambiente.
    """
    fork_id = intel.identify_proton(proton_path)       # "proton-cachyos"
    definition = intel.PROTON_KNOWLEDGE[fork_id]        # carrega do definitions/
    
    env = {}
    
    # 1. Features booleanas → env vars PROTON_*
    features = definition.get("features", {})
    if features.get("ntsync"):
        env["PROTON_NTSYNC"] = "1"
    if features.get("wayland"):
        env["PROTON_ENABLE_WAYLAND"] = "1"
    if features.get("fsr"):
        env["WINE_FULLSCREEN_FSR"] = "1"
        env["WINE_FULLSCREEN_FSR_STRENGTH"] = definition["env_defaults"].get("WINE_FULLSCREEN_FSR_STRENGTH", "2")
    
    # 2. Env defaults da definição
    env.update(definition.get("env_defaults", {}))
    
    # 3. Patches → env vars + flags
    patches = definition.get("patches", [])
    if "dxvk_sarek" in patches:
        env["PROTON_DXVK_SAREK"] = "1"
    if "dxvk_low_latency" in patches:
        env["PROTON_DXVK_LOWLATENCY"] = "1"
    if "nvidia_libs_bundled" in patches:
        env["PROTON_NVIDIA_LIBS"] = "1"
        env["PROTON_NVIDIA_NVML"] = "1"
    
    # 4. Container overrides
    container = definition.get("container_overrides", {})
    if container.get("ntsync"):
        env["WINE_NTSYNC"] = "1"   # ou /dev/ntsync bind
    
    # 5. Per-game profile (se existir no registry)
    profile = game_registry.get_profile(game_id)
    if profile:
        env.update(profile.get("env", {}))
        if profile.get("sync") == "esync":
            env["PROTON_NO_FSYNC"] = "1"
        if profile.get("use_wined3d"):
            env["PROTON_USE_WINED3D"] = "1"
    
    return env
```

### 1.3 Launch Strategy

Toda definição de Proton precisa indicar **como** invocar o Wine:

```python
# No makrun/intel/definitions/proton_cachyos.py (adicional)
DEFINITION = {
    ...
    "launch": {
        "method": "wine_preloader",     # ou "wine64" ou "start_unix"
        "wineloadernoexec": True,        # GE-style bypass
        "use_umu_exe": False,           # usa umu.exe? 
        "use_start_unix": False,        # EM-style start.exe /unix
    },
    ...
}
```

| Fork | launch.method | wineloadernoexec | use_umu_exe | use_start_unix |
|------|-------------|-----------------|-------------|---------------|
| CachyOS | wine_preloader | True | Sim (non-Steam) | Não |
| DW-Proton | wine_preloader | True | Sim | Não |
| GE-Proton | wine_preloader | True | Sim | Não |
| UMU-Proton | wine64 | False | Sim | Não |
| EM-Proton | wine64 | False | Não | Sim |

---

## Fase 2: Container Engine (substituir pressure-vessel)

### 2.1 Container Builder

**O que**: Módulo que monta o comando bwrap com makai-runtime + GPU overrides + display + áudio.

**Inspiração**: O código antigo `makai_time/core/host.py` do zip (bwrap args) + `overrides/detect.py` (GPU capture).

```python
# makrun/container/builder.py

def build_container_args(
    runtime_path: str,           # makai-runtime dir
    proton_path: str,            # Proton dir (bind para dentro)
    prefix_path: str,            # Wine prefix (bind para dentro)
    game_path: str,              # jogo instalado (bind para dentro)
    features: dict,              # features do injector
    display: str = "auto",       # x11 | wayland | auto
) -> list[str]:
    """
    Retorna args do bwrap:
    [
        "bwrap", "--unshare-all", "--disable-userns", "--clearenv", "--cap-drop", "ALL",
        "--proc", "/proc",
        "--ro-bind", "/sys", "/sys",
        "--ro-bind", runtime_path / "usr", "/usr",
        "--ro-bind", runtime_path / "lib", "/lib",
        "--bind", prefix_path, "/prefix",
        "--ro-bind", game_path, "/game",
        "--ro-bind", proton_path, "/proton",
        "--ro-bind", "/tmp/.X11-unix", "/tmp/.X11-unix",
        "--ro-bind", "/run/user/1000/wayland-0", "/run/user/1000/wayland-0",
        "--setenv", "DISPLAY", ":1",
        "--setenv", "WAYLAND_DISPLAY", "wayland-0",
        "--setenv", "WINEPREFIX", "/prefix",
        "--setenv", "PROTONPATH", "/proton",
        ...
        "/proton/proton", "waitforexitandrun", "/game/Game.exe",
    ]
    """
    ...
```

### 2.2 Pipeline do Container

```
[feature_injector.py] → env vars + features
         │
         ▼
[container_builder.py] → args bwrap
         │
         ▼
[command.py] → bwrap <args> /proton/proton waitforexitandrun /game/Game.exe
         │
         ▼
[Proton script (dentro do container)]
         │   init_session() → aplica features dele
         │   run() → wine64 / wine-preloader
         │
         ▼
[Game.exe rodando no container makai-runtime + GPU host]
```

### 2.3 Container Manifest (container.json)

Criado dentro do prefixo de cada jogo:

```json
~/Games/Makai-forger/gf/container.json
{
  "version": 1,
  "runtime": "makai-runtime",
  "runtime_version": "4.0.20260714.251823",
  "proton": {
    "path": "/home/cas/.config/makai-forger/compat-tools/.../Proton-CachyOS-11.0-20260602-slr",
    "fork": "proton-cachyos",
    "method": "wine_preloader"
  },
  "features": {
    "ntsync": true,
    "dxvk_llasync": true,
    "nvidia_nvml": true,
    "wayland": true,
    "wine_preloader_bypass": true
  },
  "display": {
    "backend": "auto",
    "force_x11": false
  },
  "env": {
    "WINEDEBUG": "-all",
    "WINE_FULLSCREEN_FSR": "1",
    "WINE_FULLSCREEN_FSR_STRENGTH": "2"
  },
  "gpu": {
    "overrides": true,
    "provider_mount": "/run/host"
  },
  "history": []
}
```

---

## Fase 3: Integração com Play.py

### 3.1 Novo fluxo de play

```
play_game("gf")
  │
  ├── 1. Carrega config do storage
  │     └── protonVersion = "Proton-CachyOS-11.0-20260602-slr"
  │
  ├── 2. _step_proton() → resolve caminho do Proton
  │
  ├── 3. NOVO: _step_proton_intel()
  │     ├── identify_proton(proton_path) → "proton-cachyos"
  │     ├── inject_features(proton_path, game_id) → env vars
  │     └── determina launch_method (wine_preloader / wine64)
  │
  ├── 4. NOVO: _step_container_manifest()
  │     ├── cria/lê container.json no prefixo
  │     └── salva features + env + proton info
  │
  ├── 5. _step_prefix() ← já existe
  ├── 6. _step_dll_overrides() ← já existe
  │
  └── 7. _step_launch()
        └── launch.py → makrun
              └── NOVO: container_builder.build_container_args()
              └── bwrap + proton script (em vez de _v2-entry-point)
```

### 3.2 Modificações no launch.py

O `launch.py` atual chama `makrun` com `subprocess`. A mudança é:

```python
# launch.py (modificado)

def _launch_with_makai(
    full_exe, prefix_path, proton_path, steam_app_id, env, game_id
) -> dict:
    # 1. Identifica Proton + features
    from makrun.intel import identify_proton
    from makrun.intel.injector import inject_features
    
    fork_id = identify_proton(proton_path)
    features = inject_features(proton_path, game_id)
    
    # 2. Prepara container manifest
    _save_container_manifest(prefix_path, fork_id, features, proton_path)
    
    # 3. Constrói comando bwrap
    from makrun.container.builder import build_container_args
    
    runtime_path = resolve_runtime()
    bwrap_args = build_container_args(
        runtime_path=runtime_path,
        proton_path=proton_path,
        prefix_path=prefix_path,
        game_path=full_exe.parent,
        features=features,
    )
    
    # 4. Executa
    cmd = bwrap_args + [proton_path / "proton", "waitforexitandrun", str(full_exe)]
    proc = subprocess.Popen(cmd, env=env, ...)
    return {"success": True, "pid": proc.pid, "method": "makai"}
```

---

## Fase 4: Per-game Profiles + Game Registry

### 4.1 Integrar profiles do zip

Copiar `profiles/registry.py` para `makrun/intel/profiles.py`. Adicionar função de consulta:

```python
# makrun/intel/profiles.py

def get_profile(game_id: str) -> dict | None:
    """Retorna perfil do jogo se existir no registry."""
    pass

def detect_engine(game_path: str) -> str | None:
    """Detecta engine (Unity, Unreal, Godot, etc.) por DLLs no game_path."""
    pass
```

### 4.2 Anti-cheat detection

Copiar `proton/anticheat/` do zip para `makrun/intel/anticheat/`:

```python
# makrun/intel/anticheat/api.py

def detect_anticheat(game_path: str) -> list[str]:
    """Retorna lista de anti-cheats detectados no jogo."""
    # Ex: ["easyanticheat", "battleye"]
    pass

def container_relaxations(anticheats: list[str]) -> list[str]:
    """Retorna args bwrap adicionais para anti-cheat."""
    # Ex: ["--bind", "/proc", "/proc",
    #      "--ro-bind", "/sys/kernel/security", "/sys/kernel/security"]
    pass
```

---

## Fase 5: Testes

### 5.1 Teste de identificação de Proton

```bash
# Testar intel.identify_proton() em cada Proton instalado
python3 -c "
from makrun.intel import identify_proton
for p in ['Proton-CachyOS-11.0-20260602-slr', 'DW-Proton-11.0-5', 'UMU-Proton-10.0-4']:
    path = f'/home/cas/.config/makai-forger/compat-tools/compatibilitytools.d/{p}'
    fork = identify_proton(path)
    print(f'{p:40s} → {fork}')
"
```

**Resultado esperado:**
```
Proton-CachyOS-11.0-20260602-slr    → proton-cachyos
DW-Proton-11.0-5                     → dw-proton
UMU-Proton-10.0-4                    → umu-proton
```

### 5.2 Teste de injeção de features

```bash
python3 -c "
from makrun.intel import identify_proton
from makrun.intel.injector import inject_features

path = '/home/cas/.config/makai-forger/compat-tools/compatibilitytools.d/Proton-CachyOS-11.0-20260602-slr'
fork = identify_proton(path)
env = inject_features(path, 'gf')

print(f'Fork: {fork}')
print(f'Features injetadas:')
for k, v in sorted(env.items()):
    print(f'  {k}={v}')
"
```

**Resultado esperado:** env vars do CachyOS (WINE_FULLSCREEN_FSR, PROTON_NVIDIA_LIBS, etc.)

### 5.3 Teste de launch com bwrap (dry-run)

```bash
python3 -m makrun waitforexitandrun \
  --proton Proton-CachyOS-11.0-20260602-slr \
  --game-id gf \
  --dry-run \
  /home/cas/Games/Makai-forger/gf/drive_c/Violet\ Games/Grand\ Fantasia\ Violet/Launcher.exe
```

**Resultado esperado:** mostrar o comando bwrap que seria executado (sem executar de fato).

### 5.4 Teste real: Grande Fantasia

```bash
# Executar o jogo com o novo pipeline
python3 -m makrun waitforexitandrun \
  --proton Proton-CachyOS-11.0-20260602-slr \
  --game-id gf \
  /home/cas/Games/Makai-forger/gf/drive_c/Violet\ Games/Grand\ Fantasia\ Violet/Launcher.exe
```

**Verificar:**
- O jogo abre (sem crash)
- `ps aux | grep bwrap` mostra o processo bwrap
- `cat ~/.cache/makrun-launch.log` mostra as env vars injetadas
- Proton correto (CachyOS) está sendo usado

### 5.5 Teste de múltiplos jogos simultâneos

```bash
# Terminal 1:
python3 -m makrun ... gf/Launcher.exe

# Terminal 2 (enquanto GF roda):
python3 -m makrun ... NTEGlobalLauncher.exe
```

**Verificar:** ambos rodam sem conflito, cada um com seu Proton + features.

---

## Resumo do que já temos vs precisa criar

| Componente | Status | Localização |
|-----------|--------|-------------|
| `intel.identify_proton()` | ✅ **Pronto** (zip) | `proton/intel.py` → copiar |
| 18 definições de fork | ✅ **Pronto** (zip) | `proton/definitions/*.py` → copiar |
| `profiles/registry.py` | ✅ **Pronto** (zip) | `profiles/registry.py` → copiar |
| Anti-cheat detection | ✅ **Pronto** (zip) | `proton/anticheat/` → copiar |
| Feature injection | ❌ **Criar** | `makrun/intel/injector.py` |
| Container builder (bwrap) | ⚠️ **Parcial** | Base do `makai_time` old, precisa adaptar |
| Container manifest | ❌ **Criar** | `makrun/container/manifest.py` |
| `command.py` modificado | ❌ **Modificar** | Substituir `_v2-entry-point` por bwrap |
| Launch pipeline integrado | ❌ **Integrar** | `launch.py` chamar novo pipeline |
| Testes | ❌ **Executar** | 5.1 a 5.5 |

---

## Próximos passos imediatos

1. Copiar `intel.py` + `definitions/` + `profiles/` + `anticheat/` do zip pra dentro de `makrun/`
2. Criar `makrun/intel/injector.py` (feature injection)
3. Criar `makrun/container/builder.py` (bwrap args + manifest)
4. Modificar `makrun/core/command.py` para usar bwrap em vez de `_v2-entry-point`
5. Modificar `makrun/core/runner.py` para chamar `inject_features()` + `build_container_args()`
6. Rodar testes 5.1 a 5.5
