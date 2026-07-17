# RELATÓRIO: Execução do UMU-Launcher com Grand Fantasia Violet

**Data:** 17/07/2026
**Jogo:** Grand Fantasia Violet (`Launcher.exe`)
**Proton:** UMU-Proton-10.0-4 (wine-10.0)
**Runtime:** sniper (steamrt3_platform_3.0.20260714.251823)
**GPU:** NVIDIA 610.43.03
**Prefix:** `/home/cas/Games/Makai-forger/gf`

---

## 1. COMANDO EXECUTADO

```
GAMEID=grand-fantasia-launcher \
WINEPREFIX=/home/cas/Games/Makai-forger/gf \
PROTONPATH=UMU-Proton-10.0-4 \
umu-run waitforexitandrun \
"/home/cas/Games/Makai-forger/gf/drive_c/Violet Games/Grand Fantasia Violet/Launcher.exe"
```

---

## 2. CADEIA DE EXECUÇÃO COMPLETA (com base no código-fonte)

```
umu-run (Python zipapp v1.3.0)
  ├── [Python] umu_run.umu_run()              ← INTELIGÊNCIA PRINCIPAL
  │    ├── check_env()                          ← valida/autocria prefixo, PROTONPATH
  │    ├── setup_pfx()                          ← pfx/ symlink + steamuser dance
  │    ├── resolve_umu_version()               ← lê toolmanifest.vdf → runtime appid
  │    ├── set_env()                            ← 30+ env vars (STEAM_COMPAT_*, UMU_*)
  │    ├── enable_steam_game_drive()            ← mount point detection + ldconfig
  │    ├── build_command()                      ← 4 code paths diferentes
  │    ├── prctl(PR_SET_CHILD_SUBREAPER, 1)     ← gerencia orphans
  │    └── Popen(start_new_session=True)        ← executa _v2-entry-point
  │
  └─ _v2-entry-point (shell script, ~318 linhas)
       └─ run (shell script)
            └─ pressure-vessel-unruntime (shell, 108 linhas)
                 └─ pressure-vessel-wrap (C binary, 868KB)
                      └─ srt-bwrap (C binary, fork do bwrap, ~500KB)
                           └─ pv-adverb (C binary, dentro do container)
                                └─ umu-shim (shell, 8 linhas)
                                     └─ proton (Python, ~2468 linhas)
                                          └─ umu.exe (Windows PE)
                                               └─ Launcher.exe (Windows PE)
```

---

## 2.1. Detalhamento de cada etapa (Python e Shell/Binário)

### 2.1.0. `umu_run.umu_run()` — Antes de chamar _v2-entry-point

O UMU-Run Python executa em sequência:

#### `check_env()` (`umu_run.py:91-153`)
- Se `GAMEID` não setado → `"umu-default"`
- Se `WINEPREFIX` vazio → `$HOME/Games/umu/$GAMEID` (auto-create)
- Se `PROTONPATH` = `GE-Proton`/`GE-Latest`/`UMU-Latest` → baixa via `get_umu_proton()`
- Se `PROTONPATH` não setado → tenta baixar automático
- Valida que `PROTONPATH` existe

#### `setup_pfx()` (`umu_run.py:59-88`)
- Remove `pfx/` se for symlink (evita symlink loop)
- Cria `pfx/` → `<prefix>` **symlink**
- Cria `tracked_files` (arquivo vazio)
- **steamuser symlink dance**:
  - Prefixo novo: `steamuser/` é criado, `wineuser` → symlink para `steamuser`
  - Se `wineuser/` existe mas `steamuser/` não: `steamuser` → symlink para `wineuser`
  - Se `steamuser/` existe mas `wineuser/` não: `wineuser` → symlink para `steamuser`

#### `resolve_umu_version()` (`umu_run.py:672-733`)
- Se `RUNTIMEPATH` já setado como codename → retorna direto
- Lê `$PROTONPATH/toolmanifest.vdf` → procura `"require_tool_appid" "XXXXX"`
- Mapeia appids para runtimes (definido em `umu/__init__.py`):
  - `"1628350"` → `sniper` / `steamrt3`
  - `"1391110"` → `soldier` / `steamrt2`
  - `"4183110"` → `steamrt4` / `steamrt4`
- **UMU-Proton-10.0-4** → `require_tool_appid=1628350` → **sniper** (steamrt3)

#### `set_env()` (`umu_run.py:156-254`)
Configura TODAS as env vars (30+). As críticas:

| Variável | Valor | De onde vêm |
|----------|-------|-------------|
| `WINEPREFIX` | prefixo resolvido | check_env + setup_pfx |
| `PROTONPATH` | caminho absoluto do Proton | check_env |
| `STEAM_COMPAT_DATA_PATH` | = WINEPREFIX | env var |
| `STEAM_COMPAT_SHADER_PATH` | = WINEPREFIX/shadercache | env var |
| `STEAM_COMPAT_INSTALL_PATH` | = exe.parent | set_env (linha 201-202) |
| `STEAM_COMPAT_TOOL_PATHS` | PROTONPATH:RUNTIMEPATH | env var |
| `STEAM_COMPAT_MOUNTS` | = STEAM_COMPAT_TOOL_PATHS | env var |
| `STEAM_COMPAT_CLIENT_INSTALL_PATH` | vazio (pode vir do host) | env var |
| `STEAM_COMPAT_LIBRARY_PATHS` | mount point do exe.parent | enable_steam_game_drive |
| `STEAM_RUNTIME_LIBRARY_PATH` | lib paths do host + game dir | enable_steam_game_drive |
| `PROTON_VERB` | `waitforexitandrun` (default) | env var ou default |
| `UMU_ID` | = GAMEID | env var |
| `UMU_INVOCATION_ID` | `token_hex(16)` → usado pra achar PID! | set_env |
| `STEAM_COMPAT_APP_ID` | `"0"` (non-Steam) | set_env |
| `SteamAppId` / `SteamGameId` | = STEAM_COMPAT_APP_ID | set_env |
| `UMU_STEAM_GAME_ID` | de env var `SteamGameId` | set_env |
| `RUNTIMEPATH` | `$UMU_LOCAL/$codename` | env var |
| `UMU_NO_RUNTIME` / `UMU_NO_PROTON` / `UMU_RUNTIME_UPDATE` | do host ou vazio | set_env |
| `UMU_ZENITY` | do host | set_env (zenity popup) |
| `STORE` | do host ou vazio | set_env |

