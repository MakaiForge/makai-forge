# Makai Time — Plano de Implementação

> Documento baseado no estudo de:
> - `bubblewrap-0.11.2/` — bubblewrap.c (3144 linhas)
> - `steam-runtime-tools-main/pressure-vessel/` — runtime.c, wrap.c, passwd.c, graphics-provider.c, wrap-discord.c (100+ arquivos)
> - `umu-run` (zipapp) — umu_run.py, umu_runtime.py, umu_proton.py, umu_util.py (~3000 linhas Python)
> - `makai_time/` — código existente (30+ arquivos Python)
>
> Cada ponto tem referência EXATA de linha do código-fonte estudado.

---

## Fase 0 — Correções Imediatas (no Makai Time existente)

### 0.1 Proton writable → read-only

**Problema**: `container.py:253` monta Proton com `--bind` (writable).

Dois jogos usando o MESMO Proton simultaneamente podem corromper `compatdata/`.

**Solução**: Mudar para `--ro-bind`. Proton já é instalação pronta, não precisa escrever.

**Referência**: pressure-vessel monta o runtime com `--ro-bind` (runtime.c:468-472 `pv_runtime_bind_into_container`). Proton também não é montado como writable em lugar nenhum no pressure-vessel.

```python
# container.py:253 — ANTES:
cmd.extend(["--bind", resolved_proton, resolved_proton])

# DEPOIS:
cmd.extend(["--ro-bind", resolved_proton, resolved_proton])
```

### 0.2 LD_LIBRARY_PATH gerado mas não priorizado no container

**Problema**: `makai_time.py:382-383` gera `LD_LIBRARY_PATH` e coloca em `env`, mas dentro do container o Proton sobrescreve `LD_LIBRARY_PATH` com o dele.

**Solução**: Forçar `LD_LIBRARY_PATH` via `--setenv` DEPOIS do Proton ser setado, ou usar `STEAM_RUNTIME_LIBRARY_PATH`.

**Referência**: pressure-vessel/steam-compat-tool-interface.md documenta que `STEAM_RUNTIME_LIBRARY_PATH` é acrescentado ao `LD_LIBRARY_PATH` pelo Proton.

### 0.3 ld.so.cache regenerado mas não usado

**Problema**: `makai_time.py:387-389` chama `ldso.regenerate_ld_so_cache()` mas o `cache_path` retornado NÃO É PASSADO para o `build_bwrap_cmd()`.

**Solução**: Montar o cache gerado dentro do container como `/etc/ld.so.cache`.

**Referência**: pressure-vessel `bind_runtime_ld_so()` (runtime.c:3868) executa `pv-adverb --regenerate-ld.so.cache` e o resultado é montado no container.

---

## Fase 1 — Essencial (compatibilidade com qualquer Proton)

### 1.1 Prefix preparation (setup_pfx)

O que o UMU faz em `umu_run.py:setup_pfx()` (linhas 31-60):

```python
def setup_pfx(path):
    pfx = Path(path) / "pfx"
    steam = Path(path) / "drive_c/users/steamuser"
    user = getpwuid(os.getuid()).pw_name
    wineuser = Path(path) / f"drive_c/users/{user}"

    # pfx → .  (symlink para o próprio prefixo)
    if pfx.is_symlink(): pfx.unlink()
    if not pfx.is_dir(): pfx.symlink_to(Path(path).resolve())

    # tracked_files (arquivo de tracking do Proton)
    Path(path).joinpath("tracked_files").touch()

    # steamuser → $USER ou vice-versa
    if not wineuser.exists() and not steam.exists():
        steam.mkdir(parents=True)
        wineuser.symlink_to("steamuser")
    elif wineuser.is_dir() and not steam.exists():
        steam.symlink_to(user)
    elif not wineuser.exists() and steam.is_dir():
        wineuser.symlink_to("steamuser")
```

