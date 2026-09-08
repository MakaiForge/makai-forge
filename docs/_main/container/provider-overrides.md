# PLANO: Provider Mount + Per-Prefix Config + GPU Visibility

**Agente memory — implementar conforme fases**
**Data:** 17/07/2026
**Status atual:** Fase 0 em progresso (diagnóstico completo)

---

## Problema Raiz Identificado

O Makai Time cria symlinks em `overrides/<arch>/lib/` apontando para caminhos
absolutos do host (`/usr/lib/x86_64-linux-gnu/libGLX_nvidia.so.0`).

**Por que isso quebra:**
1. `--ro-bind / /` faz o host estar acessível em `/` dentro do container
2. MAS o Proton script injeta `LD_LIBRARY_PATH` com os libs do runtime (steamrt4)
3. Quando o dynamic linker resolve o symlink, ele encontra os libs do **runtime**
   (genéricos) em vez dos libs do **host** (NVIDIA reais)
4. Vulkan funciona (JSON monta ICD corretamente), mas OpenGL/EGL falha
5. Launcher cai em SoftwareOpenGL → estado gráfico ruim → jogo crasha

**Como o pressure-vessel resolve:**
1. Monta host num path **separado** (`/run/provider/` ou `/run/host/`)
2. Symlinks apontam para `/run/provider/usr/lib/...`
3. Runtime fica em `/usr/lib/...` (separado, sem conflito)
4. JSON manifests reescritos com caminhos do container
5. Env vars direcionam loaders para os paths corretos

---

## Arquitetura: Container Stateless + Config por Prefixo

**Princípio:** 1 runtime compartilhado, config inteligente por prefixo/jogo.

```
/home/cas/Games/Makai-forger/
├── steamrt4_platform_xxx/          ← runtime compartilhado (cache global)
├── neverness-to-everness/
│   └── pfx/                        ← prefix do jogo
│       ├── makai_config.json       ← config do Makai Time para este jogo
│       ├── overrides/              ← symlinks GPU (recriados sob demanda)
│       │   ├── x86_64-linux-gnu/lib/
│       │   ├── share/vulkan/icd.d/
│       │   └── share/glvnd/egl_vendor.d/
│       ├── dxvk.conf               ← config DXVK (por prefixo)
│       ├── vkd3d_proton.conf       ← config VKD3D (por prefixo)
│       └── drive_c/                ← Wine prefix
├── how-to-raise-a-happy-neet/
│   └── pfx/
│       ├── makai_config.json       ← config diferente para este jogo
│       └── ...
```

### makai_config.json (exemplo)
```json
{
  "version": 1,
  "proton_path": "/home/cas/.config/makai-forger/compat-tools/compatibilitytools.d/DW-Proton-11.0-5",
  "runtime": "steamrt4",
  "gpu_overrides": true,
  "skip_nvidia": false,
  "sync": "ntsync",
  "provider_mount": "/run/host",
  "env": {
    "WINEDEBUG": "-all",
    "DXVK_LOG_LEVEL": "none"
  },
  "last_used": "2026-07-17T15:30:00",
  "launch_count": 3,
  "last_exit_code": 0,
  "overrides_hash": "abc123...",
  "notes": "NTE funciona com DW-Proton + skip_nvidia=false"
}
```

---

## FASE 0: Diagnóstico + Validação (CONCLUÍDA)

### O que foi feito
- [x] Estudo completo do pressure-vessel (`runtime.c`, `capture-libs.c`)
- [x] Identificação do mecanismo: symlinks + JSON rewrite + env vars + provider mount
- [x] Crash report analysis: GPU detectada, Vulkan funciona, OpenGL/EGL falha
- [x] Código atual mapeado: `capture.py`, `mount.py`, `makai_time.py`, `ldso.py`

### Referências pressure-vessel key functions
| Função | Arquivo | Linha | O que faz |
|---|---|---|---|
| `pv_runtime_use_provider_graphics_stack()` | runtime.c | 7887 | Coração: captura GPU libs |
| `collect_graphics_libraries_patterns()` | runtime.c | 5766 | ~200 padrões de libs GPU |
| `setup_json_manifest()` | runtime.c | 5197 | Reescreve JSONs ICD/EGL |
| `pv_runtime_capture_libraries()` | runtime.c | 2690 | Executa capsule-capture-libs |
| `capture_one()` | capture-libs.c | 431 | Cria symlink + resolve deps |
| `pv_runtime_set_search_paths()` | runtime.c | 8980 | LD_LIBRARY_PATH final |

---

## FASE 1: Provider Mount (CRÍTICO)

### Objetivo
Montar o host num path separado (`/run/host/`) dentro do container,
separando-o do runtime. Symlinks apontam para `/run/host/usr/lib/...`.

### Mudanças

#### 1.1 `makai_time.py` — `build_bwrap_cmd()`
**Local:** `app/_main/container/makai_time/makai_time.py:103`
**Antes:**
```python
cmd.extend(["--ro-bind", "/", "/"])
```
**Depois:**
```python
# Provider mount: host acessível em /run/host (separado do runtime)
cmd.extend(["--ro-bind", "/", "/run/host"])
# Host root também acessível em / para compatibilidade
cmd.extend(["--ro-bind", "/", "/"])
```

**Nota:** O `--ro-bind / /run/host` vai PRIMEIRO, antes do `--ro-bind / /`.
Isso cria um ponto de montagem dedicado para o host. Os symlinks apontam
para `/run/host/usr/lib/...` em vez de `/usr/lib/...`, evitando conflito
com o runtime montado em `/usr/lib/...` via LD_LIBRARY_PATH.