#### `enable_steam_game_drive()` (`umu_run.py:257-285`)
- Anda pelos **parents** de `STEAM_COMPAT_INSTALL_PATH` até achar um **mount point** (subvolumes included)
- Seta `STEAM_COMPAT_LIBRARY_PATHS` com o mount point encontrado
- Coleta `LD_LIBRARY_PATH` do **host** (herdado)
- Roda `ldconfig -p` (via `get_library_paths()`) para achar **todos** os paths de lib do sistema
- Monta `STEAM_RUNTIME_LIBRARY_PATH` = game_dir + ldconfig_paths + host_ld_library_path

#### `build_command()` (`umu_run.py:288-349`)
4 code paths diferentes:

1. **Default** (nosso caso):
   ```
   _v2-entry-point --verb PROTON_VERB -- umu-shim proton PROTON_VERB EXE
   ```
2. **Winetricks**:
   ```
   _v2-entry-point --verb PROTON_VERB -- proton PROTON_VERB EXE -q [opts]
   ```
3. **UMU_NO_PROTON=1**:
   ```
   _v2-entry-point --verb PROTON_VERB -- EXE [opts]
   ```
4. **UMU_NO_RUNTIME=1**:
   ```
   proton PROTON_VERB EXE [opts]
   ```

#### `run_command()` (`umu_run.py:622-669`)
- `prctl(PR_SET_CHILD_SUBREAPER, 1)` → processo vira subreaper (adota orphans)
- `Popen(command, start_new_session=True, cwd=cwd)`
- Se for **Flatpak + gamescope**: `run_in_steammode(proc)`
- Senão: `proc.wait()`

#### Network check (`umu_run.py:781-813`)
- Tenta `socket.connect(("1.1.1.1", 53))` com 5s timeout
- Se offline mas `has_umu_setup()` → continua (runtimes já existem)
- Se offline e **nunca fez setup** → `RuntimeError`

#### File locking (`umu_util.py:44-57`)
- `unix_flock()` = `flock(fd, LOCK_EX)` + `LOCK_UN` no finally
- 3 locks: `umu.lock` (runtime), `compatibilitytools.d.lock` (proton), `pfx.lock` (prefix)

---

### 2.1.1. `umu-run` (Python) — chamada ao _v2-entry-point
- **Download runtime** (`umo_runtime.py:_install_umu`):
  - URL: `https://repo.steampowered.com/steamrt3/images/latest-public-beta/`
  - SHA256 via SHA256SUMS
  - **Resume** de downloads parciais via `$HOME/.cache/umu/`
  - Extrai tar.xz, **exchange atômico** via `renameat2(RENAME_EXCHANGE)`
  - Valida com `pv-verify --minimized-runtime` (mtree)
  - Cria `umu` → symlink para `_v2-entry-point`
  - Cria `umu-shim` via `create_shim()`
- **Download Proton** (`umu_proton.py:_get_latest/_fetch_proton`):
  - GitHub API `repos/Open-Wine-Components/umu-proton/releases/latest`
  - SHA512 verification
  - Resume de cache
  - **Delta updates via bspatch** (CBOR + assinatura criptográfica com chave pública)
  - Locking com `compatibilitytools.d.lock`
- Seta env vars (ver seção 2.1.0)
- Builda comando (ver seção 2.1.0)
- Executa com `Popen(..., start_new_session=True)` + `prctl(PR_SET_CHILD_SUBREAPER, 1)`

### 2.1.2. `_v2-entry-point` (Shell)
- Parseia `--verb waitforexitandrun`
- Extrai `LD_LIBRARY_PATH` → remove paths do Steam Runtime
- Salva como `PRESSURE_VESSEL_APP_LD_LIBRARY_PATH`
- Unset `LD_LIBRARY_PATH` e `STEAM_RUNTIME`
- Chama `./run`

### 2.1.3. `run` (Shell)
- Seta `PRESSURE_VESSEL_RUNTIME=sniper_platform_3.0.20260714.251823`
- Seta `PRESSURE_VESSEL_ARCHITECTURES=x86_64-linux-gnu:i386-linux-gnu`
- Seta `PRESSURE_VESSEL_COPY_RUNTIME=1`
- Chama `pressure-vessel/bin/pressure-vessel-unruntime`

### 2.1.4. `pressure-vessel-unruntime` (Shell)
- Preserva `LD_LIBRARY_PATH` → passa como `--env-if-host`
- Preserva `LD_PRELOAD` → passa como `--ld-preloads`
- Preserva `PATH` → passa como `--env-if-host`
- Limpa tudo: `unset LD_LIBRARY_PATH`, `PATH=/usr/bin:/bin`
- Restaura `PRESSURE_VESSEL_APP_LD_LIBRARY_PATH` como `LD_LIBRARY_PATH`
- Chama `pressure-vessel-wrap`

### 2.1.5. `pressure-vessel-wrap` (C binary)
**Esta é a etapa MAIS IMPORTANTE.** Faz em ordem:

1. **Testa bwrap**: executa `srt-bwrap --ro-bind /etc /etc ... true` e `srt-bwrap --version`
2. **Detecta GPU**: inspeciona `libGLX_mesa.so.0`, `libEGL_mesa.so.0`, `libGL.so.1`, `libgbm.so.1`, `libva.so.2`
3. **Provider mount**: `Architecture x86_64-linux-gnu graphics stack provided by / -> /run/host`
4. **Cria overrides** via `capsule-capture-libs` (binário C):
   - Captura **libs GPU**: `libcuda.so.1`, `libEGL_nvidia.so.0`, `libGLX_nvidia.so.0`, `libnvidia-*.so`
   - Captura **Vulkan ICDs**: `nvidia_icd.json` (reescrito com paths do container)
   - Captura **Vulkan layers**: Steam overlay, MangoHud, Gamescope WSI
   - Captura **EGL ICDs**: JSONs glvnd
   - Captura **DRI drivers**: TODOS os `*_dri.so` de `/usr/lib32/dri/` e `/usr/lib/dri/`
   - Captura **VA-API drivers**: `*_drv_video.so`
   - Captura **VDPAU drivers**
   - Captura **OpenXR runtimes**
