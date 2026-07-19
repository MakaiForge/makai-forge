# Arquitetura do Container Makai Time

O container é construído em **steps independentes**, cada um responsável por uma camada do ambiente.  
Cada step lê da `get_container_config()` do Proton e gera os argumentos `bwrap` correspondentes.

---

## Pipeline de construção

```
builder.py (orquestrador)
  │
  ├── 1. isolation.py    ─── Isolamento (namespaces, capabilities, seccomp)
  ├── 2. runtime.py      ─── Runtime Debian (files/usr → /usr, libs, linkers)
  ├── 3. gpu.py          ─── Overrides GPU (NVIDIA/AMD + ICDs + EGL)
  ├── 4. audio.py        ─── Áudio (PulseAudio/PipeWire/ALSA + configs)
  ├── 5. display.py      ─── Display (X11/Wayland/D-Bus/Discord)
  ├── 6. etc.py          ─── /etc (hosts, resolv, machine-id, timezone, ld.so.cache)
  ├── 7. ssl.py          ─── Certificados SSL
  ├── 8. fonts.py        ─── Fontes do sistema
  ├── 9. devices.py      ─── /dev (GPU, áudio, NTSYNC, udev)
  ├── 10. mounts.py      ─── Provider mount + Proton/Prefix/Jogo
  ├── 11. env.py         ─── Env vars (features + definição + pass-through)
  └── 12. exec.py        ─── Comando final (Proton + verbo + exe)
```

Cada step retorna um `StepResult`:

```python
@dataclass
class StepResult:
    args: list[str]        # Argumentos bwrap gerados
    applied: bool          # True se o step fez algo
    summary: str           # Descrição do que foi feito (para log)
```

O builder coleta todos os `StepResult`, valida conflitos, loga e executa o bwrap.

---

## Step a step

### 1. `isolation.py` — Isolamento

```python
def configure(config: dict) -> StepResult
```

Lê de `container_config["container"]`:

| Config | Default | Descrição |
|--------|---------|-----------|
| `unshare_all` | `True` | `--unshare-all` (mount, PID, net, IPC, user, cgroup, uts, time) |
| `disable_userns` | `True` | `--disable-userns` (anti-cheat) |
| `clearenv` | `True` | `--clearenv` |
| `cap_drop_all` | `True` | `--cap-drop ALL` |
| `seccomp` | `True` | Aplica filtros BPF seccomp |
| `hostname` | `"makai"` | Hostname do container |
| `lock_file` | `True` | Lock file para evitar race conditions |

### 2. `runtime.py` — Runtime Debian

```python
def configure(runtime_path: Path, config: dict) -> StepResult
```

Lê de `container_config["container"]`:

| Config | Default | Descrição |
|--------|---------|-----------|
| `runtime_mount` | `"/usr"` | Onde montar `files/usr` do runtime |
| `lib_mount` | `"/lib"` | Onde montar `files/lib` |
| `linkers` | `True` | Cria symlinks `/lib/ld-linux.so.2`, `/lib64`, `/lib32` |
| `ld_so_cache` | `True` | Monta `ld.so.cache` do runtime |
| `bin_sbin_symlinks` | `True` | `/bin` → `/usr/bin`, `/sbin` → `/usr/sbin` |

Monta:
- `--ro-bind <runtime>/usr /usr`
- `--tmpfs /lib` + binds individuais de `x86_64-linux-gnu`, `i386-linux-gnu`
- Symlinks: `/lib/ld-linux.so.2` → `i386-linux-gnu/ld-linux.so.2`
- Symlinks: `/lib64` → `lib/x86_64-linux-gnu`, `/lib32` → `lib/i386-linux-gnu`
- Symlinks: `/bin` → `usr/bin`, `/sbin` → `usr/sbin`

### 3. `gpu.py` — Overrides GPU

```python
def configure(config: dict) -> StepResult
```

Lê de `container_config["gpu"]`:

| Config | Default | Descrição |
|--------|---------|-----------|
| `vendor` | `"auto"` | `"nvidia"`, `"amd"`, `"intel"`, `"auto"` |
| `skip_nvidia_overrides` | `False` | Pula overrides (Proton já tem bundled) |
| `egl_vendor_nvidia_only` | `False` | Força ONLY NVIDIA EGL |
| `glx_vendor` | `"nvidia"` | `__GLX_VENDOR_LIBRARY_NAME` |
| `vk_icd` | `"auto"` | `"nvidia"`, `"mesa"`, `"auto"` |
| `extra_lib_binds` | `[]` | Libs .so adicionais para montar |