#### 1.2 `capture.py` — `symlink_library()`
**Local:** `app/_main/container/makai_time/overrides/capture.py:45`
**Antes:**
```python
os.symlink(host_path, link_path)
# host_path = "/usr/lib/x86_64-linux-gnu/libGLX_nvidia.so.0"
```
**Depois:**
```python
# Traduzir caminho do host para /run/host/
container_target = "/run/host" + host_path if host_path.startswith("/") else host_path
os.symlink(container_target, link_path)
# container_target = "/run/host/usr/lib/x86_64-linux-gnu/libGLX_nvidia.so.0"
```

**IMPORTANTE:** Todas as funções que criam symlinks precisam ser atualizadas:
- `symlink_library()` — libs genéricas
- `symlink_vulkan_icd()` — symlink da lib Vulkan do ICD
- `capture_glvnd_egls()` — symlink das libs EGL/GLX
- `capture_openxr_runtimes()` — libs OpenXR

#### 1.3 `capture.py` — Todas as funções de symlink
Adicionar parâmetro `host_prefix="/run/host"` e usá-lo em todas as criações
de symlink. Garantir que NENHUM symlink aponte para caminho absoluto do host
sem o prefixo `/run/host/`.

#### 1.4 `detect.py` — `_find_lib()` e `_find_libs()`
**Local:** `app/_main/container/makai_time/overrides/detect.py:38-59`
Não mudar a detecção (continua buscando no host real).
Mas adicionar função auxiliar:
```python
def host_to_container(host_path: str, provider: str = "/run/host") -> str:
    """Converte /usr/lib/... → /run/host/usr/lib/..."""
    if host_path.startswith("/"):
        return provider + host_path
    return host_path
```

### Verificação
```bash
# Dry-run e verificar que symlinks apontam para /run/host/
python3 -m makai_time.makai_time --game-exe ... --dry-run 2>&1 | grep "symlink"
# Deve mostrar: symlink: /overrides/.../libX.so -> /run/host/usr/lib/...
```

### Teste funcional
```bash
# Dentro do container, verificar resolução de symlinks
bwrap --ro-bind / /run/host --ro-bind / / --ro-bind /overrides /overrides \
  -- /bin/bash -c "ls -la /overrides/x86_64-linux-gnu/lib/libGLX_nvidia.so.0"
# Deve mostrar: -> /run/host/usr/lib/x86_64-linux-gnu/libGLX_nvidia.so.0

# Verificar que o arquivo existe
bwrap --ro-bind / /run/host --ro-bind / / --ro-bind /overrides /overrides \
  -- /bin/bash -c "file /overrides/x86_64-linux-gnu/lib/libGLX_nvidia.so.0"
# Deve mostrar: ELF 64-bit LSB shared object
```

---

## FASE 2: LD_LIBRARY_PATH com Prioridade Correta

### Objetivo
Garantir que `/overrides/<arch>/lib` tenha prioridade MÁXIMA no
dynamic linker, acima do runtime e do host.

### Mudanças

#### 2.1 `mount.py` — `graphics_env_vars()`
**Local:** `app/_main/container/makai_time/overrides/mount.py:11`
Adicionar LD_LIBRARY_PATH como env var:
```python
# LD_LIBRARY_PATH — prioridade: overrides > runtime > host
# pressure-vessel: runtime.c:8980 (pv_runtime_set_search_paths)
override_lib = f"/overrides/{arch}/lib"
override_aliases = f"/overrides/{arch}/lib/aliases"
env["LD_LIBRARY_PATH"] = f"{override_lib}:{override_aliases}"
```

**NOTA:** O Proton script também seta LD_LIBRARY_PATH. Nossa variável
será APPEND pelo Proton script, NÃO sobrescrita. Isso é correto porque:
- Nossos paths vêm primeiro (overrides com prioridade)
- Proton adiciona os paths do runtime depois

#### 2.2 `ldso.py` — `_build_ld_config()`
**Local:** `app/_main/container/makai_time/core/ldso.py:162`
Adicionar paths do container (com `/run/host/`) para o ld.so.conf:
```python
# Adicionar paths do container para o ld.so.cache
container_paths = [
    "/overrides/x86_64-linux-gnu/lib",
    "/overrides/i386-linux-gnu/lib",
]
for p in container_paths:
    if ...:  # verificar se existe
        lines.append(p)
```

#### 2.3 `makai_time.py` — `run()` step 7
**Local:** `app/_main/container/makai_time/makai_time.py:~510`
Garantir que `LD_LIBRARY_PATH` é setado no container via `--setenv`:
```python
# Step 7e2: Graphics env vars
graphics_env = ov_mount.graphics_env_vars(overrides_base)
env.update(graphics_env)  # Inclui LD_LIBRARY_PATH

# LD_LIBRARY_PATH com container paths
ld_path = ldso.build_ld_library_path(
    prefix_path, overrides_base, rt_path,
    container_paths=True,  # ← usa /overrides/... e /lib/...
)
if ld_path:
    env["LD_LIBRARY_PATH"] = ld_path
```

### Verificação
```bash
# Dry-run e verificar LD_LIBRARY_PATH nos env vars
python3 -m makai_time.makai_time --game-exe ... --dry-run 2>&1 | grep LD_LIBRARY_PATH
# Deve mostrar: /overrides/x86_64-linux-gnu/lib:/overrides/x86_64-linux-gnu/lib/aliases:...
```

---

## FASE 3: Debug Container (DEBUG)

### Objetivo
Adicionar opção `--debug-container` que abre shell dentro do bwrap
para validar GPU, Vulkan, OpenGL, etc.