**Impacto**: Sem o symlink `pfx`, Protons GE e UMU não encontram o prefixo. Sem `steamuser`, protonfixes falham.

### 1.2 Env vars UMU completas

O UMU define em `umu_run.py:set_env()` (linhas 80-170) + `umu_run.py:check_env()` (linhas 63-98).

```python
VARS_OBRIGATORIAS = {
    # Identificação
    "GAMEID": env["GAMEID"],
    "UMU_ID": env["GAMEID"],
    "UMU_INVOCATION_ID": token_hex(16),

    # Proton
    "PROTONPATH": str(proton_path),
    "PROTON_VERB": "waitforexitandrun",
    "PROTON_CRASH_REPORT_DIR": "/tmp/umu_crashreports",

    # Steam Compat
    "STEAM_COMPAT_DATA_PATH": str(prefix_path),
    "STEAM_COMPAT_SHADER_PATH": f"{prefix_path}/shadercache",
    "STEAM_COMPAT_TOOL_PATHS": f"{proton_path}:{runtime_path}",
    "STEAM_COMPAT_MOUNTS": f"{proton_path}:{runtime_path}",
    "STEAM_COMPAT_INSTALL_PATH": str(game_dir),
    "STEAM_COMPAT_CLIENT_INSTALL_PATH": "",
    "STEAM_COMPAT_APP_ID": "0",
    "STEAM_COMPAT_LIBRARY_PATHS": "",  # preenchido por game drive detection

    # Steam Runtime
    "RUNTIMEPATH": str(runtime_path),
    "STEAM_RUNTIME_LIBRARY_PATH": "",  # lib paths do sistema

    # Steam
    "SteamAppId": "0",
    "SteamGameId": "0",
}
```

**Referência**: `umu_run.py:set_env()` linhas 80-170. Pressure-vessel `steam-compat-tool-interface.md` documenta cada variável.

### 1.3 Game drive detection

O UMU detecta mount points do diretório do jogo em `umu_run.py:enable_steam_game_drive()` (linhas 182-203):

```python
for path in Path(env["STEAM_COMPAT_INSTALL_PATH"]).parents:
    if path.is_mount() and path != Path("/"):
        env["STEAM_COMPAT_LIBRARY_PATHS"] = str(path)
        break
```

**Referência**: `steam-compat-tool-interface.md` linha 424: `STEAM_COMPAT_LIBRARY_PATHS` lista de paths separados por `:` para montar no container.

### 1.4 /etc/passwd + /etc/group sintéticos

O pressure-vessel gera passwd/group dentro do container com **apenas o usuário atual**. Implementação em `passwd.c` (263 linhas).

```python
# core/passwd.py
PASSWD_TEMPLATE = (
    "root:x:0:0:root:/root:/bin/bash\n"
    "{user}:x:{uid}:{uid}:{user}:{home}:/bin/bash\n"
)

GROUP_TEMPLATE = (
    "root:x:0:\n"
    "{user}:x:{uid}:\n"
)
```

Montagem no bwrap:
```python
cmd.extend(["--ro-bind-data", passwd_content, "/etc/passwd"])
cmd.extend(["--ro-bind-data", group_content, "/etc/group"])
```

**Referência**: `pressure-vessel/passwd.c` linhas 1-263. Usado em `bind_runtime_finish()` (runtime.c:4135).

### 1.5 Proteção de /home

**Referência**: `pressure-vessel/wrap.c` linha 613:
```c
pv_exports_mask_or_log (self->exports, "/home");
```

No Makai Time, implementar no `build_bwrap_cmd()`:
```python
cmd.extend(["--tmpfs", "/home"])
cmd.extend(["--bind", home, home])  # só expõe o home do usuário atual
```

### 1.6 Regeneração de ld.so.cache integrada

Já existe em `core/ldso.py:regenerate_ld_so_cache()` (linhas 131-159). Precisa ser:
1. Chamada ANTES de `build_bwrap_cmd()`
2. O cache gerado montado como `/etc/ld.so.cache` no container