5. **Regenera ld.so.cache**: `pv-adverb --regenerate-ld.so-cache` com overrides primeiro
6. **Monta filesystem**: constrói ~800 flags bwrap (detalhado na seção 3)
7. **Executa**: `srt-bwrap --args 26 ... pv-adverb -- ... umu-shim proton ... Launcher.exe`

### 2.1.6. `srt-bwrap` (fork do bwrap 0.11.2)
- SRT-bwrap é UMA CÓPIA MODIFICADA do bubblewrap, compilada com:
  - `--not-a-security-boundary` (desativa proteções)
  - `--new-session` (cria nova session)
  - Suporte a `--json-status-fd`
  - Compilado estaticamente (~500KB)

### 2.1.7. `pv-adverb` (dentro do container)
- Regenera `ld.so.cache` com overrides + runtime
- Aplica env vars preservadas
- Loga TODAS as env vars do container (veja seção 4)
- Executa: `umu-shim proton waitforexitandrun Launcher.exe`

### 2.1.8. `umu-shim` (Shell)
Criado por `create_shim()` em `umu_runtime.py:34-61`:
```sh
#!/bin/sh
if [ "${XDG_CURRENT_DESKTOP}" = "gamescope" ] || [ "${XDG_SESSION_DESKTOP}" = "gamescope" ]; then
    if [ "${STEAM_MULTIPLE_XWAYLANDS}" = "1" ]; then
        if [ -z "${DISPLAY}" ]; then
            export DISPLAY=":1"
        fi
    fi
fi
exec "$@"
```
- Só para Steam Deck/gamescope: seta `DISPLAY=:1` se necessário
- Executa: `exec proton waitforexitandrun Launcher.exe`

### 2.1.9. `proton` (Python - UMU-Proton-10.0-4)
- `Proton.__init__()` → detecta `base_dir`, `dist_dir`, `lib_dir`, `bin_dir`
- `CompatData.__init__()` → `prefix_dir = WINEPREFIX + "/pfx/"`
- `Session.__init__()` → copia `os.environ` inteiro!
- `init_wine()` → seta `LD_LIBRARY_PATH = files/lib/x86_64-linux-gnu:...`
- `init_session()` → seta `WINEPREFIX`, `WINEDLLOVERRIDES`, etc.
- Detecta `UMU_ID` → usa `wine` direto (sem `steam.exe`)
- Executa `umu.exe` (wrapper UMU para non-Steam)

### 2.1.10. `umu.exe` (Windows PE)
- Wrapper que lida com `GAMEID` e `UMU_ID` para jogos non-Steam
- Executa `Launcher.exe`

---

## 3. BWRAP FLAGS COMPLETOS

**Total: ~800 flags, passados via `--args 26` (arquivo FD 26)**

### 3.1. Provider Mount (HOST ACESSÍVEL)
```
--ro-bind /usr /run/host/usr
--symlink usr/bin /run/host/bin
--symlink usr/lib /run/host/lib
--symlink usr/lib /run/host/lib64
--symlink usr/bin /run/host/sbin
--ro-bind /etc /run/host/etc
--ro-bind /etc/os-release /run/host/os-release
```

### 3.2. Binds de diretórios do usuário
```
--bind /home /home
--bind /home/cas /home/cas
--bind /home/cas/.cache /home/cas/.cache
--bind /home/cas/.config /home/cas/.config
--bind /home/cas/.local/share /home/cas/.local/share
--bind /home/cas/.local/share/Steam /home/cas/.local/share/Steam
--bind /home/cas/.local/share/Steam/compatibilitytools.d/UMU-Proton-10.0-4 /...
--bind /home/cas/.local/share/Steam/linux32 /...
--bind /home/cas/.local/share/Steam/linux64 /...
--bind /home/cas/.local/share/Steam/ubuntu12_32 /...
--bind /home/cas/.local/share/Steam/ubuntu12_64 /...
--bind /home/cas/.local/share/umu/steamrt3 /...
--bind /home/cas/.local/state /...
--bind /home/cas/.var /...
--bind /home/cas/Documentos/Makai-forge /...
--bind /home/cas/Games/Makai-forger/gf /...              ← PREFIXO
--bind /home/cas/Games/Makai-forger/gf/shadercache /...
```

### 3.3. Diretórios do sistema
```
--bind /mnt /mnt
--bind /opt /opt
--bind /run/media /run/media
--ro-bind /run/udev /run/udev
--bind /srv /srv
--bind /tmp /tmp                              ← /tmp é bind do host (NÃO tmpfs!)
--bind /var/tmp /var/tmp
```

### 3.4. Runtime Steam (sniper) como /usr
```
--ro-bind <var>/tmp-XXXX/usr /usr
--symlink usr/bin /bin
--symlink usr/lib /lib
--symlink usr/lib32 /lib32
--symlink usr/lib64 /lib64
--symlink usr/sbin /sbin
--symlink usr/lib/pressure-vessel/overrides /overrides
```

### 3.5. Runtime filesystem base
```
--dev-bind /dev /dev
--proc /proc
--ro-bind /sys /sys
--dir /tmp
--dir /var
--dir /var/tmp
--symlink ../run /var/run
```

### 3.6. Arquivos /etc do runtime + host
```
--ro-bind <var>/tmp-XXXX/etc/glvnd /etc/glvnd
--ro-bind <var>/tmp-XXXX/etc/fonts /etc/fonts
--ro-bind <var>/tmp-XXXX/etc/ssl /etc/ssl
--ro-bind <var>/tmp-XXXX/etc/ca-certificates /etc/ca-certificates
--ro-bind <var>/tmp-XXXX/etc/pulse /etc/pulse
--ro-bind <var>/tmp-XXXX/etc/vulkan /etc/vulkan
--ro-bind <var>/tmp-XXXX/etc/alsa /etc/alsa
... (mais ~60 arquivos /etc)
--ro-bind /etc/machine-id /etc/machine-id
--symlink /etc/machine-id /var/lib/dbus/machine-id
--ro-bind /etc/host.conf /etc/host.conf
--ro-bind /etc/hosts /etc/hosts
--ro-bind /etc/resolv.conf /etc/resolv.conf
--ro-bind-data <fd> /etc/passwd               ← gerado sintético via memfd
--ro-bind-data <fd> /etc/group                ← gerado sintético via memfd
```