### Mudanças

#### 3.1 `makai_time.py` — `cli()` + `build_bwrap_cmd()`
```python
# cli()
parser.add_argument("--debug-container", action="store_true",
    help="Abre shell dentro do container para debug (substitui comando)")

# build_bwrap_cmd()
if debug_container:
    command = ["/bin/bash", "--login"]
    # Injetar script de validação via --ro-bind
    script = '''#!/bin/bash
echo "=== GPU Detection ==="
lspci | grep -i vga
nvidia-smi 2>/dev/null || echo "nvidia-smi not available"

echo "=== Vulkan ==="
vulkaninfo 2>/dev/null | head -20 || echo "vulkaninfo not available"

echo "=== OpenGL/EGL ==="
glxinfo 2>/dev/null | head -10 || echo "glxinfo not available"
eglinfo 2>/dev/null | head -10 || echo "eglinfo not available"

echo "=== Dynamic Linker ==="
ldconfig -p | grep -i nvidia | head -10
ldconfig -p | grep -i mesa | head -10
ldconfig -p | grep libvulkan | head -5

echo "=== Overrides ==="
ls -la /overrides/ 2>/dev/null || echo "No /overrides dir"
ls -la /overrides/x86_64-linux-gnu/lib/ 2>/dev/null | head -20

echo "=== Symlinks Resolution ==="
for f in /overrides/x86_64-linux-gnu/lib/*.so*; do
    target=$(readlink "$f" 2>/dev/null)
    if [ -n "$target" ]; then
        echo "$f -> $target"
        file "$f" 2>/dev/null | head -1
    fi
done

echo "=== LD_LIBRARY_PATH ==="
echo $LD_LIBRARY_PATH

echo "=== Env Vars (Graphics) ==="
env | grep -iE "VK_|EGL_|LIBGL|LIBVA|GBM|LD_LIBRARY"

echo "=== Mount Points ==="
mount | grep -E "overrides|run/host|vulkan|glvnd"

echo "=== Shell Interativo ==="
exec /bin/bash --login
'''
```

#### 3.2 `makai_time.py` — `run()`
```python
if debug_container:
    # Salvar script temporário e montar no container
    import tempfile
    script_path = os.path.join(tempfile.mkdtemp(), "validate.sh")
    with open(script_path, "w") as f:
        f.write(script)
    cmd.extend(["--ro-bind", script_path, "/validate.sh"])
    cmd.extend(["--setenv", "SHELL", "/bin/bash"])
```

### Uso
```bash
python3 -m makai_time.makai_time \
  --game-exe "C:/Neverness To Everness/.../HTGame.exe" \
  --proton-path ... --prefix-path ... \
  --debug-container
```

---

## FASE 4: Per-Prefix Config (INTELIGENTE)

### Objetivo
Criar `makai_config.json` dentro de cada prefixo para:
- Cache de configurações detectadas
- Evitar re-detecção desnecessária
- Histórico de launches
- Config manual do usuário

### Mudanças

#### 4.1 Novo módulo: `prefix_config.py`
**Local:** `app/_main/container/makai_time/prefix_config.py`

```python
"""Per-prefix configuration for Makai Time.

Cada prefixo tem um makai_config.json que guarda:
- Proton path used
- Runtime version
- GPU overrides config
- Sync method
- Environment variables
- Launch history
"""
import json
import os
from datetime import datetime
from typing import Optional

CONFIG_FILENAME = "makai_config.json"
CONFIG_VERSION = 1

DEFAULT_CONFIG = {
    "version": CONFIG_VERSION,
    "proton_path": None,
    "runtime": "steamrt4",
    "gpu_overrides": True,
    "skip_nvidia": False,
    "sync": None,  # auto-detect
    "provider_mount": "/run/host",
    "env": {},
    "last_used": None,
    "launch_count": 0,
    "last_exit_code": None,
    "overrides_hash": None,
    "notes": "",
}


def config_path(prefix_path: str) -> str:
    return os.path.join(prefix_path, CONFIG_FILENAME)


def load_config(prefix_path: str) -> dict:
    """Load prefix config, returns default if not found."""
    path = config_path(prefix_path)
    if not os.path.isfile(path):
        return dict(DEFAULT_CONFIG)
    try:
        with open(path) as f:
            data = json.load(f)
        # Merge with defaults for missing keys
        merged = dict(DEFAULT_CONFIG)
        merged.update(data)
        return merged
    except (json.JSONDecodeError, OSError):
        return dict(DEFAULT_CONFIG)


def save_config(prefix_path: str, config: dict) -> str:
    """Save prefix config. Returns path."""
    path = config_path(prefix_path)
    config["version"] = CONFIG_VERSION
    with open(path, "w") as f:
        json.dump(config, f, indent=2)
    return path


def record_launch(prefix_path: str, exit_code: int = None,
                  proton_path: str = None, runtime: str = None):
    """Record a launch event in prefix config."""
    config = load_config(prefix_path)
    config["last_used"] = datetime.now().isoformat()
    config["launch_count"] = config.get("launch_count", 0) + 1
    if exit_code is not None:
        config["last_exit_code"] = exit_code
    if proton_path:
        config["proton_path"] = proton_path
    if runtime:
        config["runtime"] = runtime
    save_config(prefix_path, config)


def compute_overrides_hash(overrides_base: str) -> str:
    """Hash dos symlinks de overrides para detectar mudanças."""
    import hashlib
    h = hashlib.md5()
    if os.path.isdir(overrides_base):
        for root, dirs, files in os.walk(overrides_base):
            for f in sorted(files):
                fp = os.path.join(root, f)
                if os.path.islink(fp):
                    h.update(os.readlink(fp).encode())
                elif os.path.isfile(fp):
                    h.update(fp.encode())
    return h.hexdigest()


def overrides_need_rebuild(prefix_path: str, overrides_base: str) -> bool:
    """Check if overrides need to be rebuilt."""
    config = load_config(prefix_path)
    current_hash = compute_overrides_hash(overrides_base)
    stored_hash = config.get("overrides_hash")
    return current_hash != stored_hash
```

