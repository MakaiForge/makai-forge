# Estudo Pressure-Vessel → Gaps nos steps/

## Pipeline PV

```
_v2-entry-point (shell)
  → ./run (shell)
    → pressure-vessel-unruntime (shell, captura LD_LIBRARY_PATH)
      → pressure-vessel-wrap (C compilado, ORQUESTRADOR)
        → srt-bwrap (C, construtor bwrap com --capsule-capture)
        → capsule-capture-libs (C, captura libs GPU do host)
        → check-vulkan / check-gl / check-va-api / check-vdpau (C, testes)
        → detect-lib / inspect-library (C, detecção de .so)
        → is-x-server-xwayland (C, detecção display)
        → launch-options.py (Python, UI de debug — irrelevante)
```

## O que cada binário faz

### capsule-capture-libs ★ MAIS IMPORTANTE
```bash
capsule-capture-libs [OPTIONS] PATTERN...
  --provider=PROVIDER    Onde procurar as libs (default: / = host)
  --dest=LIBDIR          Onde criar os symlinks (default: .)
  --link-target=PATH     Como PROVIDER será montado no container
  --container=CONTAINER  Como o container se parece (default: /)
  --compare-by=METHOD    Como comparar versões de libs
  --library-knowledge=FILE  Info de libs conhecidas (desktop-style)
  --remap-link-prefix=FROM=TO  Re-mapear prefixos de paths
  --no-glibc             Não capturar libs glibc

PATTERNs:
  soname:libGL.so.1        → Captura lib do ld.so.cache
  soname-match:libGL_*.so  → Captura por glob
  path:/usr/lib/libfoo.so  → Captura path absoluto
  gl:                      → Atalho: captura TUDO de GL
  if-exists:...            → Não falha se não achar
  only-dependencies:...    → Só as dependências
  no-dependencies:...      → Sem dependências
```

**Algoritmo**: Acha a lib no PROVIDER, cria symlink em DEST apontando
para `--link-target/caminho/da/lib`. Segue symlinks até o realpath.
Se tiver `--remap-link-prefix`, reescreve prefixos nos symlinks.

### check-vulkan
Testa se Vulkan funciona. Com `--visible`, abre janela de teste.
Saída: JSON com resultado (funciona ou não, driver, device).

### check-gl
Testa se OpenGL funciona. Com `--visible`, abre janela de teste.

### is-x-server-xwayland
Detecta se o X server atual é XWayland.
Exit: 0=sim, 1=não, 3=conexão falhou

### detect-lib
Encontra uma lib pelo soname no ld.so.cache.

### srt-bwrap
Bubblewrap 0.12.0 com suporte a --capsule-capture.
Usa `srt-bwrap` em vez de `bwrap` para ter GPU provider mount.

## Gaps por step

### gpu.py — CRÍTICO (causa do "sem video")

| Funcionalidade | PV (capsule-capture-libs) | Nosso gpu.py | Status |
|---|---|---|---|
| Capture libs NVIDIA | `capsule-capture-libs soname:libGL.so.1 path-match:/usr/lib/libnvidia*` etc. | Só quando `skip_nvidia_overrides=False` | ❌ Quebrado pra CachyOS |
| Capture libs AMD/Intel | Mesmo mecanismo | Não faz | ❌ |
| DRI drivers | `path-match:/usr/lib/dri/*_dri.so` | Não faz | ❌ |
| VA-API drivers | `path-match:/usr/lib/dri/*_drv_video.so` | Não faz | ❌ |
| VDPAU drivers | `path-match:/usr/lib/vdpau/*.so` | Não faz | ❌ |
| GBM backends | `path-match:/usr/lib/gbm/*.so` | Não faz | ❌ |
| Vulkan ICD JSON remap | Copia JSON, reescreve paths das libs | Aponta pro host direto (quebra no container) | ❌ CRÍTICO |
| Vulkan layers | Copia JSONs, reescreve paths | Aponta pro host direto | ❌ |
| EGL vendor configs | Copia JSONs, reescreve paths | Aponta pro host direto | ❌ |
| OpenXR runtime | `path-match:/usr/share/openxr/*.json` | Não faz | ❌ |
| libc/libglibc capture | `--no-glibc` (exclui) | Não faz | ✅ (não precisa) |
| Symlink chain (realpath) | `realpath()` cada lib, cria symlink correto | `_add_nvidia_bind` faz bind direto | ⚠️ Funciona parcial |