### 3.7. ld.so.cache chain (estilo pressure-vessel)
```
--tmpfs /var/pressure-vessel/ldso
--symlink /var/pressure-vessel/ldso/ld.so.cache /etc/ld.so.cache
--symlink /var/pressure-vessel/ldso/ld.so.conf /etc/ld.so.conf
--symlink runtime-ld.so.cache /var/pressure-vessel/ldso/ld.so.cache
--symlink runtime-ld.so.conf /var/pressure-vessel/ldso/ld.so.conf
--ro-bind <var>/tmp-XXXX/etc/ld.so.cache /var/pressure-vessel/ldso/runtime-ld.so.cache
--ro-bind <var>/tmp-XXXX/etc/ld.so.conf /var/pressure-vessel/ldso/runtime-ld.so.conf
--symlink /var/pressure-vessel/ldso/ld.so.cache /var/cache/ldconfig/ld.so.cache
--symlink /var/pressure-vessel/ldso/ld.so.cache etc/ld-x86_64-pc-linux-gnu.cache
--symlink /var/pressure-vessel/ldso/ld.so.conf etc/ld-x86_64-pc-linux-gnu.path
... (mesmo para i686)
```

### 3.8. Timezone e Locale
```
--symlink /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime
--ro-bind-data <fd> /etc/timezone
```

### 3.9. Fontes e Icones
```
--ro-bind /usr/share/fonts /run/host/fonts
--ro-bind /var/cache/fontconfig /run/host/fonts-cache
--ro-bind /home/cas/.cache/fontconfig /run/host/user-fonts-cache
--ro-bind-data <fd> /run/host/font-dirs.xml
--ro-bind /usr/share/icons /run/host/share/icons
--ro-bind /home/cas/.local/share/icons /run/host/user-share/icons
```

### 3.10. Display (Wayland + X11)
```
--ro-bind /run/user/1000/wayland-0 /run/pressure-vessel/wayland-0
--tmpfs /tmp/.X11-unix
--ro-bind /tmp/.X11-unix/X1 /tmp/.X11-unix/X1            ← DISPLAY=:1
--ro-bind-data <fd> /run/pressure-vessel/Xauthority
```

### 3.11. Áudio (PipeWire + PulseAudio)
```
--ro-bind-data <fd> /run/pressure-vessel/pulse/config
--ro-bind /run/user/1000/pulse/native /run/pressure-vessel/pulse/native
--dev-bind /dev/snd /dev/snd
--ro-bind /run/user/1000/pipewire-0 /run/user/1000/pipewire-0
--ro-bind /run/user/1000/pipewire-0.lock /run/user/1000/pipewire-0.lock
```

### 3.12. D-Bus
```
--ro-bind /run/user/1000/bus /run/pressure-vessel/bus
--ro-bind /var/run/dbus/system_bus_socket /run/dbus/system_bus_socket
--symlink ../../pressure-vessel/bus /run/user/1000/bus
```

### 3.13. Discord IPC
```
--ro-bind /run/user/1000/discord-ipc-0 /run/user/1000/discord-ipc-0
```

### 3.14. Journal
```
--ro-bind /run/systemd/journal/socket /run/systemd/journal/socket
--ro-bind /run/systemd/journal/stdout /run/systemd/journal/stdout
```

### 3.15. Env vars (--setenv)
```
--setenv container pressure-vessel
```

### 3.16. NOT utiliado (em comparação com Makai Time)
- `--unshare-all` → **NÃO!** Pressure-vessel NÃO usa unshare. O bwrap padrão é NÃO isolado: `--not-a-security-boundary`
- `--clearenv` → **NÃO!** Env vars do host passam para dentro
- `--cap-drop` → **NÃO!** Sem drop de capabilities
- `--seccomp` → **NÃO!** Sem filtro seccomp
- `--disable-userns` → **NÃO!**

---

## 4. ENVIRONMENT VARIABLES DENTRO DO CONTAINER

Todas as variáveis do host são herdadas (NÃO há --clearenv). As principais:

| Variável | Valor | Origem |
|----------|-------|--------|
| `container` | `pressure-vessel` | --setenv |
| `WINEPREFIX` | `/home/cas/Games/Makai-forger/gf` | UMU set_env |
| `STEAM_COMPAT_DATA_PATH` | `.../gf` | UMU set_env |
| `STEAM_COMPAT_INSTALL_PATH` | `.../Grand Fantasia Violet` | UMU set_env (exe.parent) |
| `STEAM_COMPAT_TOOL_PATHS` | `PROTONPATH:RUNTIMEPATH` | UMU set_env |
| `STEAM_COMPAT_MOUNTS` | = STEAM_COMPAT_TOOL_PATHS | UMU set_env |
| `STEAM_COMPAT_SHADER_PATH` | `.../gf/shadercache` | UMU set_env |
| `STEAM_COMPAT_LIBRARY_PATHS` | `/home` (mount point do exe.parent) | UMU enable_steam_game_drive |
| `STEAM_RUNTIME_LIBRARY_PATH` | game_dir:ldconfig_paths:host_ld_library_path | UMU enable_steam_game_drive |
| `SteamAppId` / `SteamGameId` | `0` | UMU set_env |
| `UMU_ID` | `grand-fantasia-launcher` | UMU set_env |
| `UMU_INVOCATION_ID` | `1e837c111f89b98ddce42f16fd102635` | UMU set_env (token_hex) |
| `LD_LIBRARY_PATH` | overrides/lib/x86_64-linux-gnu:overrides/lib/x86_64-linux-gnu/aliases:overrides/lib/i386-linux-gnu:overrides/lib/i386-linux-gnu/aliases | pressure-vessel |
| `PATH` | `/usr/bin:/bin` | pressure-vessel-unruntime |
| `XDG_SESSION_TYPE` | `wayland` | herdado |
| `WAYLAND_DISPLAY` | `wayland-0` | herdado |
| `DISPLAY` | `:1` | herdado |
| `VK_ICD_FILENAMES` | `/usr/lib/pressure-vessel/overrides/share/vulkan/icd.d/nvidia_icd.json` | pressure-vessel |
| `VK_DRIVER_FILES` | (mesmo) | pressure-vessel |
| `VK_IMPLICIT_LAYER_PATH` | `/usr/lib/pressure-vessel/overrides/share/vulkan/implicit_layer.d` | pressure-vessel |
| `VK_LAYER_PATH` | `/usr/lib/pressure-vessel/overrides/share/vulkan/explicit_layer.d` | pressure-vessel |
| `__EGL_VENDOR_LIBRARY_FILENAMES` | `.../10_nvidia.json:.../50_mesa.json` | pressure-vessel |
| `__EGL_EXTERNAL_PLATFORM_CONFIG_FILENAMES` | `.../09_nvidia_wayland2.json:...` | pressure-vessel |
| `GBM_BACKENDS_PATH` | overrides/lib/x86_64-linux-gnu/gbm:overrides/lib/i386-linux-gnu/gbm | pressure-vessel |
| `LIBGL_DRIVERS_PATH` | overrides/lib/x86_64-linux-gnu/dri:overrides/lib/i386-linux-gnu/dri | pressure-vessel |
| `LIBVA_DRIVERS_PATH` | (mesmo) | pressure-vessel |
| `VDPAU_DRIVER_PATH` | `/tmp/pressure-vessel-libs-XXXX/\${LIB}/vdpau` | pressure-vessel |
| `PRESSURE_VESSEL_*` | várias | pressure-vessel |
| `DXVK_STATE_CACHE` | não setado | - |
| `PROTON_USE_NTSYNC` | não setado (auto-detect do proton) | - |

---

## 5. GPU OVERRIDES (como pressure-vessel captura)

### 5.1. Mecanismo: `capsule-capture-libs`

Pressure-vessel usa `capsule-capture-libs` (binário C) que:
1. Sobe um **container auxiliar** com runtime + host /
2. Copia/Symlink APENAS as libs necessárias para `<overrides>/<arch>/lib/`
3. Os symlinks apontam para `/run/host/usr/lib/...` (Provider Mount)

### 5.2. O que foi capturado (x86_64):
```
libcuda.so.1 → /run/host/usr/lib/libcuda.so.610.43.03
libEGL_nvidia.so.0 → /run/host/usr/lib/libEGL_nvidia.so.610.43.03
libGLX_nvidia.so.0 → /run/host/usr/lib/libGLX_nvidia.so.0
libnvidia-egl-wayland.so.1 → /run/host/usr/lib/libnvidia-egl-wayland.so.610.43.03
libnvidia-egl-gbm.so.1 → /run/host/usr/lib/libnvidia-egl-gbm.so.1
libnvidia-glcore.so.610.43.03 → /run/host/usr/lib/libnvidia-glcore.so.610.43.03
libnvidia-glvkspirv.so.610.43.03 → /run/host/usr/lib/libnvidia-glvkspirv.so.610.43.03
libnvidia-rtcore.so.610.43.03 → /run/host/usr/lib/libnvidia-rtcore.so.610.43.03
libnvidia-ml.so.610.43.03 → /run/host/usr/lib/libnvidia-ml.so.610.43.03
libEGL_mesa.so.0 → /run/host/usr/lib/libEGL_mesa.so.0.0.0
libGL.so.1 → /run/host/usr/lib/libGL.so.1.7.0
libgbm.so.1 → /run/host/usr/lib/libgbm.so.1.0.0
libdrm.so.2 → /run/host/usr/lib/libdrm.so.2.134.0
libvulkan.so.1 → /run/host/usr/lib/libvulkan.so.1
libvulkan_radeon.so → (raw copy)
libvulkan_intel.so → (raw copy)
gallium-26.1.4-arch1.1.so → /run/host/usr/lib/libgallium-26.1.4-arch1.1.so
... (mais ~50 libs)
```

### 5.3. Tamanho total dos overrides: **232KB** (só symlinks + DRI drivers copiados)

---

## 6. PROCESSOS CRIADOS (árvore completa — execução REAL 17/07/2026)

```
systemd(1)
  └─ python3 umu-run(318043)
       └─ srt-bwrap(318043)
            └─ pv-adverb(318106)  ← dentro do container
                 └─ python3 proton(318140)
                      ├─ umu.exe(318149)
                      ├─ wineserver(318151)
                      ├─ winedevice.exe(318158)
                      ├─ winedevice.exe(318179)
                      ├─ xalia.exe(318222)
                      └─ Launcher.exe(318309)  ← 74.8% CPU, 275MB RAM
```

---

## 7. TIMELINE DA EXECUÇÃO