#### 4.2 Integrar no `run()`
```python
# Step 0: Load prefix config
prefix_cfg = prefix_config.load_config(prefix_path)
if verbose:
    print(f"  Prefix config: {prefix_cfg.get('proton_path', 'auto-detect')}")

# Step 5: Check if overrides need rebuild
if not prefix_config.overrides_need_rebuild(prefix_path, overrides_base):
    if verbose:
        print(f"  Overrides cache hit, skip rebuild")
else:
    # Rebuild overrides
    ...

# Step 9: Record launch
prefix_config.record_launch(
    prefix_path,
    proton_path=proton_path,
    runtime=runtime_name,
)
```

#### 4.3 CLI para gerenciar config
```bash
# Listar config de um prefixo
python3 -m makai_time.makai_time --prefix-info /path/to/pfx

# Resetar config
python3 -m makai_time.makai_time --prefix-reset /path/to/pfx

# Forçar rebuild de overrides
python3 -m makai_time.makai_time --prefix-rebuild /path/to/pfx
```

---

## FASE 5: Per-Architecture i386 (COMPLETUDE)

### Objetivo
Capturar libs GPU para i386 (jogos 32-bit, DXVK 32-bit).

### Mudanças

#### 5.1 `capture.py` — `capture_all_graphics()`
```python
def capture_all_graphics(
    overrides_base: str,
    arch: str = "x86_64-linux-gnu",
    capture_i386: bool = True,  # ← NOVO
    verbose: bool = False,
    skip_nvidia: bool = False,
) -> int:
    count = 0
    # x86_64 (fluxo atual)
    count += _capture_arch(overrides_base, arch, verbose, skip_nvidia)

    # i386 (novo)
    if capture_i386:
        i386_arch = "i386-linux-gnu"
        count += _capture_arch(overrides_base, i386_arch, verbose, skip_nvidia)

    return count
```

#### 5.2 `detect.py` — Buscar libs i386
```python
HOST_LIB_PATHS_I386 = [
    "/usr/lib/i386-linux-gnu",
    "/usr/lib32",
    "/lib/i386-linux-gnu",
    "/lib32",
]
```

---

## FASE 6: Consistência dos JSON Manifests (POLIMENTO)

### Objetivo
Garantir que TODOS os JSONs reescritos usem caminhos consistentes
dentro do container.

### Checklist
- [ ] `capture.py:symlink_vulkan_icd()` — `library_path` usa `/overrides/<arch>/lib/`
- [ ] `capture.py:capture_glvnd_egls()` — `library_path` usa `/overrides/<arch>/lib/`
- [ ] `mount.py:override_bwrap_args()` — bind dos JSONs em `/usr/share/vulkan/icd.d/`
- [ ] `mount.py:override_bwrap_args()` — bind dos GLVND JSONs em `/usr/share/glvnd/egl_vendor.d/`
- [ ] `mount.py:graphics_env_vars()` — `VK_ICD_FILENAMES` aponta para paths corretos
- [ ] `mount.py:graphics_env_vars()` — `__EGL_VENDOR_LIBRARY_FILENAMES` aponta para paths corretos
- [ ] Todos os `library_path` são paths DENTRO do container, não do host

### Teste automatizado
```python
# test_json_consistency.py
def test_all_json_paths_are_container_paths():
    """Verifica que nenhum JSON tem library_path apontando para host."""
    overrides = "/overrides"
    for root, dirs, files in os.walk(overrides):
        for f in files:
            if f.endswith(".json"):
                with open(os.path.join(root, f)) as fh:
                    data = json.load(fh)
                lib_path = (data.get("ICD", {}).get("library_path")
                           or data.get("library_path", ""))
                if lib_path:
                    assert lib_path.startswith("/overrides/"), \
                        f"JSON {f} has host path: {lib_path}"
```

---

## FASE 7: Compatibilidade Universal com Proton (AGNÓSTICO)

### Objetivo
Tornar o Makai Time compatível com **qualquer** fork de Proton:
DW-Proton, Proton-CachyOS, UMU-Proton, GE-Proton, Proton-GE, Valve Proton,
EM-Proton, Proton-Tkg, etc.

### Problema
Cada fork tem diferenças reais:
- Estrutura de pastas (`dist/`, `files/`, `proton` na raiz ou não)
- Libs bundled (CachyOS/DW bundlam NVIDIA)
- Patches específicos (miniloader, FSR4, fsync variants)
- Expectativas de runtime e env vars

### Mudanças

