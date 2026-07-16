# Makai Time — Container Runtime

> Makai Time is our Steam Runtime container. It replaces pressure-vessel + _v2-entry-point + steamrt4 from Steam.

## Genealogical Map

```
Game.exe
  └─ Proton/Wine (engine que traduz DX → Vulkan/OpenGL)
       └─ Makai Time (container bwrap + runtime)
            ├─ Steam Runtime (Debian 13 — libc, libstdc++, etc.)
            ├─ GPU drivers (NVIDIA/AMD do host)
            ├─ Display (X11/Wayland socket)
            ├─ Áudio (PipeWire via /run/user)
            └─ Prefixo (WINEPREFIX — disco C:, regedit, DLLs)
```

## How it works

### 1. Isolation (bwrap — Bubblewrap)
Container com namespaces Linux: mount, PID, net, IPC, user, cgroup.
O container vê a árvore inteira do host como **read-only** (`--ro-bind / /`),
e só subsistemas específicos são expostos como writable.

### 2. Steam Runtime (steamrt4)
Base Debian 13 (Trixie) — as mesmas libs que a Steam usa.
Fornece libc, libstdc++, libpthread, libX11, etc. numa versão fixa,
garantindo compatibilidade entre distribuições.

### 3. GPU passthrough
Montamos `/dev/dri` e os dispositivos NVIDIA dentro do container.
As libs GPU do host (`libGLX_nvidia.so`, `libvulkan.so`, etc.) são
copiadas via symlinks para um diretório de overrides, montado sobre
o runtime.

### 4. Display + Audio
- X11: socket `/tmp/.X11-unix`
- Wayland: socket `$XDG_RUNTIME_DIR/wayland-0`
- Áudio: PipeWire via `/run/user/$UID`

### 5. Prefixo (WINEPREFIX)
O prefixo é montado como **writable** (`--bind`) — é onde ficam:
- `drive_c/` (disc C: do Windows)
- `system.reg`, `user.reg`, `userdef.reg`
- DLLs instaladas, configurações do Wine

## The fixes we made

### Python venv (3.10) instead of system Python (3.14)
**Problem**: Makai Time runs from the venv (Python 3.10), but inside
the container the Proton script uses `#!/usr/bin/env python3`, which
finds Python 3.14 from the host. Python 3.14 inside the container
can't find its `encodings` module due to mount namespace ordering.

**Fix**: Set `PATH` to the venv first inside the container:
```
PATH=/home/cas/Documentos/Makai-forge/tools/venv/bin:/usr/bin:...
```

### typing.Self compat layer (Python 3.10)
**Problem**: Proton CachyOS's `vulkan.py` uses `from typing import Self`,
which only exists in Python ≥3.11. The venv has 3.10.

**Fix**: A `sitecustomize.py` in the venv's `site-packages/` injects
a `Self` type into `typing` that supports `|` (union types), so
`Self | None` works as a return annotation.

### Bind mount ordering
**Problem**: When `--game-path` is a parent directory of `--prefix-path`,
the `--ro-bind` for the game path can shadow the `--bind` for the prefix,
making the prefix read-only.

**Fix**: Place `--bind prefix_path` **after** `--ro-bind game_path` in
the bwrap argument list, so the most specific mount wins.

## How to use

```bash
cd /home/cas/Documentos/Makai-forge/tools/prefix
tools/venv/bin/python3 -m makai_time.makai_time \
  --game-exe "/path/to/Game.exe" \
  --proton-path "/path/to/Proton" \
  --prefix-path "/path/to/prefix"
```

### Parameters
| Param | Description |
|---|---|
| `--game-exe` | Full path to the game executable |
| `--proton-path` | Path to the Proton installation (extracted, not tarball) |
| `--prefix-path` | WINEPREFIX directory (the one with `pfx/` inside) |
| `--game-path` | Directory containing game assets (optional if inside prefix) |
| `--dry-run` | Print bwrap command without executing |
| `--verbose` | Detailed output |

## Tested with

| Game | Proton | Result |
|---|---|---|
| How to Raise a Happy NEET (NW.js) | Proton-CachyOS-11.0-20260602-slr | ✅ Audio, GPU, display OK |
| How to Raise a Happy NEET (NW.js) | UMU-Proton-10.0-4 | ✅ Notepad/cmd OK |

## Tech Stack

- **Container**: Bubblewrap 0.11.2 (bwrap) — mount namespace isolation
- **Runtime**: steamrt4_platform_4.0.20260714.251823 (Debian 13)
- **Proton**: UMU-Proton, GE-Proton, CachyOS-Proton, and 20+ forks
- **GPU**: NVIDIA 610.43.03 (AMD/Intel untested but supported)
- **Sync**: NTSYNC (kernel 6.14+) > fsync > esync
- **Python**: 3.10 (venv), with typing.Self compat for Proton ≥3.11

## Architecture

```
tools/prefix/makai_time/
├── makai_time.py          # Entry point — full pipeline
├── core/
│   ├── gpu.py             # GPU detection
│   ├── sync.py            # NTSYNC/fsync/esync detection
│   ├── runtime.py         # Steam Runtime download
│   ├── display.py         # X11/Wayland/PipeWire mounts
│   ├── ldso.py            # ld.so.cache generation
│   └── passwd.py          # Synthetic /etc/passwd
├── overrides/
│   ├── capture.py         # GPU library capture (symlinks)
│   ├── detect.py          # GPU library detection
│   └── mount.py           # Bwrap args for overrides
├── proton/
│   ├── intel.py           # Proton Intelligence (fork detection)
│   ├── config.py          # DXVK/VKD3D config generation
│   ├── recommender.py     # Proton recommendation engine
│   └── definitions/       # 31 Proton definitions
├── profiles/
│   ├── registry.py        # Per-game profiles
│   ├── engine.py          # Engine handlers
│   └── manager.py         # Profile management
└── utils/
    └── sysinfo.py         # CPU topology / system info
```