**Referência**: `pressure-vessel/runtime.c:bind_runtime_ld_so()` (linha 3868). Executa `pv-adverb --regenerate-ld.so.cache` com runtime libs + GPU overrides.

---

## Fase 2 — Display / Integração Desktop

### 2.1 Gamescope window monitoring

O UMU faz em `umu_run.py:monitor_windows()` (linhas 360-400) + `set_steam_game_property()` (linhas 280-310):

```python
# core/gamescope.py
def monitor_windows(d: display.Display, pid: int):
    window_ids = get_pstree_window_ids(d, pstree, get_window_ids(d))
    set_steam_game_property(d, window_ids, steam_appid)

def set_steam_game_property(d, window_ids, appid):
    for wid in window_ids:
        window = d.create_resource_object("window", wid)
        window.change_property(
            d.get_atom("STEAM_GAME"), Xatom.CARDINAL, 32, [appid]
        )
```

**Referência**: `umu_run.py:monitor_windows()` linha 360. `umu_run.py:set_steam_game_property()` linha 280. `pressure-vessel/bin/dialog-ui.c:237` XInternAtom STEAM_GAME.

**Impacto**: Sem isso, janelas do jogo no Gamescope podem ficar atrás de outras janelas ou não serem trazidas ao foreground.

### 2.2 prctl PR_SET_CHILD_SUBREAPER

O UMU faz em `umu_run.py:run_command()` (linhas 420-450). O bwrap também faz em `bubblewrap.c:3144`:

```python
libc = CDLL(find_library("c"))
prctl = libc.prctl
prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0, 0)
```

**Referência**: `bubblewrap-0.11.2/bubblewrap.c:3144`. `steam-runtime-tools-main/docs/steam-compat-tool-interface.md:529`.

**Impacto**: Sem subreaper, processos órfãos dentro do container não são limpos corretamente.

### 2.3 Discord IPC

O pressure-vessel faz em `wrap-discord.c:53-96`:

```python
def discord_args() -> list[str]:
    args = []
    run_dir = os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
    if os.path.isdir(run_dir):
        for f in os.listdir(run_dir):
            if f.startswith("discord-ipc-"):
                socket_path = os.path.join(run_dir, f)
                if os.path.exists(socket_path):
                    args.extend(["--ro-bind", socket_path, socket_path])
    return args
```

**Referência**: `pressure-vessel/wrap-discord.c` linhas 53-96.

---

## Fase 3 — Multi-Runtime + Garbage Collection

### 3.1 Garbage Collection de runtimes

O pressure-vessel limpa runtimes antigos em `runtime.c:pv_runtime_garbage_collect()` (linhas 1123-1189) usando `.ref` file locks:

```python
# core/runtime.py (adicionar)
def garbage_collect(variable_dir: str):
    """Remove runtimes antigos. Mantém os que estão com lock ativo."""
    for entry in os.listdir(variable_dir):
        ref_path = os.path.join(variable_dir, entry, ".ref")
        if os.path.isfile(ref_path):
            try:
                fd = os.open(ref_path, os.O_RDONLY)
                flock(fd, LOCK_EX | LOCK_NB)  # Se conseguir lock, ninguém usa
                # Pode deletar
                shutil.rmtree(os.path.join(variable_dir, entry))
                os.close(fd)
            except (BlockingIOError, OSError):
                pass  # Ainda em uso
```

**Referência**: `pressure-vessel/runtime.c` linhas 1060-1189.

### 3.2 Suporte a runtimes mais antigos (scout, soldier, sniper)

O download já existe em `core/runtime.py`. Mas scout/soldier têm estruturas diferentes:
- scout: `/files` com merged `/usr` (flatpak-style)
- soldier/sniper: mesma estrutura do steamrt4
- scout usa `SteamLinuxRuntime_1.tar.xz` (não `com.valvesoftware.SteamRuntime...`)