#### 7.1 `proton/intel.py` — Detecção dinâmica robusta
```python
def identify_proton(proton_path: str) -> dict:
    """Detecta fork + features de qualquer Proton.
    
    NUNCA assume estrutura fixa. Sempre faz fallback para detecção dinâmica.
    """
    info = {
        "fork": "unknown",
        "version": None,
        "proton_script": None,
        "wine_binary": None,
        "dist_dir": None,
        "files_dir": None,
        "features": {},
        "skip_nvidia": False,
        "container_overrides": {},
    }

    # Proton script: buscar em múltiplos locais
    for candidate in [
        os.path.join(proton_path, "proton"),
        os.path.join(proton_path, "files", "proton"),
        os.path.join(os.path.dirname(proton_path), "proton"),
        os.path.join(proton_path, "proton.py"),
    ]:
        if os.path.isfile(candidate):
            info["proton_script"] = candidate
            break

    # Wine binary: buscar em múltiplos locais
    for candidate in [
        os.path.join(proton_path, "dist", "bin", "wine"),
        os.path.join(proton_path, "files", "dist", "bin", "wine"),
        os.path.join(proton_path, "bin", "wine"),
    ]:
        if os.path.isfile(candidate):
            info["wine_binary"] = candidate
            break

    # Dist dir
    for candidate in [
        os.path.join(proton_path, "dist"),
        os.path.join(proton_path, "files"),
    ]:
        if os.path.isdir(candidate):
            info["dist_dir"] = candidate
            break

    # Detectar bundling NVIDIA (skip_nvidia)
    # Se o Proton já tem libnvidia-* no dist/lib, skip
    if info["dist_dir"]:
        nv_bundled = _check_nv_bundled(info["dist_dir"])
        info["skip_nvidia"] = nv_bundled

    # Ler version do proton script
    info["version"] = _extract_version(proton_path)

    # Classificar fork
    info["fork"] = _classify_fork(proton_path, info)

    return info
```

#### 7.2 `proton/definitions/` — Definições por fork
Manter definições existentes + adicionar fallbacks:

| Fork | skip_nvidia | container_relaxations | env_overrides |
|---|---|---|---|
| DW-Proton | ✅ se bundled | AC relax | `PROTON_NO_SANDBOX=1` |
| Proton-CachyOS | ✅ sempre | Nenhuma | `MANGOHUD_CONFIG=...` |
| UMU-Proton | ❌ | Nenhuma | `UMU_ID=...` |
| GE-Proton | ❌ | Nenhuma | Nenhuma |
| Valve Proton | ❌ | Nenhuma | Nenhuma |
| EM-Proton | ✅ se bundled | Nenhuma | Nenhuma |
| Proton-Tkg | ❌ | Nenhuma | `WINEDEBUG=...` |

#### 7.3 `build_bwrap_cmd()` — Paths flexíveis
```python
# NUNCA assumir estrutura fixa
proton_script = None
for candidate in [
    os.path.join(proton_path, "proton"),
    os.path.join(proton_path, "files", "proton"),
    os.path.join(os.path.dirname(proton_path), "proton"),
]:
    if os.path.isfile(candidate):
        proton_script = candidate
        break

if not proton_script:
    # Fallback: wine direto
    wine_binary = None
    for candidate in [
        os.path.join(proton_path, "dist", "bin", "wine"),
        os.path.join(proton_path, "files", "dist", "bin", "wine"),
        os.path.join(proton_path, "bin", "wine"),
    ]:
        if os.path.isfile(candidate):
            wine_binary = candidate
            break
```

### Verificação
```bash
# Testar com cada fork disponível
for proton in /home/cas/.config/makai-forger/compat-tools/compatibilitytools.d/*/; do
    echo "=== Testing: $(basename $proton) ==="
    python3 -m makai_time.makai_time \
      --proton-path "$proton" --game-exe ... --dry-run 2>&1 | head -5
done
```

---

## FASE 8: Per-Prefix Manifest Completo (makai_manifest.json)

### Objetivo
Expandir o `makai_config.json` (Fase 4) para ser um **manifesto completo**
que encapsula todo o estado do jogo/prefixo.

### Estrutura do Manifest

```json
{
  "version": 2,
  "meta": {
    "game_name": "Neverness to Everness",
    "game_exe": "C:/Neverness To Everness/Client/WindowsNoEditor/HT/Binaries/win64/HTGame.exe",
    "steam_app_id": null,
    "engine": "unreal5",
    "created_at": "2026-07-17T10:00:00",
    "last_used": "2026-07-17T15:30:00",
    "launch_count": 3
  },
  "proton": {
    "path": "/home/cas/.config/makai-forger/compat-tools/compatibilitytools.d/DW-Proton-11.0-5",
    "fork": "dw-proton",
    "version": "11.0-5",
    "proton_script": "...",
    "wine_binary": "..."
  },
  "runtime": {
    "name": "steamrt4",
    "path": "/home/cas/Documentos/Makai-forge/app/_main/container/steamrt4_platform_xxx",
    "version": "4.0.20260714.251823"
  },
  "gpu": {
    "overrides": true,
    "skip_nvidia": false,
    "provider_mount": "/run/host",
    "overrides_hash": "abc123",
    "nvidia_caps": true,
    "opencl": false
  },
  "sync": {
    "method": "ntsync",
    "auto_detect": true
  },
  "display": {
    "backend": "auto",
    "force_backend": null,
    "wayland": true,
    "x11": true,
    "gamescope": false
  },
  "env": {
    "WINEDEBUG": "-all",
    "DXVK_LOG_LEVEL": "none",
    "PROTON_NO_SANDBOX": "1"
  },
  "dxvk": {
    "max_frame_latency": 1,
    "async": false,
    "compiler_threads": 2,
    "graphics_pipeline_library": true
  },
  "vkd3d": {
    "enabled": true,
    "shader_model": "6.0"
  },
  "ac_relaxations": {
    "no_unshare_pid": true,
    "full_dev": true
  },
  "history": [
    {"date": "2026-07-17T10:00:00", "exit_code": 0, "runtime": "steamrt4"},
    {"date": "2026-07-17T15:30:00", "exit_code": 1, "runtime": "steamrt4"}
  ],
  "notes": "NTE funciona com DW-Proton. Crash em D3D11Query."
}
```

