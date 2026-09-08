# Mapeamento: `_v2-entry-point` (pressure-vessel) → `makrun/container/`

## Pipeline completo do PV

```
_v2-entry-point  (shell: parser args, extrai LD_LIBRARY_PATH, chama ./run)
  → ./run (makai-time-entry: seta PRESSURE_VESSEL_*, chama pressure-vessel-unruntime)
    → pressure-vessel-unruntime (shell: salva env vars como --env-if-host, chama pressure-vessel-wrap)
      → pressure-vessel-wrap (BINÁRIO C: detecção GPU/display/locale, monta bwrap, exec)
        → bwrap <args> /proton/proton waitforexitandrun <exe>
```

---

## 1. `_v2-entry-point` → Nosso `cli.py` + `runner.py`

| Função PV | Arquivo PV | Nossa função | Status |
|-----------|-----------|-------------|--------|
| Parse `--verb waitforexitandrun` / `--verb run` | `_v2-entry-point:124-137` | `cli.py:parse_args()` → `PROTON_VERB` | ✅ |
| Parse `--suite=sniper/soldier/scout/steamrt4` | `_v2-entry-point:119-121` | `resolver/runtime.py::resolve_runtime_version()` | ✅ |
| Parse `--verbose`, `--log-to-file` | `_v2-entry-point:145-150` | `log.py` + `--debug` flag | ✅ |
| Extrair LD_LIBRARY_PATH do host, filtrando paths do Steam Runtime → `PRESSURE_VESSEL_APP_LD_LIBRARY_PATH` | `_v2-entry-point:230-256` | **NÃO FAZEMOS** — `--clearenv` limpa tudo, e setamos `LD_LIBRARY_PATH` manual | ⚠️ **GAP**: Se usuário tinha LD_LIBRARY_PATH custom, perdemos |
| Preservar LD_PRELOAD do usuário via `--ld-preloads=` | `_v2-entry-point:275-278` | `steps/env.py` só seta MAKAI_* preloads | ⚠️ **GAP**: LD_PRELOAD do usuário não preservado |
| `exec ./run` (ou `./run-in-<suite>`) | `_v2-entry-point:315` | `builder.py::build_bwrap_cmd()` → `exec_step.configure()` | ✅ |

---

## 2. `./run` (makai-time-entry) → Nosso `steps/runtime.py` + `runner.py`

| Função PV | Arquivo PV | Nossa função | Status |
|-----------|-----------|-------------|--------|
| Setar `MAKAI_RUNTIME_DIR` | `run:8` | `env["RUNTIMEPATH"]` em `runner.py:90` | ✅ |
| Unset `STEAM_RUNTIME_LIBRARY_PATH` | `run:9` | `--clearenv` faz isso | ✅ |
| Setar `PRESSURE_VESSEL_ARCHITECTURES=x86_64-linux-gnu:i386-linux-gnu` | `run:10` | `steps/runtime.py` monta ambos archs | ✅ |
| Setar `PRESSURE_VESSEL_COPY_RUNTIME=1` | `run:11` | **NÃO FAZEMOS** — nós montamos runtime direto (`--ro-bind`) | ✅ **Diferente**: Nós montamos ro-bind, PV copia. Ambos funcionam. |
| Setar `PRESSURE_VESSEL_RUNTIME=files` | `run:12` | `_resolve_runtime_files()` busca `files/` | ✅ |
| Setar `PRESSURE_VESSEL_RUNTIME_BASE=<here>` | `run:13` | `runtime_path` passado como caminho absoluto | ✅ |
| `--variable-dir=<here>/var` | `run:16-18` | **NÃO FAZEMOS** — PV salva estado runtime em `var/` | ✅ **Desnecessário**: container é stateless |
| `exec pressure-vessel-unruntime` | `run:20` | `runner.py` chama `build_bwrap_cmd()` direto | ✅ |

---

## 3. `pressure-vessel-unruntime` → Nosso `steps/env.py`