Precisa ajustar as URLs em `runtime.py:STEAMRT_REGISTRY`.

---

## Fase 4 — Avançado (Steam API, FEX, Layers)

### 4.1 Vulkan/OpenXR layer masking

O pressure-vessel monta diretórios VAZIOS sobre `~/.local/share/vulkan/implicit_layer.d` para esconder layers do host. Referência: `runtime.c:233`.

### 4.2 Container auxiliar capsule-capture-libs

O pressure-vessel SOBE UM BWRAP AUXILIAR em `runtime.c:pv_runtime_get_capsule_capture_libs()` (linha 2519) para rodar `capsule-capture-libs` DENTRO do runtime. O resultado é uma lista de libs GPU para copiar.

### 4.3 Mutable sysroot (FEX-Emu)

`runtime.c:pv_runtime_create_copy()` (linha 1211). Copia runtime para `/var/pressure-vessel/<hash>/` com `--bind` em vez de `--ro-bind` para permitir modificações. Necessário para FEX-Emu (ARM → x86) e Steam Snap.

### 4.4 steam_api.dll / steamclient.fake

Para jogos Steam com DRM. O pressure-vessel faz isso via exports e bind mounts. Não implementado no UMU nem no Makai Time.

---

## Mapa de Implementação por Arquivo

```
app/_main/container/makai_time/
├── core/
│   ├── passwd.py            ★ NOVO — geração de /etc/passwd + /etc/group
│   ├── gamescope.py          ★ NOVO — monitor_windows + STEAM_GAME atom
│   └── ldso.py               ✅ MODIFICAR — integrar regenerate_ld_so_cache no fluxo
│
├── proton/
│   └── config.py             ✅ MODIFICAR — adicionar env vars UMU faltantes
│
├── container/
│   ├── bwrap.py              ★ NOVO — extrair build_bwrap_cmd + run_in_container
│   ├── home.py               ★ NOVO — proteção de /home (tmpfs + bind user)
│   └── discord.py            ★ NOVO — Discord IPC socket binding
│
└── makai_time.py             ✅ MODIFICAR — adicionar steps faltantes:
                                  - setup_pfx()
                                  - game drive detection
                                  - env vars UMU completas
                                  - regenerate_ld_so_cache integrado
                                  - prctl subreaper
                                  - /etc/passwd mount
                                  - proteção /home
```

---

## Pipeline Final (após todas as fases)

```
1. detect_game()                → engine + profile
2. identify_proton()             → fork detection + features
3. setup_pfx()                   → ★ NOVO: prefix preparation (pfx symlink, tracked_files, steamuser)
4. ensure_runtime(name)          → download steamrt4/sniper/soldier/scout
5. detect_gpu()                  → vendor + driver + OpenGL + Vulkan
6. detect_sync()                 → ntsync > fsync > esync
7. detect_cpu()                  → topology (P-cores/E-cores)
8. capture_gpu_libs()            → detect + symlink só libs GPU necessárias
9. regenerate_ld_cache()         → ★ REFATORADO: ldconfig + montagem no container
10. generate_passwd()            → ★ NOVO: /etc/passwd sintético
11. protect_home()              → ★ NOVO: tmpfs + bind só user atual
12. detect_game_drive()         → ★ NOVO: STEAM_COMPAT_LIBRARY_PATHS
13. generate_env_vars()          → env vars (hardware + sync + profile + UMU)
14. build_bwrap_cmd()            → monta comando bwrap completo
15. run_in_container()           → executa com prctl subreaper
16. monitor_windows()            → ★ NOVO: seta atom STEAM_GAME (se gamescope)
```

---

## Teste com Proton-CachyOS

Jogo de teste: How to Raise a Happy NEET (NW.js)