### Mudanças

#### 8.1 `prefix_config.py` — Expandir schema
- Adicionar campos `meta`, `display`, `dxvk`, `vkd3d`, `ac_relaxations`, `history`
- Auto-popular campos baseado na detecção atual
- `record_launch()` salva no array `history`

#### 8.2 `run()` — Ler/salvar manifest
```python
# Step 0: Ler manifesto
manifest = prefix_config.load_manifest(prefix_path)

# Step 0.5: Usar dados do manifesto para detectar Proton
if manifest["proton"]["path"]:
    proton_path = manifest["proton"]["path"]

# Step 5: Usar skip_nvidia do manifesto
skip_nvidia = manifest["gpu"]["skip_nvidia"]

# Step 9: Salvar manifesto atualizado
prefix_config.save_manifest(prefix_path, manifest)
```

#### 8.3 CLI para gerenciar manifesto
```bash
# Ver manifesto
python3 -m makai_time.makai_time --prefix-info /path/to/pfx

# Editar manifesto
python3 -m makai_time.makai_time --prefix-edit /path/to/pfx

# Resetar manifesto (mantém prefix)
python3 -m makai_time.makai_time --prefix-reset /path/to/pfx

# Forçar rebuild de overrides
python3 -m makai_time.makai_time --prefix-rebuild /path/to/pfx
```

### Verificação
```bash
# 1. Criar manifesto para NTE
python3 -m makai_time.makai_time --game-exe ... --proton-path ... --prefix-path ... --dry-run
# Verificar: pfx/makai_manifest.json criado

# 2. Ler manifesto
python3 -m makai_time.makai_time --prefix-info /home/cas/Games/Makai-forger/neverness-to-everness/pfx

# 3. Modificar e relançar
python3 -m makai_time.makai_time --prefix-edit ... --set gpu.skip_nvidia=true
```

---

## FASE 9: Controle Explícito Wayland vs X11 (DISPLAY)

### Objetivo
Controle granular de backend de display, especialmente importante para
jogos com **WebView2/Chromium** que crasham no Wayland.

### Problema
- Jogos UE5 com CEF/WebView2: Wayland pode causar crashes
- Jogos nativos Linux: Wayland geralmente funciona melhor
- Jogos com anti-cheat: podem ter issues com Wayland

### Mudanças

#### 9.1 `display.py` — Backend selection
```python
def display_backend_args(
    backend: str = "auto",
    wayland_available: bool = True,
    x11_available: bool = True,
    force_wayland: bool = False,
    force_x11: bool = False,
    is_chromium: bool = False,
) -> list[str]:
    """Gera args para forçar backend de display.
    
    Prioridade:
    1. force_x11/force_wayland (manifest/CLI)
    2. is_chromium → default X11
    3. auto → detecta melhor
    """
    args = []

    if force_x11 or (is_chromium and backend == "auto"):
        # Forçar X11
        args.extend(["--setenv", "DISPLAY", _detect_x11()])
        if wayland_available:
            # Unset Wayland para evitar fallback
            args.extend(["--setenv", "WAYLAND_DISPLAY", ""])
            args.extend(["--setenv", "XDG_SESSION_TYPE", "x11"])
    elif force_wayland:
        # Forçar Wayland
        wayland = _detect_wayland()
        if wayland:
            args.extend(["--setenv", "WAYLAND_DISPLAY", wayland])
            args.extend(["--setenv", "XDG_SESSION_TYPE", "wayland"])
    else:
        # Auto: detectar
        if wayland_available:
            args.extend(display.wayland_args(uid))
        else:
            args.extend(display.x11_args(uid))

    return args
```

#### 9.2 `profiles/engine.py` — Chromium handler
```python
def chromium_config() -> dict:
    """Config específica para jogos com Chromium/CEF/WebView2."""
    return {
        "env": {
            "PROTON_NO_SANDBOX": "1",
            "SDL_VIDEO_DRIVER": "x11",
        },
        "display": {
            "force_backend": "x11",
            "reason": "Chromium/CEF crashes on Wayland",
        },
    }

def is_chromium_game(game_exe: str, profile: dict = None) -> bool:
    """Detecta se o jogo usa Chromium/CEF/WebView2."""
    if profile and profile.get("engine") in ("chromium", "nwjs", "cef"):
        return True
    # Detectar por DLLs ou config
    exe_dir = os.path.dirname(game_exe)
    chromium_indicators = [
        "libcef.dll", "nw.dll", "nw_elf.dll",
        "CefSharp.dll", "WebView2Loader.dll",
    ]
    return any(
        os.path.exists(os.path.join(exe_dir, f))
        for f in chromium_indicators
    )
```

#### 9.3 `makai_manifest.json` — Campo display
```json
{
  "display": {
    "backend": "auto",
    "force_backend": "x11",
    "wayland": true,
    "x11": true,
    "gamescope": false
  }
}
```

#### 9.4 `run()` — Integrar display backend
```python
# Detectar se é Chromium game
is_chromium = is_chromium_game(game_exe, final_profile)
if is_chromium and verbose:
    print(f"  Chromium/CEF detectado → forçando X11")

# Aplicar display backend
display_args = display_backend_args(
    backend=manifest.get("display", {}).get("backend", "auto"),
    force_x11=manifest.get("display", {}).get("force_backend") == "x11",
    force_wayland=manifest.get("display", {}).get("force_backend") == "wayland",
    is_chromium=is_chromium,
)
```