```
T+0.0s   → UMU-run inicia, network check (1.1.1.1:53)
T+0.1s   → resolve_umu_version(): lê toolmanifest.vdf → appid=1628350 → sniper
T+0.2s   → check_env(): PROTONPATH=UMU-Proton-10.0-4, WINEPREFIX ok
T+0.3s   → setup_umu(): runtime já existe, skip (lock umu.lock)
T+0.4s   → setup_pfx(): pfx/ symlink + steamuser dance
T+0.5s   → set_env(): 30+ env vars configuradas
T+0.6s   → enable_steam_game_drive(): mount point = /home, ldconfig -p coletado
T+0.7s   → build_command(): entry_point --verb waitforexitandrun -- shim proton ... Launcher.exe
T+0.8s   → prctl(PR_SET_CHILD_SUBREAPER, 1) → Popen(start_new_session=True)
T+0.9s   → _v2-entry-point exec: PRESSURE_VESSEL_APP_LD_LIBRARY_PATH extraído
T+1.0s   → run exec: PRESSURE_VESSEL_RUNTIME=sniper_platform_...
T+1.1s   → pressure-vessel-unruntime: preserva LD_PATH, limpa env
T+1.2s   → pressure-vessel-wrap: check bwrap, detect GPU
T+1.5s   → Capsule capture: VDPAU, GLX, EGL, Vulkan, DRI, VA-API
T+2.5s   → Capsule capture: Vulkan layers (Steam, MangoHud, Gamescope)
T+3.0s   → Capsule capture: DRI drivers (67 libs)
T+3.5s   → Build bwrap args (~800 flags)
T+4.0s   → srt-bwrap exec: container criado
T+4.1s   → pv-adverb: regenerate ld.so.cache (overrides + runtime)
T+4.5s   → pv-adverb: exec umu-shim
T+4.6s   → proton: init_wine(), init_session()
T+5.0s   → wineserver: starts
T+5.5s   → services.exe, winedevice.exe, etc.
T+6.0s   → umu.exe: wrapper non-Steam
T+6.5s   → Launcher.exe: STARTED (74.8% CPU, 275MB RAM)
```

---

## 7.1. Gamescope Integration (Monitor Windows Thread)
O UMU tem suporte a gamescope via Xlib, mas **só ativo para Flatpak + gamescope**:

- `run_in_steammode()` (`umu_run.py:577-619`):
  - Tenta conectar `:0` e `:1` via Xlib
  - Lê `GAMESCOPECTRL_BASELAYER_APPID` do root window `:0`
  - Se ativo: inicia thread `monitor_windows()`
  - `monitor_windows()` (`umu_run.py:541-574`):
    - Escaneia `_NET_WM_PID` nas janelas
    - Match com PID tree via `get_pstree_from_pid()`
    - Seta `STEAM_GAME` atom nas janelas do jogo
  - `_get_pstree_root_pid()` (`umu_run.py:515-538`):
    - Acha pv-adverb por `UMU_INVOCATION_ID` em `/proc/PID/environ`
    - Anda a árvore para achar todas as janelas do jogo
  - `get_steam_appid()` (`umu_run.py:488-512`):
    - Extrai Steam AppID de `STEAM_COMPAT_TRANSCODED_MEDIA_PATH`, `STEAM_COMPAT_MEDIA_PATH`, `STEAM_FOSSILIZE_DUMP_PATH`, `DXVK_STATE_CACHE_PATH`
    - Fallback: `UMU_STEAM_GAME_ID >> 32`

---

## 8. CÓDIGO-FONTE: Funções Python do UMU (lição completa)

### 8.1. `umu_run.py` (910 linhas) — Core do UMU

| Função | Linhas | O que faz |
|--------|--------|-----------|
| `setup_pfx()` | 59-88 | Cria pfx/ symlink, steamuser dance, tracked_files |
| `check_env()` | 91-153 | Valida GAMEID, WINEPREFIX, PROTONPATH; auto-cria prefixo |
| `set_env()` | 156-254 | Seta 30+ env vars (STEAM_COMPAT_*, UMU_*, PROTON_VERB, etc.) |
| `enable_steam_game_drive()` | 257-285 | Detecta mount points, coleta ldconfig paths |
| `build_command()` | 288-349 | 4 code paths: default, winetricks, no_proton, no_runtime |
| `get_pstree_from_pid()` | 356-381 | /proc walking para achar descendentes |
| `get_window_ids()` | 384-392 | Lista window IDs via Xlib |
| `get_pstree_window_ids()` | 395-433 | Match window IDs com PID tree via _NET_WM_PID |
| `set_steam_game_property()` | 436-463 | Seta STEAM_GAME atom para gamescope |
| `get_gamescope_baselayer_appid()` | 466-485 | Lê GAMESCOPECTRL_BASELAYER_APPID |
| `get_steam_appid()` | 488-512 | Extrai Steam AppID de env var paths |
| `_get_pstree_root_pid()` | 515-538 | Acha pv-adverb por UMU_INVOCATION_ID |
| `monitor_windows()` | 541-574 | Thread de monitoramento de janelas |
| `run_in_steammode()` | 577-619 | Gamescope mode (só Flatpak) |
| `run_command()` | 622-669 | prctl + Popen + wait |
| `resolve_umu_version()` | 672-707 | Lê toolmanifest.vdf → runtime appid |
| `get_umu_version_from_manifest()` | 710-732 | Parse VDF: "require_tool_appid" "XXXX" |
| `umu_run()` | 735-910 | **Main**: network check → check_env → setup_umu → setup_pfx → set_env → build_command → run_command |

### 8.2. `umu_runtime.py` (426 linhas) — Download/Update do Runtime Steam

| Função | Linhas | O que faz |
|--------|--------|-----------|
| `create_shim()` | 34-61 | Cria umu-shim (script shell DISPLAY=:1) |
| `_install_umu()` | 64-230 | Download + SHA256 + resume + extract + exchange + pv-verify |
| `setup_umu()` | 232-256 | New install ou update check |
| `_update_umu()` | 259-337 | Verifica VERSIONS.txt, restaura se corrompido |
| `check_runtime()` | 340-382 | pv-verify mtree validation |
| `_restore_umu()` | 385-399 | Restore com file lock |
| `_update_umu_platform()` | 402-426 | Update com file lock |

### 8.3. `umu_proton.py` (647 linhas) — Download/Update do Proton

| Função | Linhas | O que faz |
|--------|--------|-----------|
| `get_umu_proton()` | 55-96 | Orquestra: fetch → delta → latest → compat fallback |
| `_fetch_patch()` | 99-141 | GitHub API → CBOR patch (delta update) |
| `_fetch_releases()` | 144-194 | GitHub API → release assets (UMU-Proton ou GE-Proton) |
| `_fetch_proton()` | 197-318 | Download SHA512 + resume + cache |
| `_get_from_compat()` | 321-351 | Fallback para Proton existente |
| `_get_latest()` | 354-434 | Download + install do latest Proton |
| `_install_proton()` | 437-491 | Extract tar.gz + move para compatibilitytools.d |
| `_get_delta()` | 493-612 | **Delta update com verificação criptográfica** (CBOR + assinatura) |
| `_apply_delta()` | 615-647 | Aplica binary patch (bspatch) |