**Problema raiz**: Quando `skip_nvidia_overrides=True` (CachyOS), nosso
`gpu.py` adiciona ZERO binds de GPU. Mas o Proton precisa que os JSONs
VK_ICD_FILENAMES e EGL vendor apontem para paths acessíveis dentro do
container. Com o runtime montado em `/usr/`, o path `/usr/lib/...` do
JSON resolve pro runtime (steamrt4, sem NVIDIA), não pro host.

### devices.py — Leve

| Funcionalidade | PV | Nosso devices.py | Status |
|---|---|---|---|
| /dev/dri | ✅ `--dev-bind /dev/dri` | ✅ | OK |
| /dev/nvidia* | ✅ `--dev-bind /dev/nvidia[0,ctl,modeset,uvm]` | ✅ | OK |
| /dev/shm | ✅ `--bind /dev/shm` | ✅ | OK |
| /run/udev | ✅ `--ro-bind /run/udev` | ✅ | OK |
| /dev/input (joystick) | ✅ `--dev-bind /dev/input` | ❌ Não faz | ⚠️ |
| nvidia-modprobe | ✅ Carrega nvidia_uvm.ko | ✅ Em runner.py | OK |
| NTSYNC | ✅ Condicional | ⚠️ `bind_ntsync: False` por default | OK |

### display.py — Leve

| Funcionalidade | PV | Nosso display.py | Status |
|---|---|---|---|
| X11 socket | ✅ `--ro-bind /tmp/.X11-unix` | ✅ | OK |
| Wayland socket | ✅ `--ro-bind $WAYLAND_SOCKET` | ✅ | OK |
| D-Bus | ✅ `--ro-bind $DBUS_SOCKET` | ✅ | OK |
| Discord IPC | ✅ Passivo (sockets existentes) | ✅ | OK |
| XWayland detection | ✅ `is-x-server-xwayland` | ❌ Não faz | ⚠️ Cosmético |
| XDG portal | ✅ `check-xdg-portal` pra flatpak | ❌ Não faz | ⚠️ |
| Session check | ✅ Verifica se user tá logado | ❌ Não faz | ⚠️ |

### env.py — MÉDIO (precisa de ajuste pós-rewrite JSON)

| Funcionalidade | PV | Nosso env.py | Status |
|---|---|---|---|
| DISPLAY | ✅ `--setenv DISPLAY` | ✅ | OK |
| WAYLAND_DISPLAY | ✅ `--setenv WAYLAND_DISPLAY` | ✅ | OK |
| VK_ICD_FILENAMES | ✅ Aponta pro JSON REESCRITO nos overrides | ❌ Aponta pro host | 🔴 CRÍTICO |
| VK_LAYER_PATH | ✅ Aponta pros layers reescritos | ⚠️ Aponta pro host | 🔴 |
| LD_LIBRARY_PATH | ✅ Constrói com overrides + runtime | ✅ | OK |
| STEAM_COMPAT_* | ✅ 13 vars | ✅ | OK |
| XAUTHORITY | ✅ Bind do arquivo + env var | ✅ | OK |
| container= | ✅ `container=makai` | ✅ `container=makai` | OK |

### isolation.py — OK

Já fazemos --unshare (individual), --disable-userns, --clearenv,
--cap-drop ALL, --add-seccomp-fd. Melhor que o PV porque temos
--share-net (internet).