### Verificação
```bash
# 1. Testar NTE (Chromium game) → deve forçar X11
python3 -m makai_time.makai_time --game-exe HTGame.exe --dry-run 2>&1 | grep -i "display\|x11\|wayland"

# 2. Forçar Wayland manualmente
python3 -m makai_time.makai_time --game-exe Game.exe --display-backend wayland --dry-run

# 3. No manifest, definir display.force_backend = "x11"
python3 -m makai_time.makai_time --prefix-edit /path/to/pfx --set display.force_backend=x11
```

---

## FASE 10: Testes Integrados + CI (VALIDAÇÃO FINAL)

### Objetivo
Testes automatizados que validam TODO o pipeline.

### Testes

#### 10.1 Teste de Provider Mount
```python
def test_provider_mount_symlinks():
    """Verifica que symlinks apontam para /run/host/."""
    overrides = create_test_overrides()
    for root, dirs, files in os.walk(overrides):
        for f in files:
            if os.path.islink(os.path.join(root, f)):
                target = os.readlink(os.path.join(root, f))
                assert target.startswith("/run/host/"), \
                    f"Symlink {f} doesn't use /run/host: {target}"
```

#### 10.2 Teste de JSON Consistency
```python
def test_json_paths_are_container_paths():
    """Verifica que nenhum JSON tem library_path apontando para host."""
    overrides = "/overrides"
    for root, dirs, files in os.walk(overrides):
        for f in files:
            if f.endswith(".json"):
                with open(os.path.join(root, f)) as fh:
                    data = json.load(fh)
                lib_path = (data.get("ICD", {}).get("library_path")
                           or data.get("library_path", ""))
                if lib_path:
                    assert lib_path.startswith("/overrides/"), \
                        f"JSON {f} has host path: {lib_path}"
```

#### 10.3 Teste de LD_LIBRARY_PATH
```python
def test_ld_library_path_priority():
    """Verifica que overrides vem antes de runtime."""
    ld_path = build_ld_library_path(container_paths=True)
    parts = ld_path.split(":")
    override_idx = next(i for i, p in enumerate(parts) if "/overrides/" in p)
    runtime_idx = next(i for i, p in enumerate(parts) if "/runtime/" in p)
    assert override_idx < runtime_idx, \
        "Overrides should come before runtime in LD_LIBRARY_PATH"
```

#### 10.4 Teste de Proton Detection
```python
@pytest.mark.parametrize("proton_dir", list_proton_dirs())
def test_proton_detection_any_fork(proton_dir):
    """Testa detecção com cada fork disponível."""
    info = identify_proton(proton_dir)
    assert info["proton_script"] is not None or info["wine_binary"] is not None
    assert info["fork"] != "unknown" or True  # Fork unknown é aceitável
```

---

## Ordem de Implementação

```
FASE 0 [✅ CONCLUÍDA] Diagnóstico + Validação
  └─ Estudo pressure-vessel, crash analysis, mapeamento do código

FASE 1 [🔄 PRÓXIMA] Provider Mount (/run/host) ← CRÍTICO
  └─ 1.1 build_bwrap_cmd: --ro-bind / /run/host
  └─ 1.2 symlink_library: /run/host prefix
  └─ 1.3 Todas as funções de symlink atualizadas
  └─ 1.4 detect.py: host_to_container() helper
  └─ VERIFICAÇÃO: dry-run + testes de symlink resolution

FASE 2 [⏳] LD_LIBRARY_PATH com Prioridade ← CRÍTICO
  └─ 2.1 graphics_env_vars: LD_LIBRARY_PATH
  └─ 2.2 ldso.py: ld.so.conf com container paths
  └─ 2.3 makai_time.py: --setenv LD_LIBRARY_PATH
  └─ VERIFICAÇÃO: dry-run + ldconfig -p dentro do container

FASE 3 [⏳] Debug Container ← DEBUG
  └─ 3.1 --debug-container CLI flag
  └─ 3.2 Script de validação automática
  └─ VERIFICAÇÃO: vulkaninfo, glxinfo, ldconfig -p

FASE 4 [⏳] Per-Prefix Config (makai_config.json) ← INTELIGENTE
  └─ 4.1 prefix_config.py (load/save/record)
  └─ 4.2 Integrar no run()
  └─ 4.3 CLI prefix-info/prefix-reset
  └─ VERIFICAÇÃO: dry-run + verificar JSON criado

FASE 5 [⏳] Per-Architecture i386 ← COMPLETUDE
  └─ 5.1 capture_all_graphics: capture_i386
  └─ 5.2 detect.py: HOST_LIB_PATHS_I386
  └─ VERIFICAÇÃO: ls overrides/i386-linux-gnu/lib/

FASE 6 [⏳] Consistência JSON ← POLIMENTO
  └─ 6.1 Checklist de todos os JSONs
  └─ 6.2 Teste automatizado
  └─ VERIFICAÇÃO: python test_json_consistency.py

FASE 7 [⏳] Compatibilidade Universal com Proton ← AGNÓSTICO
  └─ 7.1 proton/intel.py: detecção dinâmica robusta
  └─ 7.2 proton/definitions/: fallbacks por fork
  └─ 7.3 build_bwrap_cmd: paths flexíveis
  └─ VERIFICAÇÃO: testar com cada fork disponível

FASE 8 [⏳] Per-Prefix Manifest Completo ← INTELIGENTE
  └─ 8.1 prefix_config.py: schema expandido (meta, display, dxvk, etc.)
  └─ 8.2 run(): ler/salvar manifest completo
  └─ 8.3 CLI: prefix-info/edit/reset/rebuild
  └─ VERIFICAÇÃO: manifest criado + campos populados

FASE 9 [⏳] Controle Wayland vs X11 ← DISPLAY
  └─ 9.1 display.py: backend selection inteligente
  └─ 9.2 profiles/engine.py: chromium_config handler
  └─ 9.3 Manifest campo display
  └─ 9.4 Integrar no run()
  └─ VERIFICAÇÃO: NTE força X11, outros jogos auto-detect

FASE 10 [⏳] Testes Integrados ← VALIDAÇÃO
  └─ 10.1 Teste provider mount symlinks
  └─ 10.2 Teste JSON consistency
  └─ 10.3 Teste LD_LIBRARY_PATH priority
  └─ 10.4 Teste Proton detection any fork
  └─ VERIFICAÇÃO: pytest rodando 100%
```