### 8.4. `umu_consts.py` (232 linhas) — Constantes

| Constante | Valor | Uso |
|-----------|-------|-----|
| `GamescopeAtom.SteamGame` | `"STEAM_GAME"` | Atom X11 para gamescope |
| `GamescopeAtom.BaselayerAppId` | `"GAMESCOPECTRL_BASELAYER_APPID"` | Atom X11 para baselayer |
| `FileLock.Runtime` | `"umu.lock"` | Lock de runtime |
| `FileLock.Compat` | `"compatibilitytools.d.lock"` | Lock de Proton |
| `FileLock.Prefix` | `"pfx.lock"` | Lock de prefixo |
| `PR_SET_CHILD_SUBREAPER` | `36` | prctl() para gerenciar orphans |
| `TMPFS_MIN` | `1073741824` (1GB) | Tamanho mínimo de tmpfs |
| `UMU_LOCAL` | `$XDG_DATA_HOME/umu` | Diretório do runtime |
| `UMU_CACHE` | `$XDG_CACHE_HOME/umu` | Cache de downloads |
| `STEAM_COMPAT` | `$XDG_DATA_HOME/Steam/compatibilitytools.d` | Proton dir |

### 8.5. `umu_util.py` (460 linhas) — Utilitários

| Função | Linhas | O que faz |
|--------|--------|-----------|
| `unix_flock()` | 44-57 | flock(2) LOCK_EX/LOCK_UN |
| `memfdfile()` | 60-73 | Cria memfd anônimo (para /etc/passwd sintético) |
| `get_libc()` | 75-78 | find_library("c") |
| `get_library_paths()` | 81-123 | Roda `ldconfig -p` e extrai paths |
| `run_zenity()` | 126-178 | Progress popup |
| `is_installed_verb()` | 181-213 | Checa winetricks.log |
| `write_file_chunks()` | 249-280 | Download streaming com hash |
| `get_tempdir()` | 312-333 | Detecta tmpfs, fallback para cache |
| `extract_tarfile()` | 336-365 | Extração segura com tar_filter |
| `has_umu_setup()` | 368-372 | Checa se runtime existe |
| `file_digest()` | 379-418 | Hashing de arquivo |
| `exchange()` | 458-460 | renameat2(RENAME_EXCHANGE) atômico |
| `xdisplay()` | 236-247 | Context manager Xlib Display |

---

## 9. DIFERENÇAS CRÍTICAS: UMU/pressure-vessel vs Makai Time

### 9.1. Segurança (ISOLAMENTO)

| Aspecto | UMU/pressure-vessel | Makai Time | Impacto |
|---------|-------------------|------------|---------|
| **Namespace isolation** | `--not-a-security-boundary` (NENHUM) | `--unshare-user --unshare-all` | Makai Time é MAIS seguro |
| **User namespace** | NÃO (bwrap sem --unshare-user) | SIM | MT isola |
| **PID namespace** | NÃO | SIM | MT isola |
| **Network** | NÃO isolado | `--share-net` | Ambos compartilham |
| **clearenv** | NÃO (env do host passa) | SIM (`--clearenv`) | MT limpa, UMU não |
| **cap-drop ALL** | NÃO | SIM | MT mais seguro |
| **seccomp** | NÃO | SIM (core/seccomp.py) | MT bloqueia syscalls |
| **`--disable-userns`** | NÃO | SIM | MT seguro |

**Conclusão:** Makai Time é MUITO MAIS restritivo em segurança que o pressure-vessel. O pressure-vessel é um container "leve" sem isolamento real.

### 9.2. GPU Overrides (Provider Mount)

| Aspecto | UMU/pressure-vessel | Makai Time |
|---------|-------------------|------------|
| **Provider mount** | `--ro-bind / /run/host` | ✅ `--ro-bind / /run/host` |
| **Override mechanism** | Symlinks → `/run/host/usr/lib/...` | ✅ Symlinks → `/run/host/usr/lib/...` |
| **Tool** | `capsule-capture-libs` (C) | `capture.py` + `detect.py` (Python) |
| **Overrides location** | `<runtime>/var/tmp-XXX/usr/lib/pressure-vessel/overrides/` | `<prefix>/overrides/<arch>/lib/` |
| **Overrides size** | 232KB (só symlinks) | ~300MB (raw copies) |
| **i386 support** | ✅ Completo | ✅ Completo |

**⚠️ Makai Time copia libs em vez de symlink → 300MB vs 232KB!**

### 9.3. LD_LIBRARY_PATH

| Aspecto | UMU/pressure-vessel | Makai Time |
|---------|-------------------|------------|
| **Quem constrói** | `_v2-entry-point` extrai do host, `pv-adverb` regenera | `ldso.py` constrói |
| **Dentro do container** | `overrides/lib/x86_64-linux-gnu:overrides/lib/x86_64-linux-gnu/aliases:overrides/lib/i386-linux-gnu:overrides/lib/i386-linux-gnu/aliases` | NÃO SETADO (--clearenv limpa) |
| **Proton modifica?** | Sim, prepends files/lib/x86_64-linux-gnu | Sim, mas LD_LIBRARY_PATH vazio |
| **Runtime libs** | Via ld.so.cache regenerado | Via ld.so.cache regenerado |

**⚠️ CORREÇÃO NO MAKAI TIME NECESSÁRIA:** Precisamos setar `LD_LIBRARY_PATH` no `--setenv` do bwrap com:
```
overrides/<arch>/lib:runtime/files/lib/<arch>:host/usr/lib
```

### 9.4. /tmp

| Aspecto | UMU/pressure-vessel | Makai Time |
|---------|-------------------|------------|
| /tmp | `--bind /tmp /tmp` (host bind) | `--tmpfs /tmp` |
| **Efeito** | Wine cria sockets em /tmp real | Wine cria em tmpfs isolada |

Makai Time com `--tmpfs /tmp` é melhor para isolamento, mas o wineserver precisa de /tmp escrevível.

### 9.5. Env vars passadas para Proton