Comportamento:
- Se `skip_nvidia_overrides == True`: não monta nada (Proton bundled)
- Se não: detecta libs NVIDIA no host (`libnvidia-*`, `libcuda*`, `libEGL_nvidia*`) e monta em `/overrides/lib` e `/overrides/lib32`
- Seta `VK_ICD_FILENAMES`, `VK_DRIVER_FILES`, `VK_LAYER_PATH`
- Seta `__EGL_VENDOR_LIBRARY_FILENAMES` se `egl_vendor_nvidia_only`
- Seta `__GLX_VENDOR_LIBRARY_NAME`
- Seta `LIBGL_DRIVERS_PATH`, `GBM_BACKENDS_PATH`

### 4. `audio.py` — Áudio

```python
def configure(config: dict) -> StepResult
```

Lê de `container_config["audio"]`:

| Config | Default | Descrição |
|--------|---------|-----------|
| `setup_alsa_config` | `False` | Cria `/etc/asound.conf`? |
| `asound_default` | `None` | `"pipewire"`, `"pulse"`, `None` |
| `bind_pulse_socket` | `True` | Monta socket PulseAudio |
| `bind_pipewire_socket` | `True` | Monta socket PipeWire |
| `pulse_cookie` | `True` | Monta cookie de autenticação |
| `pulse_server` | `auto` | `PULSE_SERVER` (auto-detecta do host) |
| `pulse_clientconfig` | `"enable-shm=no"` | Conteúdo do `PULSE_CLIENTCONFIG` |
| `alsoft_drivers` | `"pulse,alsa"` | `ALSOFT_DRIVERS` (OpenAL Soft) |
| `bind_dev_snd` | `False` | Monta `/dev/snd`? |
| `openal_i386` | `False` | Baixa/monta libopenal.so.1 i386? |
| `bind_run_user` | `True` | Monta `/run/user/$UID` |
| `extra_env` | `{}` | Env vars extras de áudio |

Comportamento:
- Se `asound_default == "pipewire"`: cria `/etc/asound.conf` com `pcm.!default { type pipewire }`
- Se `asound_default == "pulse"`: cria `/etc/asound.conf` com `pcm.!default { type pulse }`
- Se `setup_alsa_config == False`: não cria asound.conf (usa config nativa do runtime)
- Monta sockets PulseAudio + PipeWire + D-Bus
- Configura `PULSE_CLIENTCONFIG` com `enable-shm=no`
- Seta `ALSOFT_DRIVERS`, `PULSE_SERVER`, `PULSE_COOKIE`

**Nota sobre /dev/snd**: CachyOS não precisa (usa PipeWire). Protons Valve/GE também não.  
Se `bind_dev_snd == False`, o Wine não detecta ALSA e usa winepulse.drv.  
Se `bind_dev_snd == True`, o Wine pode preferir winealsa.drv (que pode ter comportamento diferente).

### 5. `display.py` — Display

```python
def configure(config: dict) -> StepResult
```

Lê de `container_config["display"]`:

| Config | Default | Descrição |
|--------|---------|-----------|
| `bind_x11` | `True` | Monta `/tmp/.X11-unix` |
| `bind_wayland` | `True` | Monta socket Wayland |
| `bind_dbus` | `True` | Monta socket D-Bus |
| `bind_discord` | `True` | Monta sockets Discord IPC |
| `xauthority` | `True` | Configura XAUTHORITY |
| `wayland_display` | `"wayland-0"` | `WAYLAND_DISPLAY` |
| `display_env` | `":0"` | `DISPLAY` |
| `xdg_session_type` | `""` | `XDG_SESSION_TYPE` |
| `extra_env` | `{}` | Env vars extras de display |

### 6. `etc.py` — /etc

```python
def configure(runtime_path: Path, config: dict) -> StepResult
```

Monta arquivos essenciais do /etc:

- `nsswitch.conf` (sintético, aponta para files + dns)
- `hosts`, `host.conf`, `resolv.conf`, `services` (do host)
- `group`, `passwd` (do host)
- `machine-id` (do host — necessário para D-Bus/PulseAudio)
- `localtime` (do host — timezone)
- `ld.so.cache` (do runtime)
- Diretórios do runtime: `pulse/`, `openal/`, `alsa/` (se existirem)

### 7. `ssl.py` — SSL

Monta certificados SSL do host no container (para HTTPS em jogos).

### 8. `fonts.py` — Fontes

Monta fontes do host: `/usr/share/fonts`, `~/.local/share/fonts`, `~/.fonts`.