### Prioridade de implementação
```
CRÍTICO (fazer AGORA):     FASE 1 + FASE 2 → Provider Mount + LD_LIBRARY_PATH
DEBUG (fazer depois):       FASE 3 → Debug Container
INTELIGENTE (fazer depois): FASE 4 + FASE 8 → Per-Prefix Config/Manifest
COMPLETUDE (quando possível): FASE 5 + FASE 6 → i386 + JSON consistency
AGNÓSTICO (contínuo):      FASE 7 → Proton universal
DISPLAY (quando necessário): FASE 9 → Wayland/X11
VALIDAÇÃO (final):         FASE 10 → Testes integrados
```

---

## Decisões de Arquitetura

### Por que `/run/host` e não `/run/provider`?
- pressure-vessel usa `/run/provider/` porque ele lida com Flatpak runtimes
  que podem ser paths arbitrários
- Nós sempre montamos o host `/`, então `/run/host` é mais descritivo
- `/run/` já existe como tmpfs no container (padrão Linux)

### Por que manter `--ro-bind / /` além de `--ro-bind / /run/host`?
- Compatibilidade: muchos softwares esperam encontrar `/usr/lib/...` direto
- O Proton script pode precisar de paths do host em locais convencionais
- O runtime sobrepõe via LD_LIBRARY_PATH, não via bind mount

### Por que LD_LIBRARY_PATH e não só ld.so.cache?
- O Proton script seta LD_LIBRARY_PATH, e nossos paths precisam vir ANTES
- ld.so.cache é mais lento para regerar e mais difícil de debugar
- LD_LIBRARY_PATH é imediato e visível via `env`

### Per-prefix: JSON ou TOML?
- JSON: padrão, sem dependências, Python tem `json` nativo
- TOML: mais legível, mas precisa `tomli` ou `tomllib` (Python 3.11+)
- Decisão: **JSON** (simpler, zero deps)

---

## Decisões de Arquitetura (adicional)

### Container stateless + inteligência por prefixo
- **1 runtime compartilhado** (steamrt4/makairt) em cache global
- **1 bwrap por jogo** (Linux lida bem com dezenas simultâneos)
- **Estado persistente no prefixo** (`makai_manifest.json`)
- **Overrides recriados sob demanda** (cache hash detecta mudanças)
- Equivalente ao que a Steam faz com `compatdata/`

### Compatibilidade com qualquer Proton
- **Nunca assumir estrutura fixa** — sempre detectar dinamicamente
- **Fallback chain**: proton script → wine binary → exe direto
- **Proton definitions**: skip_nvidia, container_relaxations, env_overrides
- **Testar com cada fork** antes de releases

### Wayland/X11 inteligente
- **Chromium/CEF/WebView2 → default X11** (mais estável)
- **Jogos nativos → auto-detect** (Wayland quando disponível)
- **Override manual** via manifest ou CLI (`--display-backend x11`)
- **Gamescope** como opção para jogos que suportam

---

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| `--ro-bind / /run/host` + `--ro-bind / /` causa overhead | Baixo | bwrap usa bind mounts, overhead ~0 |
| Proton script sobrescreve LD_LIBRARY_PATH | Alto | Testar com diferentes Proton forks |
| Symlinks quebrados dentro do container | Alto | Script de validação (Fase 3) |
| JSONs com paths inconsistentes | Médio | Teste automatizado (Fase 10.2) |
| Performance de overrides rebuild | Baixo | Cache hash (Fase 4/8) |
| i386 libs conflitam com x86_64 | Médio | Diretórios separados (Fase 5) |
| Fork de Proton não detectado | Médio | Fallback para wine direto (Fase 7) |
| Wayland crash em Chromium games | Alto | Default X11 para Chromium (Fase 9) |
| Manifest corrompido | Baixo | Recriação automática + backup |

---

## Métricas de Sucesso

| Métrica | Antes | Depois |
|---|---|---|
| NTE: Launcher OpenGL/EGL | ❌ SoftwareOpenGL | ✅ Hardware OpenGL |
| NTE: Tempo até crash | ~28s | >60s ou roda normal |
| Overrides: symlinks apontam para | `/usr/lib/...` | `/run/host/usr/lib/...` |
| LD_LIBRARY_PATH no container | Não setado | `/overrides/...` primeiro |
| Debug info (vulkaninfo etc) | Não disponível | Disponível via --debug-container |
| Config por prefixo | Não existe | `makai_manifest.json` completo |
| Compatibilidade Proton | Só DW-Proton | Qualquer fork (GE, CachyOS, UMU, etc.) |
| Controle display | Sem controle | Auto-detect + force x11/wayland |
| Jogos Chromium/CEF | Crasham no Wayland | Default X11, estável |
| Testes automatizados | 0 | ~20+ testes cobrindo pipeline todo |