| Variável | UMU | Makai Time | Correto? |
|----------|-----|------------|----------|
| `WINEPREFIX` | `<path>` (proton sobrescreve para `<path>/pfx/`) | `<path>` | ✅ Ambos ok |
| `STEAM_COMPAT_DATA_PATH` | = WINEPREFIX | NÃO SETADO | ❌ MT ausente |
| `STEAM_COMPAT_INSTALL_PATH` | = exe.parent | `/home` (ERRADO) | ❌ MT errado |
| `STEAM_COMPAT_TOOL_PATHS` | PROTONPATH:RUNTIMEPATH | NÃO SETADO | ❌ MT ausente |
| `STEAM_COMPAT_MOUNTS` | = TOOL_PATHS | NÃO SETADO | ❌ MT ausente |
| `STEAM_COMPAT_SHADER_PATH` | WINEPREFIX/shadercache | NÃO SETADO | ❌ MT ausente |
| `STEAM_COMPAT_LIBRARY_PATHS` | mount point do exe.parent | NÃO SETADO | ❌ MT ausente |
| `STEAM_COMPAT_CLIENT_INSTALL_PATH` | ~/.local/share/Steam | ~/.local/share/Steam | ✅ |
| `STEAM_RUNTIME_LIBRARY_PATH` | game_dir:ldconfig_paths:host_ld_path | NÃO SETADO | ❌ MT ausente |
| `UMU_INVOCATION_ID` | token_hex(16) | NÃO SETADO | ❌ MT ausente |
| `SteamAppId` / `SteamGameId` | `0` | NÃO SETADO | ❌ MT ausente |
| `LD_LIBRARY_PATH` | overrides + aliases | NÃO SETADO | ❌ MT ERRO CRÍTICO |
| `VK_ICD_FILENAMES` | /overrides/share/...nvidia_icd.json | /overrides/share/... | ✅ |
| `__EGL_VENDOR_LIBRARY_FILENAMES` | overrides/...10_nvidia:50_mesa | NÃO SETADO | ❌ MT ausente |
| `GBM_BACKENDS_PATH` | overrides/lib/.../gbm | NÃO SETADO | ❌ MT ausente |
| `LIBGL_DRIVERS_PATH` | overrides/lib/.../dri | NÃO SETADO | ❌ MT ausente |
| `LIBVA_DRIVERS_PATH` | overrides/lib/.../dri | NÃO SETADO | ❌ MT ausente |
| `container` | `pressure-vessel` | `makai` | ✅ (só muda o nome) |

---

## 10. CONCLUSÃO

### Funcionou? ✅ SIM

O UMU-Launcher + pressure-vessel executou o Launcher.exe com sucesso:
- Container criado com srt-bwrap
- GPU overrides montados (NVIDIA, 232KB)
- ld.so.cache regenerado
- Proton (wine-10.0) iniciou
- Launcher.exe rodando com 74.8% CPU, 275MB RAM

### Por que o UMU funciona sem --clearenv?

O UMU **herda TODAS as env vars do host** (nada é limpo). O Proton script então faz:
1. `init_wine()` → **prepends** `files/lib/x86_64-linux-gnu:` em `LD_LIBRARY_PATH`
2. `init_session()` → seta `WINEPREFIX`, `WINEDLLOVERRIDES`, etc.
3. Como as libs NVIDIA/GPU estão no **ld.so.cache regenerado** (overrides primeiro), o linker acha elas mesmo com `LD_LIBRARY_PATH` só apontando para overrides/aliases

### Makai Time é placebo? **NÃO, mas tem problemas**

**O que Makai Time faz MELHOR que UMU:**
1. **Segurança** → `--unshare-all`, `--cap-drop ALL`, `--seccomp`, `--disable-userns`
2. **Isolamento** → PID namespace, tmpfs para /tmp
3. **Container-aware** → `container=makai`, env vars MAKAI_*

**O que Makai Time faz PIOR que UMU:**
1. **LD_LIBRARY_PATH NÃO SETADO** → `--clearenv` limpa mas não repõe. O proton precisa de LD_LIBRARY_PATH para achar libs (CRÍTICO)
2. **GPU overrides copiados vs symlinks** → 300MB vs 232KB
3. **STEAM_COMPAT_INSTALL_PATH = /home** → deveria ser exe.parent
4. **Faltam env vars**: `__EGL_VENDOR_LIBRARY_FILENAMES`, `GBM_BACKENDS_PATH`, `LIBGL_DRIVERS_PATH`, `LIBVA_DRIVERS_PATH`, `STEAM_COMPAT_*` (DATA_PATH, TOOL_PATHS, MOUNTS, SHADER_PATH, LIBRARY_PATHS, RUNTIME_LIBRARY_PATH)
5. **Faltam `SteamAppId`/`SteamGameId`** → Proton pode precisar

### Prioridade de correção no Makai Time:

1. **🥇 CRÍTICO**: Setar `LD_LIBRARY_PATH` no `--setenv` do bwrap com overrides + runtime + host
2. **🥇 CRÍTICO**: Corrigir `STEAM_COMPAT_INSTALL_PATH` para exe.parent
3. **🥇 CRÍTICO**: Adicionar TODAS as env vars STEAM_COMPAT_* que o Proton espera
4. **🥈 ALTO**: Adicionar env vars de GPU: `__EGL_VENDOR_*`, `GBM_BACKENDS_PATH`, `LIBGL_DRIVERS_PATH`, `LIBVA_DRIVERS_PATH`
5. **🥈 ALTO**: Mudar overrides de cópia para symlink (+ Provider Mount, já implementado)
6. **🥈 ALTO**: Adicionar `SteamAppId`/`SteamGameId` = `0`
7. **🥉 MÉDIO**: Adicionar env vars de overrides: `VDPAU_DRIVER_PATH` dinâmico
8. **🥉 MÉDIO**: Adicionar `STEAM_RUNTIME_LIBRARY_PATH` com game_dir + ldconfig paths
9. **🥉 MÉDIO**: Implementar `enable_steam_game_drive()` (mount point walking)
10. **🥉 MÉDIO**: Testar com `--not-a-security-boundary` (desativar proteções) para debug
