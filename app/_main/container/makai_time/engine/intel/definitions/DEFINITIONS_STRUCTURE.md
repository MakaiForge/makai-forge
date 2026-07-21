# Estrutura de Definições de Proton

Cada fork de Proton tem um arquivo dentro de `definitions/`.  
Este arquivo contém TUDO que o container precisa saber para montar o ambiente perfeito para aquele Proton.

---

## Arquivo mínimo

```python
FORK_ID = "proton-cachyos"

DEFINITION = {
    "name": "Proton-CachyOS",
    "author": "CachyOS Team",
    "base": "valve",
    "branch": "experimental-11.0",
    "wine_version": None,
    "dxvk": True,
    "vkd3d": True,
    "dxvk_nvapi": True,
    "features": { ... },
    "patches": [ ... ],
    "dll_overrides": { ... },
    "env_defaults": { ... },
    "ld_library_path_extra": [ ... ],
    "launch": { ... },
    "container_overrides": { ... },
    "notes": "...",
}


def get_container_config() -> dict:
    """Configuração completa do container para este Proton.
    
    O builder.py lê estas configs e monta o container.
    Cada step (audio, gpu, display, etc.) usa os dados da sua seção.
    """
    return {
        "audio": { ... },
        "gpu": { ... },
        "display": { ... },
        "container": { ... },
        "env": { ... },
        "devices": { ... },
    }
```

---

## Seções do `DEFINITION`

### `features`

Features que o Proton suporta. Cada feature ativa env vars automaticamente via `inject_features()`.

| Feature | Env vars ativadas |
|---------|------------------|
| `ntsync` | `PROTON_USE_NTSYNC=1`, `WINE_NTSYNC=1` |
| `wayland` | `PROTON_ENABLE_WAYLAND=1` |
| `fsr` | `WINE_FULLSCREEN_FSR=1` |
| `hdr` | `DXVK_HDR=1`, `WINE_HDR_ENABLE=1` |
| `raytracing` | `VKD3D_CONFIG=dxr` |
| `gamemode` | `GAMEMODE_ENABLED=1` |
| `async` | `DXVK_ASYNC=1` |
| `dlss_upgrader` | `PROTON_ENABLE_DLSS_UPGRADER=1` |
| `xess_upgrader` | `PROTON_ENABLE_XESS_UPGRADER=1` |
| `local_shader_cache` | `PROTON_LOCAL_SHADER_CACHE=1` |
| `per_game_shader_cache` | `PROTON_PER_GAME_SHADER_CACHE=1` |

### `patches`

Patches aplicados no Proton. Cada patch ativa env vars.

| Patch | Env vars |
|-------|---------|
| `nvidia_libs_bundled` | `PROTON_NVIDIA_LIBS=1` — skips NVIDIA overrides no container |
| `dxvk_sarek` | `PROTON_DXVK_SAREK=1` |
| `dxvk_low_latency` | `PROTON_DXVK_LOWLATENCY=1` |
| `winewayland` | `PROTON_ENABLE_WAYLAND=1` |
| `protonfixes` | Ativa protonfixes |
| `eac_bypass` | `PROTON_EAC_ENABLE=1` |

### `env_defaults`

Env vars padrão que o Proton fork define. Exemplo CachyOS:

```python
"env_defaults": {
    'PROTON_LOCAL_SHADER_CACHE': '1',
    'WINE_FULLSCREEN_FSR': '1',
    'WINE_FULLSCREEN_FSR_STRENGTH': '2',
}
```

### `launch`

Como o Proton deve ser executado:

| Chave | Valores | Descrição |
|-------|---------|-----------|
| `method` | `wine64`, `wine_preloader`, `start_unix` | Como executar o Wine |
| `wineloadernoexec` | `True`/`False` | Usa `WINELOADERNOEXEC` |
| `use_preloader` | `True`/`False` | Usa `wine64-preloader` |
| `use_umu_exe` | `True`/`False` | Usa `umu.exe` como entry point |

### `container_overrides`

Configurações específicas para o container bwrap:

```python
"container_overrides": {
    'ntsync': True,           # Monta /dev/ntsync (kernel 6.14+)
    'nvidia_libs_bundled': True,  # Pula overrides NVIDIA (já vem no Proton)
}
```

---

## Seções do `get_container_config()`

A função `get_container_config()` retorna um dict com todas as configurações que o builder precisa.  
Cada chave do dict corresponde a um step do container.

### `audio`