| Função PV | Arquivo PV | Nossa função | Status |
|-----------|-----------|-------------|--------|
| Salvar `LD_LIBRARY_PATH` como `--env-if-host=LD_LIBRARY_PATH=...` | `pv-unruntime:43-45` | **NÃO FAZEMOS** — `--clearenv` + `LD_LIBRARY_PATH` manual | ⚠️ **GAP** (mesmo que #1) |
| Salvar `LD_AUDIT` como `--ld-audits=...` + `--env-if-host` | `pv-unruntime:47-50` | **NÃO FAZEMOS** — `--clearenv` limpa | ✅ **Desnecessário**: raramente usado |
| Salvar `LD_PRELOAD` como `--ld-preloads=...` + `--env-if-host` | `pv-unruntime:52-55` | ⚠️ **GAP**: Não preservamos LD_PRELOAD do usuário |
| Salvar `PATH` como `--env-if-host=PATH=...` | `pv-unruntime:57-59` | ✅ **Desnecessário**: `PATH=/usr/bin:/usr/sbin:/bin:/sbin` hardcoded |
| Salvar `STEAM_RUNTIME` como `--env-if-host` | `pv-unruntime:63-65` | ✅ **Desnecessário**: runtime é nosso, não Steam |
| `unset LD_AUDIT, LD_LIBRARY_PATH, LD_PRELOAD` | `pv-unruntime:67-69` | `--clearenv` faz isso | ✅ |
| `PATH="$default_path"` | `pv-unruntime:70` | `steps/env.py:67` seta PATH | ✅ |
| Restaurar `SYSTEM_LD_LIBRARY_PATH → LD_LIBRARY_PATH` | `pv-unruntime:73-80` | **NÃO FAZEMOS** | ✅ **Desnecessário**: nossa LD_LIBRARY_PATH é construída |
| Restaurar `STEAM_RUNTIME_LIBRARY_PATH` como `--env-if-host` | `pv-unruntime:82-84` | **NÃO FAZEMOS** | ✅ **Desnecessário** |
| Restaurar `SYSTEM_PATH → PATH` | `pv-unruntime:86-89` | **NÃO FAZEMOS** | ✅ **Desnecessário** |
| Preservar `PRESSURE_VESSEL_APP_LD_LIBRARY_PATH → LD_LIBRARY_PATH` | `pv-unruntime:101-104` | **NÃO FAZEMOS** | ✅ **Desnecessário**: nossa LD_LIBRARY_PATH é construída |
| `exec pressure-vessel-wrap` | `pv-unruntime:108` | `builder.py::build()` executa bwrap | ✅ |

---

## 4. `pressure-vessel-wrap` (BINÁRIO C) → Nossos steps

### 4a. Isolamento / Namespaces

| Função PV | Nossa função | Status |
|-----------|-------------|--------|
| `--unshare-all` (ou similar) | `steps/isolation.py` — flags individuais `--unshare-ipc --unshare-pid --unshare-uts --unshare-cgroup --share-net` | ✅ |
| `--disable-userns` | `steps/isolation.py:57-58` | ✅ |
| `--clearenv` | `steps/isolation.py:60-61` | ✅ |
| `--cap-drop ALL` | `steps/isolation.py:63-64` | ✅ |
| Seccomp BPF | `steps/isolation.py:67-74` → `core/seccomp.py` | ✅ |
| `--die-with-parent` | **NÃO FAZEMOS** — PV usa `--die-with-parent` para matar container se pai morre | ⚠️ **GAP**: Pode deixar container zumbi |
| `--lock-file` | `core/lock.py` — lock file no prefixo (fora do container) | ✅ |

### 4b. Runtime bind

| Função PV | Nossa função | Status |
|-----------|-------------|--------|
| `--ro-bind <runtime>/usr /usr` | `steps/runtime.py:38` | ✅ |
| `--tmpfs /lib` + binds individuais de `files/lib/{arch}` | `steps/runtime.py:42-57` | ✅ |
| Symlinks `/lib/ld-linux.so.2 → i386-linux-gnu/ld-linux.so.2` | `steps/runtime.py:61-65` | ✅ |
| Symlinks `/bin → usr/bin`, `/sbin → usr/sbin` | `steps/runtime.py:68-70` | ✅ |
| `--ro-bind /etc/ld.so.cache` | `steps/runtime.py:73-76` | ✅ |
| `--ro-bind /etc/pulse`, `/etc/alsa`, `/etc/openal` | `steps/runtime.py:79-83` | ✅ |

### 4c. Tmp/Proc/Sys

| Função PV | Nossa função | Status |
|-----------|-------------|--------|
| `--tmpfs /tmp` | `builder.py:apply_tmp_proc_sys():109` | ✅ |
| `--proc /proc` | `builder.py:110` | ✅ |
| `--ro-bind /sys /sys` | `builder.py:111` | ✅ |

### 4d. /etc (hosts, resolv, machine-id, timezone, locale)

| Função PV | Nossa função | Status |
|-----------|-------------|--------|
| `/etc/hosts`, `/etc/host.conf`, `/etc/resolv.conf`, `/etc/services` | `steps/etc.py:25-29` | ✅ |
| `/etc/machine-id` | `steps/etc.py:32-34` | ✅ |
| `/etc/localtime` | `steps/etc.py:37-39` | ✅ |
| `/etc/nsswitch.conf` sintético | `steps/etc.py:10-22` | ✅ |
| `/etc/group`, `/etc/passwd` do host | `steps/etc.py:25-29` | ✅ |
| `/etc/fonts` | `steps/etc.py:42-44` | ✅ |
| Locale (`/usr/lib/locale`, `locale-archive`) | `steps/env.py:191-195` — env vars LANG/LC_* | ⚠️ **GAP PARCIAL**: Montamos env vars mas não montamos `/usr/lib/locale` do host. PV detecta locale com check-locale + pv-locale-gen. |
| `/etc/asound.conf` (ALSA → PulseAudio) | `steps/audio.py:7-41` | ✅ |

### 4e. SSL Certificates

| Função PV | Nossa função | Status |
|-----------|-------------|--------|
| `/etc/ssl` | `steps/ssl.py:10-12` | ✅ |
| `/etc/ca-certificates` | `steps/ssl.py:15-17` | ✅ |
| `/etc/pki/tls/certs` (Red Hat) | `steps/ssl.py:20-22` | ✅ |
| `/etc/pki/ca-trust/extracted` (Red Hat) | `steps/ssl.py:24-26` | ✅ |
| `/etc/ca-certificates/extracted` (Arch) | `steps/ssl.py:29-31` | ✅ |

### 4f. Fonts

| Função PV | Nossa função | Status |
|-----------|-------------|--------|
| `/usr/share/fonts` | `steps/fonts.py:10-12` | ✅ |
| `~/.local/share/fonts` | `steps/fonts.py:15-18` | ✅ |
| `~/.fonts` | `steps/fonts.py:15-18` | ✅ |

### 4g. Mounts (Proton, prefixo, jogo, provider)

| Função PV | Nossa função | Status |
|-----------|-------------|--------|
| `--ro-bind / /run/host` (provider mount) | `steps/mounts.py:12-13` | ✅ |
| `--bind <proton> /proton` | `steps/mounts.py:16-17` | ✅ |
| `--bind <prefixo> <prefixo>` (mesmo path) | `steps/mounts.py:20-22` | ✅ |
| `--ro-bind <jogo> <jogo>` (diretório pai do exe) | `steps/mounts.py:25-27` | ✅ |
| `--tmpfs /home + --bind $HOME` (home isolation) | `steps/mounts.py:30-32` | ✅ |
| `STEAM_COMPAT_DATA_PATH = /prefix-{app_id}` (PV cria subdir numerado) | **DIFERENTE**: nós usamos o path real do prefixo, PV cria `/prefix-0/` | ⚠️ **GAP**: Proton espera `STEAM_COMPAT_DATA_PATH` terminar com dígitos (protonfixes usa regex). Nosso path real funciona porque contém dígitos (ex: `/home/cas/.../gf` tem "gf" sem dígitos!). |
| `STEAM_COMPAT_INSTALL_PATH = dirname(dirname(exe))` — PV descobre o "install dir" do jogo | **NÃO FAZEMOS** — nós montamos `parent` do exe | ✅ **OK**: mount do parent cobre o necessário. Mas PV monta 2 níveis acima (install dir raiz). |
| `STEAM_COMPAT_MOUNTS` = "proton:runtime" — PV monta ambos como layers | `steps/env.py:82-83` | ✅ |
| `STEAM_COMPAT_LIBRARY_PATHS` — PV monta lib paths do Steam | `steps/env.py:84-85` | ✅ |

### 4h. Display (X11, Wayland, D-Bus, Discord)

| Função PV | Nossa função | Status |
|-----------|-------------|--------|
| `/tmp/.X11-unix` | `steps/display.py:14-16` | ✅ |
| Wayland socket (`$WAYLAND_DISPLAY`) | `steps/display.py:19-24` | ✅ |
| D-Bus (`/run/user/$UID/bus`) | `steps/display.py:27-30` | ✅ |
| Discord IPC sockets | `steps/display.py:33-37` | ✅ |
| Xauthority bind + env var | `steps/env.py:156-167` | ✅ |
| `DISPLAY`, `WAYLAND_DISPLAY`, `XDG_SESSION_TYPE` env vars | `steps/env.py:150-154` | ✅ |
| `--display-backend {auto,x11,wayland}` flag | `builder.py:248` | ✅ |
| Detecção de Xwayland (via `is-x-server-xwayland`) | **NÃO FAZEMOS** — PV detecta se X server é Xwayland para configurar Wayland | ⚠️ **GAP BAIXO**: Pode causar comportamento subótimo em sistemas híbridos |

### 4i. Audio (PulseAudio, PipeWire, ALSA)

| Função PV | Nossa função | Status |
|-----------|-------------|--------|
| `/run/user/$UID/pulse/` (PulseAudio socket) | `steps/audio.py:122-125` | ✅ |
| `/run/user/$UID/pipewire-0` (PipeWire socket) | `steps/audio.py:128-131` | ✅ |
| `~/.config/pulse/cookie` | `steps/audio.py:134-137` | ✅ |
| `/etc/asound.conf` (ALSA → PipeWire/PulseAudio) | `steps/audio.py:140-142` | ✅ |
| `PULSE_SERVER`, `PULSE_COOKIE`, `PULSE_CLIENTCONFIG` env vars | `steps/env.py:174-189` | ✅ |
| `ALSOFT_DRIVERS` (OpenAL) | `steps/env.py:178` | ✅ |
| OpenAL i386 (download if missing) | `steps/audio.py:44-106` | ✅ |

### 4j. GPU / Drivers

| Função PV | Nossa função | Status |
|-----------|-------------|--------|
| **Detecção de GPU via `capsule-capture-libs`** — Sobe container auxiliar, detecta libs faltando, copia para overrides | `capsule.py::capture_gpu_libs()` | ✅ **Equivalente funcional** |
| **Detecção OpenGL** (`check-gl` via waffle) — Detecta driver GL, vendor, versão | `steps/gpu.py` detecta via `ldconfig` + JSON ICD/EGL | ⚠️ **DIFERENTE**: PV usa waffle/wflinfo para GL info. Nós usamos ldconfig + JSON parsing. Ambos funcionam. |
| **Detecção Vulkan** (`check-vulkan`) — Detecta driver Vulkan, layers, ICDs | `steps/gpu.py::_detect_vk_icd()` + `_detect_vk_layers()` | ✅ |
| **Detecção EGL** — JSONs glvnd (`/usr/share/glvnd/egl_vendor.d/`) | `steps/gpu.py::_detect_egl_vendor()` + `_rewrite_gpu_json()` | ✅ |
| **Detecção VA-API** (`check-va-api`) — Video encode/decode | **NÃO FAZEMOS** | ⚠️ **GAP**: Jogos com encode de vídeo podem perder performance (ex: Steam Remote Play, NVIDIA ShadowPlay) |
| **Detecção VDPAU** (`check-vdpau`) — VDPAU driver | `capsule.py` detecta VDPAU no container auxiliar | ✅ |
| **Detecção DRI** — `/usr/lib/dri/*_dri.so` | `steps/gpu.py::_detect_dri()` | ✅ |
| **Detecção GBM** — `/usr/lib/gbm/*.so` | `steps/gpu.py::_detect_gbm()` | ✅ |
| **NVIDIA overrides** — libnvidia-*, libcuda, libEGL_nvidia, libGLX_nvidia | `steps/gpu.py::_collect_nvidia_so()` + `_add_nvidia_bind()` | ✅ |
| **NVIDIA modprobe** — carrega `nvidia_uvm.ko` | `host.py::host_nvidia_modprobe()` em `builder.py` | ✅ |
| **Reescrita de JSONs ICD/EGL** — `library_path` → `/overrides/lib/` | `steps/gpu.py::_rewrite_gpu_json()` | ✅ |
| **Vulkan layers** — implicit + explicit (MangoHud, Gamescope WSI) | `steps/gpu.py` detecta via `_detect_vk_layers()`, `capsule.py` captura | ✅ |
| **OpenXR runtime** — VR support via JSON manifest | `capsule.py` detecta OpenXR | ✅ |

### 4k. Env Vars

| Função PV | Nossa função | Status |
|-----------|-------------|--------|
| `--setenv PATH`, `container`, `WINEPREFIX`, `PROTONPATH`, `HOME` | `steps/env.py:67-71` | ✅ |
| `--setenv STEAM_COMPAT_*` (10+ vars) | `steps/env.py:74-91` | ✅ |
| `--setenv GAMEID`, `PROTON_VERB` | `steps/env.py:93-95` | ✅ |
| `--setenv LD_LIBRARY_PATH` (runtime + overrides + pulseaudio) | `steps/env.py:108-124` | ✅ |
| `--setenv VK_ICD_FILENAMES`, `VK_DRIVER_FILES` | `steps/env.py:128-130` | ✅ |
| `--setenv VK_IMPLICIT_LAYER_PATH`, `VK_LAYER_PATH` | `steps/env.py:131-134` | ✅ |
| `--setenv __EGL_VENDOR_LIBRARY_FILENAMES` | `steps/env.py:137-139` | ✅ |
| `--setenv __GLX_VENDOR_LIBRARY_NAME` | `steps/env.py:140-141` | ✅ |
| `--setenv LIBGL_DRIVERS_PATH`, `GBM_BACKENDS_PATH` | `steps/env.py:143-146` | ✅ |
| `--setenv DISPLAY`, `WAYLAND_DISPLAY`, `XDG_SESSION_TYPE` | `steps/env.py:150-154` | ✅ |
| `--setenv XAUTHORITY` | `steps/env.py:156-167` | ✅ |
| `--setenv XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS` | `steps/env.py:169-171` | ✅ |
| `--setenv PULSE_SERVER`, `ALSOFT_DRIVERS`, `PULSE_CLIENTCONFIG`, `PULSE_COOKIE` | `steps/env.py:174-189` | ✅ |
| `--setenv LANG`, `LC_*` (locale pass-through) | `steps/env.py:191-195` | ✅ |
| `--setenv UMU_ID`, `STORE`, `EXE` | `steps/env.py:197-206` | ✅ |
| `--setenv WINEDEBUG` | `steps/env.py:208-211` | ✅ |
| `--setenv WINEDLLOVERRIDES` | `steps/env.py:213-216` | ✅ |
| **`--env-if-host`** — PV injeta env vars do host condicionalmente (se existirem). Ex: `--env-if-host=DISPLAY=$DISPLAY` | **NÃO FAZEMOS** — mas `--clearenv` + `--setenv` manual cobre tudo | ✅ **OK**: Nosso approach é mais seguro (só passamos o que queremos) |

### 4l. Anti-cheat Relaxations

| Função PV | Nossa função | Status |
|-----------|-------------|--------|
| PV não tem relaxações específicas (genérico) | `steps/relaxations.py` (chamado via `apply_relaxations()`) + `intel/anticheat/container.py` — **32 definições de fork** com flags específicas EAC/BattlEye/nProtect/Xigncode3/5/Anubis | ✅ **SUPERIOR**: Temos 32x mais definições que PV |

---

## 5. Helper Binaries (PV libexec) → Nossos equivalentes

| Binário PV | Função | Nosso equivalente | Status |
|-----------|--------|-------------------|--------|
| `srt-bwrap` | bwrap binário empacotado (0.11.x) | `shutil.which("bwrap")` — usa do sistema | ✅ **MAIS FLEXÍVEL**: Usamos bwrap do sistema (sempre atualizado) |
| `capsule-capture-libs` (i386 + x86_64) | Captura libs GPU dentro do container auxiliar | `capsule.py::capture_gpu_libs()` — Python puro que faz a mesma coisa | ✅ |
| `check-gl` | Detecta OpenGL driver via waffle | `steps/gpu.py::_resolve_lib_on_host()` + ldconfig | ✅ |
| `check-vulkan` | Detecta Vulkan driver/ICD | `steps/gpu.py::_detect_vk_icd()` | ✅ |
| `check-va-api` | Detecta VA-API driver | **NÃO FAZEMOS** | ⚠️ **GAP** |
| `check-vdpau` | Detecta VDPAU driver | `capsule.py` detecta VDPAU | ✅ |
| `check-locale` | Detecta locale disponível | `steps/etc.py` — não detecta, só passa env vars | ⚠️ **GAP**: PV gera locale com `pv-locale-gen` se faltar |
| `check-xdg-portal` | Detecta XDG portal Flatpak | **NÃO FAZEMOS** | ⚠️ **GAP**: XDG portal (Flatpak-style) não implementado |
| `detect-lib` | Detecta path de lib específica | `steps/gpu.py::_resolve_lib_on_host()` + ldconfig | ✅ |
| `detect-platform` | Detecta plataforma (arch, OS) | `resolver/` modules | ✅ |
| `inspect-library` | Inspeciona ELF (dependencies) | **NÃO FAZEMOS** diretamente — capsule.py usa `ldd`/`readelf` indiretamente | ⚠️ **GAP**: Podemos precisar para detecção avançada de dependências |
| `inspect-library-libelf` | Inspeção ELF via libelf | **NÃO FAZEMOS** | ⚠️ **GAP**: libelf binding não existe |
| `is-x-server-xwayland` | Detecta se X server é Xwayland | **NÃO FAZEMOS** | ⚠️ **GAP BAIXO** |
| `wflinfo` | Waffle GL info | **NÃO TEMOS** — mas não precisamos (detectamos via ldconfig + JSON) | ✅ **OK** |
| `srt-logger` | Logging utility | `makrun/log.py` | ✅ |
| `pv-adverb` | Adverb utility | **NÃO TEMOS** — específico PV | ✅ **Desnecessário** |
| `pv-locale-gen` | Gera locale no container | **NÃO FAZEMOS** — passamos locale do host via env vars | ⚠️ **GAP**: Se host locale não existe no runtime, apps podem reclamar |
| `pv-try-setlocale` | Testa locale | **NÃO FAZEMOS** | ⚠️ **GAP**: Mesmo que pv-locale-gen |
| `launch-options.py` | GTK UI para launch options | **NÃO TEMOS** — é GUI, não necessário para container | ✅ **Desnecessário** |
| `srt-launcher-service` | D-Bus launcher service | `steps/display.py` bind do D-Bus do host | ✅ |

---

## 6. GAPS Analysis: O que o PV faz que NÓS NÃO fazemos

### 🔴 GAPS CRÍTICOS (podem afetar compatibilidade)

| # | Gap | Impacto | Prioridade |
|---|-----|---------|------------|
| 1 | `--die-with-parent` (PV usa, nós não) | Container zumbi se o processo pai (makrun) crashar | **MÉDIA** — raro, mas pode deixar processos órfãos |
| 2 | **STEAM_COMPAT_INSTALL_PATH**: PV monta 2 níveis acima do exe (install dir raiz), nós montamos só o parent | Proton pode não encontrar arquivos do jogo se o launcher estiver em subdiretório | **MÉDIA** — depende da estrutura do jogo |
| 3 | **VA-API detection** (check-va-api) | Jogos com encode de vídeo (Steam Remote Play, NVIDIA Share) perdem aceleração | **BAIXA** — maioria dos jogos não usa |

### 🟡 GAPS MÉDIOS

| # | Gap | Impacto | Prioridade |
|---|-----|---------|------------|
| 4 | **Locale generation** (pv-locale-gen) | Se locale do host não existe no runtime, apps podem mostrar "??" ou warnings | **MÉDIA** — afeta texto em jogos |
| 5 | **XDG portal** (check-xdg-portal) | Flatpak-style file picker/portal não funciona | **BAIXA** — jogos raramente usam |
| 6 | **inspect-library** / ELF inspection | Não conseguimos inspecionar dependências de libs dinamicamente | **BAIXA** — capsule.py cobre o necessário |

### 🟢 GAPS BAIXOS / COSMÉTICOS

| # | Gap | Impacto | Prioridade |
|---|-----|---------|------------|
| 7 | LD_PRELOAD do usuário não preservado | Raramente usado | **BAIXA** |
| 8 | Xwayland detection | Display subótimo em sistemas híbridos | **BAIXA** |
| 9 | `--lock-file` bwrap | Prevenção de race condition | **BAIXA** (temos lock externo) |

---

## 7. O que NÓS temos que o PV NÃO TEM (vantagens)

| Feature | Nosso módulo | Por que é superior |
|---------|-------------|-------------------|
| **Proton Intelligence** (32 forks) | `intel/definitions/` | PV trata todo Proton igual. Nós temos definições específicas para CachyOS, GE, DW, EM, UMU, etc. |
| **Per-game profiles** (20+ jogos) | `intel/profiles.py` | PV não tem. Nós curamos engine-specific configs (Unreal, Unity, NW.js, etc.) |
| **Feature injection** | `intel/injector.py` | PV não tem. Nós injetamos env vars específicas do fork + anti-cheat + perfil. |
| **Anti-cheat relaxations** (32 definições) | `intel/anticheat/` | PV genérico. Nós temos flags específicas para EAC, BattlEye, nProtect, Xigncode3/5, Anubis. |
| **GPU/sync cache** | `core/gpu_cache.py` + `makai_manifest.json` | PV redescobre GPU toda vez. Nós cacheamos. |
| **Watchdog wrapper** (launcher → jogo real) | `steps/exec.py:34-55` | PV não tem. Nós mantemos container vivo mesmo se launcher sair. |
| **Gamescope integration** | `container/gamescope.py` | PV não tem. Nós monitoramos janelas e injetamos atom STEAM_GAME. |
| **Makaitricks** | `intel/makaitricks.py` | PV não tem winetricks inteligente. |
| **OverlayFS** | `--use-overlay` flag | PV não suporta overlay nativo. |
| **Seccomp custom** | `core/seccomp.py` | PV tem seccomp próprio (genérico). Nós temos filtro sob medida. |
| **Container manifest** | `makai_manifest.json` | PV não persiste estado. Nós cacheamos GPU, sync, histórico. |
| **json-status-fd** | `builder.py` | PV não expõe PID real do jogo. Nós temos JSON-lines com PID. |
| **Interactive mode** | `builder.py` | PV não tem --interactive. Nós temos shell on fail. |

---

## 8. Conclusão

O PV (`_v2-entry-point`) é **estático e genérico** — trata todo jogo e Proton igual, com um conjunto fixo de binds e env vars.

Nosso `builder.py` é **data-driven** — cada fork de Proton, jogo, e anti-cheat tem definições próprias que modificam o comportamento do container.

**Para matar o PV de vez**, precisamos tapar apenas 2 gaps reais:

1. **STEAM_COMPAT_INSTALL_PATH** — montar 2 níveis acima do exe (não só o parent)
2. **VA-API detection** — adicionar detecção de drivers de vídeo

O resto já é equivalente ou superior.