### 9. `devices.py` — /dev

```python
def configure(config: dict) -> StepResult
```

Lê de `container_config["devices"]`:

| Config | Default | Descrição |
|--------|---------|-----------|
| `bind_dri` | `True` | `/dev/dri` |
| `bind_nvidia` | `auto` | `/dev/nvidia{0,ctl,modeset,uvm}` |
| `bind_snd` | `False` | `/dev/snd` |
| `bind_ntsync` | `False` | `/dev/ntsync` (se kernel 6.14+) |
| `bind_shm` | `True` | `/dev/shm` |
| `bind_udev` | `True` | `/run/udev` |
| `extra_binds` | `[]` | Binds adicionais |

### 10. `mounts.py` — Provider + Proton + Prefixo + Jogo

```python
def configure(proton_path, prefix_path, exe_path, config: dict) -> StepResult
```

- Provider mount: `--ro-bind / /run/host` (host em `/run/host`)
- Proton: `--bind <proton_path> /proton`
- Prefixo: `--bind <wineprefix> <wineprefix>`
- Jogo: `--ro-bind <exe_dir> <exe_dir>`
- Home: `--tmpfs /home` + `--bind $HOME $HOME`

### 11. `env.py` — Env vars

```python
def configure(env: dict, features: dict, container_config: dict) -> StepResult
```

Aplica na ordem:
1. Env vars base: `PATH`, `HOME`, `container`, `WINEPREFIX`, `PROTONPATH`
2. Env vars Steam: `STEAM_COMPAT_*`, `SteamAppId`, `SteamGameId`
3. Configs do Proton: `container_config["env"]`
4. Features do injector: `features["env"]`
5. Env vars de GPU: `VK_ICD_FILENAMES`, etc.
6. Env vars de display: `DISPLAY`, `WAYLAND_DISPLAY`, `XAUTHORITY`
7. Env vars de áudio: `PULSE_SERVER`, `ALSOFT_DRIVERS`
8. Locale: `LANG`, `LC_*` (pass-through do host)
9. Env vars extras: `WINEDEBUG` (se veio de fora)

### 12. `exec.py` — Comando final

```python
def configure(env: dict, features: dict, config: dict) -> StepResult
```

Lê de `definition["launch"]`:

| Config | Descrição |
|--------|-----------|
| `method` | `wine64`, `wine_preloader`, `start_unix` |
| `use_umu_exe` | Usa `umu.exe` como entry |
| `use_preloader` | Força `wine64-preloader` |

Monta o comando:  
`<proton>/proton waitforexitandrun <exe>`

---

## Logging

Cada step produz log no formato:

```
[2026-07-18 17:00:00] step=audio applied=True args=6 summary="montado PulseAudio socket + /etc/pulse/client.conf"
[2026-07-18 17:00:00] step=gpu applied=False summary="skip_nvidia_overrides=True (Proton bundled)"
```

O log vai para:
1. `stdout/stderr` do terminal
2. Arquivo `<prefixo>/makrun-build.log` (para debug pós-jogo)

---

## Validação

Antes de executar o bwrap, o builder valida:

1. **Conflitos**: duas env vars com mesmo nome? Dois binds pro mesmo path?  
   Se conflito: loga WARNING, a última vence.

2. **Integridade**: todos os paths de bind existem?  
   Se não existe: loga WARNING, step pode pular.

3. **Schema**: a `get_container_config()` é validada contra um JSON schema.  
   Se campo inválido: loga ERROR, usa default.

---

## Diagrama de fluxo

```
Usuário abre jogo
       │
       ▼
play.py → launch.py → runner.py
       │
       ├── identify_proton() → "proton-cachyos"
       ├── inject_features() → features["env"], launch
       ├── get_container_config("proton-cachyos") → config dict
       │
       ▼
   builder.py
       │
       ├── isolation.configure(config)
       ├── runtime.configure(runtime_path, config)
       ├── gpu.configure(config)
       ├── audio.configure(config)
       ├── display.configure(config)
       ├── etc.configure(runtime_path, config)
       ├── ssl.configure(config)
       ├── fonts.configure(config)
       ├── devices.configure(config)
       ├── mounts.configure(proton, prefix, exe, config)
       ├── env.configure(env, features, config)
       └── exec.configure(env, features, config)
       │
       ├── Valida conflitos
       ├── Loga resultado
       │
       ▼
   bwrap <args> /proton/proton waitforexitandrun /game/Launcher.exe
       │
       ▼
   Container rodando (GPU, áudio, display, rede)
```