```python
"audio": {
    "setup_alsa_config": False,    # Cria /etc/asound.conf? Se False, usa config nativa
    "asound_default": "pipewire",  # "pipewire" | "pulse" | None
    "bind_pulse": True,            # Monta socket PulseAudio
    "bind_pipewire": True,         # Monta socket PipeWire
    "pulse_cookie": True,          # Monta cookie de autenticação
    "pulse_server": "unix:/run/user/1000/pulse/native",  # PULSE_SERVER
    "pulse_clientconfig": "enable-shm=no",  # Conteúdo do PULSE_CLIENTCONFIG
    "alsoft_drivers": "pulse,alsa",  # ALSOFT_DRIVERS
    "bind_dev_snd": False,         # Monta /dev/snd? (CachyOS: False, PV: False)
    "openal_i386": True,           # Baixa/monta libopenal.so.1 i386?
}
```

### `gpu`

```python
"gpu": {
    "vendor": "nvidia",           # nvidia | amd | intel | auto
    "skip_nvidia_overrides": True,  # Pula overrides (Proton já tem bundled)
    "egl_vendor_nvidia_only": True,  # Força ONLY NVIDIA EGL
    "glx_vendor": "nvidia",       # __GLX_VENDOR_LIBRARY_NAME
    "vk_icd": "nvidia",           # nvidia_icd.json | mesa_icd.json
    "dri_drivers_path": "",       # LIBGL_DRIVERS_PATH customizado
    "gbm_backends_path": "",      # GBM_BACKENDS_PATH customizado
    "bind_dev_dri": True,         # Monta /dev/dri?
    "bind_dev_nvidia": True,      # Monta /dev/nvidia*?
}
```

### `display`

```python
"display": {
    "bind_x11": True,             # Monta /tmp/.X11-unix
    "bind_wayland": True,         # Monta socket Wayland
    "bind_dbus": True,            # Monta socket D-Bus
    "bind_discord": True,         # Monta sockets Discord IPC
    "xauthority": True,           # Configura XAUTHORITY
    "wayland_display": "wayland-0",  # WAYLAND_DISPLAY
    "display_env": ":0",          # DISPLAY
    "xdg_session_type": "",       # XDG_SESSION_TYPE
}
```

### `container`

```python
"container": {
    "ld_library_path_extra": [    # Paths extras no LD_LIBRARY_PATH
        "/custom/lib",
    ],
    "needs_ntsync_dev": True,     # Monta /dev/ntsync
    "needs_seccomp": True,        # Aplica filtros seccomp
    "needs_userns": False,        # --disable-userns?
    "cap_drop_all": True,         # --cap-drop ALL?
    "host_provider_mount": "/run/host",  # Provider mount (ou None)
    "home_isolation": "tmpfs",    # "tmpfs" | "bind" | None
    "runtime_mount": "/usr",      # Onde montar o runtime
    "lib_mount": "/lib",          # Onde montar as libs
}
```

### `env`

Env vars adicionais específicas do Proton (além das features/patches):

```python
"env": {
    "WINEDLLOVERRIDES": "winemenubuilder.exe=",
    "PROTON_CRASH_REPORT_DIR": "/tmp/proton_crashreports",
}
```

### `devices`

```python
"devices": {
    "bind_snd": False,            # /dev/snd
    "bind_dri": True,             # /dev/dri
    "bind_nvidia": True,          # /dev/nvidia{0,ctl,modeset,uvm}
    "bind_ntsync": True,          # /dev/ntsync
    "bind_shm": True,             # /dev/shm
    "bind_udev": True,            # /run/udev
    "extra_binds": [              # Binds adicionais (host -> container)
        "/dev/foo:/dev/foo",
    ],
}
```

---

## Fluxo de dados

```
runner.py
  ├── identify_proton() → fork_id
  ├── inject_features() → env vars + launch
  ├── get_container_config(fork_id) → config dict
  └── build_command() → builder.py

builder.py
  ├── steps/isolation.py     ← lê container config
  ├── steps/runtime.py       ← lê runtime config
  ├── steps/gpu.py           ← lê gpu config
  ├── steps/audio.py         ← lê audio config
  ├── steps/display.py       ← lê display config
  ├── steps/devices.py       ← lê devices config
  ├── steps/env.py           ← lê env + features
  └── steps/exec.py          ← lê launch config
       └── Cada step retorna StepResult(args, applied, summary)
            └── builder coleta, valida, executa bwrap
```

---

## Adicionando um novo Proton

1. Crie `definitions/proton_meu.py`
2. Defina `FORK_ID`, `DEFINITION` e `get_container_config()`
3. Adicione o ID em `identify_proton()` no `__init__.py`
4. Pronto. O builder interpreta automaticamente.