### runtime.py — OK

Monta o runtime Debian como /usr. Falta apenas o ld.so.cache
ser regenerado com overrides GPU antes do runtime.

### audio.py — OK

PipeWire, PulseAudio, D-Bus socket, ALSA config, OpenAL i386.

### etc.py — OK

nsswitch, hosts, resolv, machine-id, timezone, fontconfig.

### ssl.py — OK

Multi-distro SSL certs (Debian, Fedora, Arch).

### mounts.py — OK

Provider mount (/run/host), Proton, prefixo, jogo, home.

## Plano de implementação (ordem sugerida)

### Fase 1: GPU capture (gpu.py) — RESOLVE "SEM VIDEO"
1. Criar função `capture_host_gpu_libs()` que:
   - Lê `nvidia_icd.json` do host
   - Copia pra dest temporário
   - **Reescreve** os paths das libs de `/usr/lib/...` pra `/run/host/usr/lib/...`
   - Monta o JSON reescrito via `--ro-bind`
   - Mesmo para EGL vendor configs
   - Opcional: captura libs NVIDIA do host em `/overrides/lib/`

2. Adicionar detecção de vendor (AMD/Intel/NVIDIA) automática:
   - `nvidia-smi` ou `/dev/nvidia0` → NVIDIA
   - `glxinfo` com vendor string → AMD/Intel
   - `/dev/dri/renderD128` + `lspci` → AMD/Intel

3. Adicionar capture de DRI drivers:
   - Bind `/usr/lib/dri/` do host em `/run/host/usr/lib/dri/`
   - Configurar `LIBGL_DRIVERS_PATH` pro /run/host path

### Fase 2: Verificação GPU
1. Rodar `check-vulkan` e `check-gl` após setup pra validar
2. Logar resultado (driver, device, versão)

### Fase 3: Display (display.py)
1. Adicionar detecção XWayland
2. Adicionar verificação de sessão ativa

### Fase 4: Periféricos (devices.py)
1. Adicionar `/dev/input` bind

## Como o PV faz o remap de JSON (algoritmo)

O `capsule-capture-libs` com `--remap-link-prefix` faz:

1. Acha o JSON do host (ex: `/usr/share/vulkan/icd.d/nvidia_icd.json`)
2. Lê o JSON, extrai o `path` da lib (ex: `/usr/lib/x86_64-linux-gnu/libnvidia-glcore.so.550.120`)
3. Cria um **symlink** em `--dest/libnvidia-glcore.so.550.120 → /run/host/usr/lib/x86_64-linux-gnu/libnvidia-glcore.so.550.120`
4. Cria um **JSON reescrito** em `--dest/nvidia_icd.json` com path apontando pro symlink

**Implementação nossa (Python puro, sem C):**
```python
import json, os
from pathlib import Path

host_icd = Path("/usr/share/vulkan/icd.d/nvidia_icd.json")
overrides_dir = Path("/tmp/makrun-overrides/vulkan/icd.d")

icd = json.loads(host_icd.read_text())
old_path = icd["ICD"]["path"]
lib_name = Path(old_path).name

# Cria symlink lib → /run/host/...
(overrides_dir / lib_name).symlink_to(f"/run/host{old_path}")

# Re-escreve JSON com path pro symlink
icd["ICD"]["path"] = f"/overrides/vulkan/icd.d/{lib_name}"
(overrides_dir / "nvidia_icd.json").write_text(json.dumps(icd))

# Monta no container
args.extend(["--ro-bind", str(overrides_dir / "nvidia_icd.json"),
             "/usr/share/vulkan/icd.d/nvidia_icd.json"])
```

## Conclusão

**Fase 1** (GPU capture + JSON remap) é a **única** necessária pra
resolver o "sem video". As outras fases são cosméticas ou periféricas.
Toda a infraestrutura `steps/` permanece intacta — só `gpu.py` precisa
de adições.