```bash
# Comando de teste atual (funciona):
cd /home/cas/Documentos/Makai_forge/app/_main/container
app/_venv/bin/python3 -m makai_time.makai_time \
  --game-exe "/caminho/para/Game.exe" \
  --proton-path "/caminho/para/Proton-CachyOS-11.0" \
  --prefix-path "/caminho/para/prefixo" \
  --dry-run --verbose

# Após implementar Fase 1, deve funcionar com:
# - Qualquer Proton do catálogo (testar com UMU-Proton depois)
# - Múltiplos jogos simultâneos (Proton em --ro-bind)
# - Jogos em drives externos (game drive detection)
# - Protonfixes (env vars UMU + steamuser)
```

---

## Referências Completas

| Funcionalidade | Projeto | Arquivo | Linha |
|---|---|---|---|
| bwrap container | bubblewrap | bubblewrap.c | 1-3144 |
| prctl subreaper | bubblewrap | bubblewrap.c | 3144 |
| Pipeline runtime | pressure-vessel | runtime.c | 8654 (pv_runtime_bind) |
| bind_runtime_base | pressure-vessel | runtime.c | 3366 |
| bind_runtime_ld_so | pressure-vessel | runtime.c | 3868 |
| bind_runtime_finish | pressure-vessel | runtime.c | 4135 |
| GPU graphics stack | pressure-vessel | runtime.c | 7887 |
| capsule-capture-libs | pressure-vessel | runtime.c | 2519-2690 |
| passwd/group | pressure-vessel | passwd.c | 1-263 |
| Home protection | pressure-vessel | wrap.c | 613 |
| Discord IPC | pressure-vessel | wrap-discord.c | 53-96 |
| GPU enumeration | pressure-vessel | graphics-provider.c | 1-1124 |
| Garbage collection | pressure-vessel | runtime.c | 1060-1189 |
| Mutable sysroot | pressure-vessel | runtime.c | 1211-1411 |
| STEAM_GAME atom | pressure-vessel | dialog-ui.c | 237 |
| Steam Compat interface | pressure-vessel | steam-compat-tool-interface.md | 424-529 |
| setup_pfx | UMU | umu_run.py | 31-60 |
| check_env | UMU | umu_run.py | 63-98 |
| set_env (env vars) | UMU | umu_run.py | 80-170 |
| enable_steam_game_drive | UMU | umu_run.py | 182-203 |
| build_command | UMU | umu_run.py | 206-245 |
| run_command (subreaper) | UMU | umu_run.py | 420-450 |
| monitor_windows | UMU | umu_run.py | 360-400 |
| set_steam_game_property | UMU | umu_run.py | 280-310 |
| setup_umu (runtime) | UMU | umu_runtime.py | 1-250 |
| GPU detection | Makai Time | core/gpu.py | 1-98 |
| Sync detection | Makai Time | core/sync.py | 1-51 |
| Runtime download | Makai Time | core/runtime.py | 1-234 |
| LD_LIBRARY_PATH | Makai Time | core/ldso.py | 1-184 |
| Display/audio mounts | Makai Time | core/display.py | 1-103 |
| GPU overrides detect | Makai Time | overrides/detect.py | 1-332 |
| GPU overrides capture | Makai Time | overrides/capture.py | 1-226 |
| GPU overrides mount | Makai Time | overrides/mount.py | 1-55 |
| Proton Intelligence | Makai Time | proton/intel.py | 1-243 |
| Config injection | Makai Time | proton/config.py | 1-157 |
| Recommendation engine | Makai Time | proton/recommender.py | 1-131 |
| 31 Proton definitions | Makai Time | proton/definitions/*.py | (31 arquivos) |
| Per-game profiles | Makai Time | profiles/registry.py | 1-348 |
| Engine handlers | Makai Time | profiles/engine.py | 1-219 |
| Profile manager | Makai Time | profiles/manager.py | 1-195 |
| CPU topology | Makai Time | utils/sysinfo.py | 1-102 |
| Container awereness | Makai Time | recommender.py:container_env | 13-72 |
