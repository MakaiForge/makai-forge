# Estudo: Proton CachyOS + UMU-Launcher vs Makai Time

**Data:** 18/07/2026
**Jogo alvo:** Grand Fantasia Violet (DX9 MMO)
**Proton alvo:** Proton-CachyOS-11.0-20260602-slr
**Referência original:** UMU-Launcher v1.3.0 + pressure-vessel (sniper/steamrt4)

---

## 1. ARQUITETURA DE CADA SISTEMA

### UMU-Launcher (ORIGINAL — o que queremos replicar)
```
umu-run waitforexitandrun /game/Launcher.exe
  │
  ├── 1. check_env() → valida GAMEID, WINEPREFIX, PROTONPATH
  ├── 2. setup_pfx() → cria symlinks pfx/ e steamuser
  ├── 3. set_env() → define STEAM_COMPAT_*, UMU_ID, etc.
  ├── 4. setup_umu() → baixa runtime sniper/steamrt4
  ├── 5. build_command()
  │     └── _v2-entry-point → pressure-vessel-unruntime
  │         ├── --verb waitforexitandrun
  │         └── -- shim proton waitforexitandrun EXE
  └── 6. run_command() → Popen()
```

**Cadeia de processos:**
1. `umu-run` (Python) → seta env vars
2. `_v2-entry-point` (shell) → configura pressure-vessel
3. `pressure-vessel-unruntime` (C) → cria **container** com bwrap (sem isolamento)
4. `umu-shim` (shell) → ajusta DISPLAY, `exec "$@"`
5. `proton` script (Python) → init_wine(), setup_prefix(), run()
6. `wine-preloader wine steam.exe` → DLL overrides → jogo

### Proton CachyOS (dentro do container)
```
proton waitforexitandrun Launcher.exe
  │
  ├── Proton(base_dir) → resolve dist/bin/lib/fonts/
  ├── CompatData(WINEPREFIX) → gerencia pfx/
  ├── Session() → copia env, dlloverrides default
  ├── init_wine() →
  │     ├── Detecta NTSYNC → WINENTSYNC=1
  │     ├── find_nvidia_wine_dll_dir() → NVIDIA DLLs
  │     ├── default_compat_config() → por appid
  │     └── resolve LD_LIBRARY_PATH com protonfixes
  ├── setup_prefix() →
  │     ├── copy_pfx() → default_pfx → prefixo
  │     ├── update_builtin_libs() → DXVK, VKD3D, NVAPI
  │     ├── create_fonts_symlinks()
  │     └── setup_dir_drive() → s: (gamedir), t: (steamdir)
  └── run() →
        ├── UMU mode: wine-preloader wine umu.exe
        ├── Steam mode: wine-preloader wine steam.exe
        └── sys.argv[2:] = Launcher.exe
```

**Chave**: O Proton CachyOS DETECTA se é UMU via `UMU_ID` no env. Se tem `UMU_ID`, usa `umu.exe` como bootstrap. Se não, usa `steam.exe` (Steam stub).

### Makai Time (NOSSO — o que estamos construindo)
```
makai-shim waitforexitandrun Launcher.exe
  │
  ├── sanitize_env() → limpa LD_LIBRARY_PATH, LD_PRELOAD
  ├── run() →
  │     ├── resolve_proton_path() → acha Proton
  │     ├── resolve_runtime_version() → steamrt4
  │     ├── check_env() / set_env() → STEAM_COMPAT_*
  │     ├── setup_pfx() → prepara prefixo
  │     ├── inject_features() → Proton Intelligence
  │     └── build_command() → build_bwrap_cmd()
  │           ├── bwrap --unshare-all --clearenv --cap-drop ALL
  │           ├── --ro-bind runtime/files/usr /usr
  │           ├── --ro-bind proton /proton
  │           ├── --bind prefix /prefix
  │           ├── --bind game /game
  │           ├── GPU overrides, X11, Wayland, áudio
  │           └── /proton/proton waitforexitandrun /game/Launcher.exe
  └── Popen(bwrap_cmd)
```

---

## 2. DIFERENÇAS CRÍTICAS

### 2.1. Isolamento (Filosofia)

| Aspecto | UMU | Makai Time | Impacto |
|---------|-----|------------|---------|
| `--unshare-user` | ❌ | ✅ | UMU compartilha user namespace → processos veem /proc real |
| `--unshare-pid` | ❌ | ✅ | UMU: PID real visível. Makai: PIDs isolados |
| `--clearenv` | ❌ | ✅ | UMU: host env passa direto. Makai: limpa tudo |
| `--cap-drop ALL` | ❌ | ✅ | UMU: processos têm capabilities |
| Security boundary | `--not-a-security-boundary` | Hardened | UMU admite que não é seguro |

**Conclusão**: O UMU NÃO isola nada propositalmente (`--not-a-security-boundary`). O Makai Time isola de verdade. Para jogos MMO que não têm anti-cheat agressivo, isso é OK. Para anti-cheats (EAC, BattlEye), pode precisar relaxar.

### 2.2. Variáveis de Ambiente (CRÍTICO)

O UMU passa DEZENAS de env vars do host para o container. O Makai Time (com `--clearenv`) só passa as que explicitamente setamos.

#### Env vars que o UMU passa (mas Makai Time NÃO):

| Variável | UMU (host → container) | Makai Time | Por que importa |
|----------|----------------------|------------|-----------------|
| `STEAM_COMPAT_SHADER_PATH` | `$WINEPREFIX/shadercache` | ❌ | DXVK/VKD3D recompila shaders toda vez |
| `VK_DRIVER_FILES` | = VK_ICD_FILENAMES | ❌ | Fallback Vulkan loader |
| `VK_IMPLICIT_LAYER_PATH` | overrides + host | ❌ | MangoHud, Gamescope WSI |
| `VK_LAYER_PATH` | overrides + host | ❌ | Layers explícitas |
| `GBM_BACKENDS_PATH` | overrides + host | ❌ | GPU GBM backend |
| `LIBGL_DRIVERS_PATH` | overrides + host | ❌ | DRI OpenGL drivers |
| `LIBVA_DRIVERS_PATH` | overrides + host | ❌ | Aceleração de vídeo |
| `VDPAU_DRIVER_PATH` | overrides + host | ❌ | Decodificação VDPAU |
| `UMU_ID` | = GAMEID | ❌ | Proton detecta modo UMU |
| `UMU_INVOCATION_ID` | token_hex(16) | ❌ | Rastreamento |
| `LANG` / `LC_ALL` | herdado do host | ❌ | Locale do jogo |
| `STORE` | herdado do host | ❌ | Identificação de loja |
| `FONTCONFIG_PATH` | herdado do host | ❌ | Config de fontes |
| `SSL_CERT_FILE` | herdado do host | ❌ | HTTPS |
| `SSL_CERT_DIR` | herdado do host | ❌ | HTTPS |

#### Env vars específicas que o Proton CachyOS USA:

| Variável | Onde o Proton lê | Efeito |
|----------|-----------------|--------|
| `WINELOADERNOEXEC` | Session.run() | Usa wine-preloader direto (mais rápido) |
| `WINENTSYNC` | init_wine() | Ativa NTSYNC (kernel 6.14+) |
| `PROTON_LOCAL_SHADER_CACHE` | setup_prefix() | Shader cache local |
| `PROTON_DXVK_SAREK` | default_compat_config() | DXVK Sarek (GPU fraca) |
| `PROTON_NVIDIA_LIBS` | default_compat_config() | Ativa NVAPI, NVENC, NVML |
| `UMU_ID` | Session.run() | Escolhe steam.exe vs umu.exe |
| `STEAM_COMPAT_APP_ID` | default_compat_config() | Perfis por appid |
| `STEAM_COMPAT_INSTALL_PATH` | try_get_game_library_dir() | Game drive mount |
| `STEAM_COMPAT_LIBRARY_PATHS` | try_get_game_library_dir() | Library paths |

### 2.3. Montagens (Filesystem)

O UMU monta MUITO mais coisas que o Makai Time:

| Path | UMU | Makai Time | Importância |
|------|-----|------------|-------------|
| `/etc/pulse` | ✅ (do runtime) | ❌ | Config de áudio |
| `/etc/alsa` | ✅ (do runtime) | ❌ | Config ALSA |
| `/etc/vulkan` | ✅ (do runtime) | ❌ | Layers Vulkan |
| `/etc/glvnd` | ✅ (do runtime) | ❌ | EGL glvnd |
| `/etc/passwd` | ✅ (sintético via memfd) | ❌ | Anti-cheat verifica UID |
| `/etc/group` | ✅ (sintético via memfd) | ❌ | Anti-cheat verifica grupo |
| `/etc/timezone` | ✅ (sintético) | ❌ | Timezone |
| `/dev/snd` | ✅ | ❌ | Áudio ALSA direto |
| `/run/systemd/journal` | ✅ | ❌ | Logging |
| `/var/run/dbus` | ✅ | ❌ | D-Bus system bus |
| `/mnt`, `/opt`, `/srv` | ✅ | ❌ | Jogos em outras partições |
| `/run/media` | ✅ | ❌ | Mídia removível |
| `/var/tmp` | ✅ | ❌ | Temp files |

### 2.4. Prefixo (setup_pfx)

O UMU faz setup de prefixo que o Makai Time NÃO faz:

| Operação | UMU | Makai Time | Importância |
|----------|-----|------------|-------------|
| `pfx/` → symlink do WINEPREFIX | ✅ | ⚠️ Parcial | Compatibilidade |
| steamuser symlink | ✅ | ❌ | Proton espera steamuser |
| tracked_files | ✅ | ❌ | Rastreamento de DLLs |
| `Z:` drive (`/`) | ✅ | ❌ | Acesso a arquivos do host |
| `C:` drive symlink | ✅ | ❌ | Prefixo mount |
| Font symlinks para Proton fonts | ✅ | ❌ | Fontes do Windows |
| OpenVR paths | ✅ | ❌ | VR support |

### 2.5. O "umu.exe" (bootstrap Windows)

**Descoberta importante**: O Proton CachyOS, quando detecta `UMU_ID` no env, usa `umu.exe` como bootstrap:
```python
argv = [wine-preloader, wine, "c:\\windows\\system32\\umu.exe"]
```

Isso significa que o `umu.exe` é um executável Windows que faz:
1. Parse dos args (o exe do jogo vem via sys.argv[2:])
2. Seta DLL overrides específicas
3. Chama o executável real

O `umu.exe` fica DENTRO do prefixo (`drive_c/windows/system32/umu.exe`), copiado pelo `setup_prefix()`.

---

## 3. O PROTON CACHYOS EM DETALHE

### 3.1. Estrutura de diretórios
```
Proton-CachyOS-11.0-20260602-slr/
├── proton                    ← Script principal (2451 linhas)
├── filelock.py               ← Lock files
├── protonfixes/              ← Fixes específicos por jogo
├── files/                    ← Wine + DXVK + VKD3D + ferramentas
│   ├── bin/                  ← wine, wineserver, winebuild
│   ├── lib/                  ← Libraries Wine
│   │   └── wine/
│   │       ├── x86_64-unix/  ← wine-preloader, wine (64-bit)
│   │       ├── i386-unix/    ← wine-preloader, wine (32-bit)
│   │       ├── dxvk/         ← DXVK (d3d9, d3d10, d3d11, dxgi)
│   │       ├── vkd3d-proton/ ← VKD3D (d3d12)
│   │       ├── nvidia-libs/  ← NVAPI, NVENC, NVML, NVCUDA
│   │       └── discord-rpc-bridge/ ← Discord integration
│   └── share/
│       └── default_pfx/      ← Prefixo padrão (modelo)
├── version                   ← Versão atual
├── compatibilitytool.vdf     ← Manifesto Steam
└── toolmanifest.vdf          ← Manifesto ferramenta
```

### 3.2. Fluxo `proton waitforexitandrun Launcher.exe`

```
1. Proton(base_dir) → descobre paths
2. CompatData(WINEPREFIX) → gerencia prefixo
3. Session.__init__() → copia os.environ, dlloverrides
4. Session.init_wine() →
   ├── Acha wine/wineserver nos paths
   ├── WINEDLLPATH com lib/wine (nvidia, dxvk, etc.)
   ├── WINELOADER = wine-preloader (se existir)
   ├── NTSYNC detection → WINENTSYNC=1
   ├── NVIDIA dll dir discovery (find_nvidia_wine_dll_dir)
   ├── default_compat_config() → perfil por appid
   │   ├── nomfdxgiman, noopwrx11, noopwr (por appid)
   │   ├── nofsync, noesync (por appid)
   │   ├── heapdelayfree, heapzeromemory (por appid)
   │   ├── disablenvapi (por GPU ou appid)
   │   └── gamedrive (sempre)
   └── Aplica compat_config:
       ├── pba, nonpba (async shaders)
       ├── dxvksarek (se GPU sem Vulkan 1.3)
       ├── nvapi, nvcuda, nvenc, nvml, nvoptix
       ├── fsync, esync, ntsync
       └── CPU limit (default_cpu_limit por appid)
5. protonfixes.setup() → PATH, LD_LIBRARY_PATH
6. protonfixes.setup_mount_drives() → S:, T: drives
7. protonfixes.winetricks() → winetricks automáticos
8. g_session.compat_config check:
   ├── PROTON_LOCAL_SHADER_CACHE → localshadercache
   ├── PROTON_FSR3_UPGRADE, PROTON_FSR4_UPGRADE...
   ├── PROTON_USE_OPTISCALER
   └── protonfixes.execute()
9. waitforexitandrun:
   ├── wineserver -w (espera wineserver anterior)
   └── Session.run() → executa jogo
```

### 3.3. Session.run() — O bootstrap final

```python
def run(self):
    # Se UMU_ID: usa umu.exe como bootstrap
    if "UMU_ID" in os.environ:
        if sys.argv[2] é unix path:
            argv = [wine-preloader, wine, "c:\\windows\\system32\\umu.exe"]
        else:  # path dentro do prefixo
            argv = [wine_bin]
    else:  # Modo Steam
        argv = [wine-preloader, wine, "c:\\windows\\system32\\steam.exe"]
    
    # Passa sys.argv[2:] (o exe do jogo) para o bootstrap
    return run_proc(adverb + argv + sys.argv[2:] + cmdlineappend)
```

**O `umu.exe`** é tipo um "steam.exe" simplificado para non-Steam games:
- Lê os argumentos
- Seta `SteamAppId` e `SteamGameId`
- Carrega DLL overrides
- Executa o jogo

---

## 4. ROOT CAUSE: Por que o GF não roda no Makai Time

Baseado no estudo acima, os motivos mais prováveis para o exit -13 (SIGPIPE):

### 🔴 Causa #1: Falta `UMU_ID` no env
O Proton CachyOS detecta `UMU_ID` no environment. Sem ele, o Proton tenta usar `steam.exe` como bootstrap (modo Steam). Se `steam.exe` não existe ou falha, o jogo não inicia.

**Solução**: Setar `UMU_ID` = `GAMEID` no env do container.

### 🔴 Causa #2: `STEAM_COMPAT_SHADER_PATH` não setado
Sem shader cache path, DXVK recompila shaders e pode falhar silenciosamente.

**Solução**: `STEAM_COMPAT_SHADER_PATH = $WINEPREFIX/shadercache`

### 🔴 Causa #3: `WINELOADERNOEXEC` não setado
Proton CachyOS SÓ usa wine-preloader se `WINELOADERNOEXEC=1`. Sem isso, usa `wine` direto (mais lento, pode quebrar compatibilidade).

**Solução**: Setar `WINELOADERNOEXEC=1`

### 🟡 Causa #4: GPU env vars faltando
Sem `VK_ICD_FILENAMES`, `VK_DRIVER_FILES`, `LIBGL_DRIVERS_PATH`, etc., o Vulkan/OpenGL pode não achar os drivers NVIDIA.

### 🟡 Causa #5: /etc/passwd ausente
Alguns jogos/Proton verificam `/etc/passwd` para resolver UID → username.

---

## 5. PLANO DE AÇÃO

### Imediato (fazer AGORA)
1. **Rodar UMU original com GF** para ver o que funciona
2. Comparar env vars que o UMU gera vs Makai Time
3. Identificar qual variável específica faz o jogo rodar

### Curto prazo (implementar)
4. Adicionar `UMU_ID` propagation no builder
5. Adicionar `STEAM_COMPAT_SHADER_PATH`
6. Adicionar `WINELOADERNOEXEC=1`
7. Adicionar todas as GPU env vars que faltam (Fase 1 do gap analysis)
8. Gerar `/etc/passwd` e `/etc/group` sintéticos

### Médio prazo (estudar)
9. Entender o `umu.exe` e replicar sua função
10. Adicionar `STORE` propagation
11. Setup de prefixo completo (symlinks, tracked_files, Z: drive)

---

---

## 6. RESULTADO DO TESTE REAL (18/07/2026)

### 6.1. Execução com UMU original

**Comando:**
```bash
GAMEID=gf \
WINEPREFIX=/home/cas/Games/Makai-forger/gf \
PROTONPATH=/home/cas/.../Proton-CachyOS-11.0-20260602-slr \
STEAM_COMPAT_INSTALL_PATH="/home/cas/.../Grand Fantasia Violet" \
STORE=umu \
umu-run waitforexitandrun "/full/path/to/Launcher.exe"
```

**Resultado: ✅ JOGO RODOU!**
```
Processos observados:
├── python3 proton waitforexitandrun Launcher.exe
├── c:\windows\system32\umu.exe /full/path/to/Launcher.exe  ← bootstrap
├── C:\Violet Games\Grand Fantasia Violet\Launcher.exe      ← launcher
└── C:\...\GrandFantasia.exe EasyFun -a ... -p ...          ← JOGO!
```

### 6.2. Env vars que o UMU setou (do log debug)

| Variável | Valor | Origem |
|----------|-------|--------|
| `WINEPREFIX` | `/home/cas/Games/Makai-forger/gf` | UMU set_env |
| `GAMEID` | `gf` | Host env |
| `PROTONPATH` | Caminho absoluto do Proton CachyOS | Host env |
| `STEAM_COMPAT_APP_ID` | `0` | UMU set_env |
| `STEAM_COMPAT_TOOL_PATHS` | `PROTONPATH:RUNTIME` | UMU set_env |
| `STEAM_COMPAT_LIBRARY_PATHS` | `/home` (mount point detection!) | UMU enable_steam_game_drive |
| `STEAM_COMPAT_MOUNTS` | `PROTONPATH:RUNTIME` | UMU set_env |
| `STEAM_COMPAT_INSTALL_PATH` | Dir do jogo | Host env |
| `STEAM_COMPAT_CLIENT_INSTALL_PATH` | (vazio) | Host env |
| `STEAM_COMPAT_DATA_PATH` | `=WINEPREFIX` | UMU set_env |
| `STEAM_COMPAT_SHADER_PATH` | `WINEPREFIX/shadercache` | UMU set_env |
| `EXE` | Caminho absoluto do Launcher.exe | UMU set_env |
| `SteamAppId` | `0` | UMU set_env |
| `SteamGameId` | `0` | UMU set_env |
| `STEAM_RUNTIME_LIBRARY_PATH` | Host lib paths + game dir | UMU enable_steam_game_drive |
| `STORE` | `umu` | Host env |
| `PROTON_VERB` | `waitforexitandrun` | UMU set_env |
| `UMU_ID` | `gf` | UMU set_env |
| `UMU_INVOCATION_ID` | `e61f90eedd57aaafa02a747064172a43` | UMU set_env |
| `RUNTIMEPATH` | `/home/cas/.local/share/umu/steamrt4` | UMU resolve |

### 6.3. Env vars do host que PASSARAM (UMU NÃO usa --clearenv)

Todas as env vars do shell/herdadas passam para o container:
```
DISPLAY, WAYLAND_DISPLAY, XAUTHORITY
DBUS_SESSION_BUS_ADDRESS, PULSE_SERVER
LANG=pt_BR.UTF-8, LC_*=pt_BR.UTF-8
HOME, USER, PATH, SHELL
XDG_RUNTIME_DIR, XDG_SESSION_TYPE, XDG_CURRENT_DESKTOP
VK_ICD_FILENAMES, __GL_MaxFramesAllowed, __GL_YIELD
LIBVA_DRIVER_NAME
MOZ_ENABLE_WAYLAND, QT_WAYLAND_RECONNECT
```

### 6.4. Diferença crítica: UMU vs Makai Time

| Aspecto | UMU | Makai Time | O que muda |
|---------|-----|------------|------------|
| **clearenv** | ❌ NÃO usa → host env passa | ✅ USA → tudo limpo | Makai precisa setar TUDO explicitamente |
| **UMU_ID** | ✅ `UMU_ID=gf` | ❌ Não seta | Proton detecta e escolhe `umu.exe` vs `steam.exe` |
| **Shader cache** | ✅ `STEAM_COMPAT_SHADER_PATH` | ❌ Não seta | DXVK recompila toda vez |
| **Library paths** | ✅ `STEAM_COMPAT_LIBRARY_PATHS` | ❌ Só default | Jogos em outras partições |
| **Mount point** | ✅ Detecta mount point do jogo | ❌ Fixo `$HOME/.steam/steam` | Jogos fora de $HOME |
| **STORE** | ✅ `STORE=umu` | ❌ Não seta | Proton identifica loja |
| **Runtime lib path** | ✅ Host libs + game dir | ✅ Overrides + runtime + host | Parcial |
| **Isolamento** | `--not-a-security-boundary` | `--unshare-* + --clearenv` | Makai é mais seguro |
| **umu.exe** | ✅ Proton usa umu.exe bootstrap | ❌ Proton usaria steam.exe | Bootstrap correto |

### 6.5. Prova: UMU funciona com Proton CachyOS + GF

**Conclusão**: O Proton CachyOS é TOTALMENTE compatível com o GF. O problema não é o Proton, é a FALTA de env vars e setup correto no Makai Time. O UMU funciona porque:
1. Passa `UMU_ID=gf` → Proton detecta modo UMU → usa `umu.exe`
2. Passa `STEAM_COMPAT_SHADER_PATH` → DXVK usa shader cache
3. NÃO usa `--clearenv` → todas as env vars do host passam (GPU, áudio, display)
4. Usa `pressure-vessel-unruntime` → container aberto sem isolamento

## 7. PRÓXIMOS PASSOS CONCRETOS

### Imediato (para fazer o GF rodar no Makai Time)

1. **Adicionar `UMU_ID=GAMEID`** no environment do container
2. **Adicionar `STEAM_COMPAT_SHADER_PATH=$WINEPREFIX/shadercache`**
3. **NÃO usar `--clearenv`** ou então repovoar com TODAS as env vars do host
4. **Adicionar `UMU_INVOCATION_ID`** (token_hex(16))
5. **Adicionar `STORE=umu`** 
6. **Adicionar `STEAM_COMPAT_LIBRARY_PATHS` dinâmico** (detectar mount point)
7. **Adicionar `STEAM_RUNTIME_LIBRARY_PATH`** com host lib paths

### Curto prazo (paridade com UMU)

8. Copiar `umu.exe` da UMU-Proton para o prefixo (ou criar equivalente)
9. Adicionar `WINELOADERNOEXEC=1` (Proton CachyOS usa wine-preloader)
10. Adicionar GPU env vars que faltam (VK_DRIVER_FILES, VK_LAYER_PATH, etc.)
11. Gerar `/etc/passwd` e `/etc/group` sintéticos

## 8. ANÁLISE DO CONTAINER UMU (AO VIVO)

### 8.1. Como acessar o container UMU ao vivo

```bash
# 1. Achar o processo umu-shim (bootstrap do pressure-vessel)
PID=$(pgrep -f "pv-adverb.*umu-shim" | head -1)

# 2. Acessar /proc/$PID/root/ como se fosse o container
ls /proc/$PID/root/usr/lib/          # Libs do runtime
cat /proc/$PID/environ               # Env vars do processo (separador \0)
cat /proc/$PID/cmdline               # Linha de comando
ls /proc/$PID/root/dev/              # Devices disponíveis
cat /proc/$PID/root/proc/self/mountinfo  # Pontos de montagem
```

**Nota**: O pressure-vessel NÃO usa `--unshare-user` nem `--unshare-pid`, então
os processos são visíveis globalmente e o `/proc/$PID/root/` reflete o root
do container. Com `--unshare-user`, o root apareceria vazio.

### 8.2. Estrutura do container UMU (observado no primeiro run)

```
/ (root)
├── /usr/                         ← Runtime steamrt4 (Debian 13)
│   ├── /usr/lib/
│   │   ├── ld-linux-x86-64.so.2  ← Linker 64-bit (runtime)
│   │   ├── ld-linux.so.2         ← Linker 32-bit (runtime)
│   │   ├── libc.so.6             ← glibc (runtime)
│   │   ├── libcairo*             ← Cairo (runtime)
│   │   ├── libcanberra*          ← Áudio (runtime)
│   │   ├── libpulse*             ← PulseAudio (runtime)
│   │   └── ...
│   └── /usr/lib32/
│       ├── ld-linux.so.2         ← Linker 32-bit (runtime)
│       └── libc.so.6             ← glibc 32-bit (runtime)
├── /lib/ → usr/lib               ← Symlink para /usr/lib do runtime
├── /lib64/ → usr/lib64
├── /lib32/ → usr/lib32
├── /bin/ → usr/bin
├── /sbin/ → usr/sbin
├── /proc/                        ← Proc do host (sem isolamento)
├── /sys/                         ← Sys do host (sem isolamento)
├── /dev/                         ← Devices do host
│   ├── /dev/dri/                 ← (bind seletivo ou host direto)
│   └── /dev/nvidia*              ← (bind seletivo)
├── /etc/
│   └── /etc/passwd               ← ❌ NÃO existe (não gerado)
├── /run/host/                    ← ❌ NÃO existe (sem provider mount)
├── /mnt/                         ← Partições Steam
└── /tmp/
```

### 8.3. Observações críticas da análise

| Observação | Detalhe | Implicação |
|------------|---------|------------|
| **/run/host ausente** | UMU NÃO monta `/run/host` | Não precisa de provider mount porque... |
| **GPU drivers não mapeados explicitamente** | Nenhum `libnvidia*`, `libGL*` ou `libvulkan*` visível em `/usr/lib` | O Proton CachyOS resolve GPU libs internamente |
| **VK_ICD_FILENAMES ausente** | Não estava visível no env do processo filho | Pode estar no processo pai, ou o Proton detecta automaticamente |
| **Linkers no runtime** | `/usr/lib` tem BOTH linkers (32 e 64-bit) | Runtime fornece linkers compatíveis |
| **/lib/i386-linux-gnu vazio** | Não tem libs de compatibilidade 32-bit no runtime | O runtime não usa esse path |
| **Sem /etc/passwd** | Não foi gerado | Pode ser necessário para alguns jogos |

### 8.4. Conclusão: Como o UMU encontra GPU drivers?

O UMU NÃO usa `provider mount` (não tem `/run/host`). Em vez disso:

1. **GPU overrides via pressure-vessel**: O `capsule-capture-libs` (dentro de um container auxiliar) captura APENAS as libs GPU necessárias do host e copia para `/usr/lib/pressure-vessel/overrides/`
2. **Runtime + overrides**: Runtime montado em `/usr`, overrides montados SOBRE `/usr/lib/pressure-vessel/overrides/`
3. **VK_ICD_FILENAMES** aponta para `/usr/share/vulkan/icd.d/nvidia_icd.json` (do override ou do runtime)
4. **Proton resolve o resto**: O script `proton` do Proton CachyOS internamente acha `wine` e libs NVIDIA

**NOSSA abordagem** (provider mount via `/run/host`) é equivalente funcional, mas MAIS SIMPLES:
- Host montado em `/run/host`
- Env vars apontam para `/run/host/usr/share/vulkan/...`
- Symlinks em overrides apontam para `/run/host/usr/lib/...`
- Não precisamos do complexo sistema capsule-capture

### 8.5. Diferença: UMU child process vs parent env vars

No primeiro run, o env do processo child (`umu-shim` ou `wine-preloader`) mostrou:
- Locale vars (`LC_*`, `LANG`)
- `DISPLAY=:1`, `WAYLAND_DISPLAY=wayland-0`
- `MOZ_ENABLE_WAYLAND=1`, `QT_WAYLAND_RECONNECT=1`

NÃO mostrou:
- `VK_ICD_FILENAMES`, `VK_DRIVER_FILES`
- `UMU_ID`, `STEAM_COMPAT_*`
- `UMU_INVOCATION_ID`, `STORE`

Isso sugere que essas vars estão no processo PAI (`umu-run` Python ou `_v2-entry-point`),
e o child process (`wine-preloader`) pode não herdá-las. Ou o Proton as removeu/customizou.

---

## 9. LIÇÕES APRENDIDAS — O QUE COPIAR DO UMU

### 9.1. O que o UMU faz CERTO (e nós precisamos copiar)

1. **Não usar --clearenv cegamente**: Se usar, precisa repovoar TUDO
2. **UMU_ID no env**: Essencial para Proton CachyOS detectar modo UMU
3. **STEAM_COMPAT_SHADER_PATH**: DXVK shader cache
4. **GPU env vars do host**: VK_ICD_FILENAMES, DISPLAY, WAYLAND_DISPLAY, etc.
5. **Locale pass-through**: LANG, LC_*
6. **Setup de prefixo completo**: symlinks, Z: drive, fonts

### 9.2. O que NÃO copiar do UMU

1. **--not-a-security-boundary**: Nós queremos isolamento real
2. **capsule-capture-libs**: Complexo e desnecessário com provider mount
3. **Compartilhar /proc do host**: Nós isolamos com --unshare-pid

### 9.3. Inteligência necessária: Detecção dinâmica do Proton

Em vez de hardcodar flags para Proton-CachyOS, criar módulo que:

```python
# proton_analyzer.py
analysis = analyze_proton("/path/to/Proton-CachyOS-11.0")
analysis.umu_bootstrap    # True → Proton usa umu.exe
analysis.ntsync_support   # True → Proton 11+ suporta NTSYNC
analysis.wine_preloader   # True → usa wine-preloader
analysis.nvidia_dll_dir   # Caminho das DLLs NVIDIA
analysis.x11_needed       # True → precisa de X11
analysis.wayland_needed   # True → Wayland socket
analysis.container_features # Flags bwrap específicas
```

## 10. ANATOMIA DO PROTON CACHYOS (11.0-20260602-slr)

Estrutura real do Proton no disco (confirmado via `ls`):

```
Proton-CachyOS-11.0-20260602-slr/
├── proton                          ← 2451 linhas Python
├── filelock.py
├── utilities.py
├── vulkan.py
├── user_settings.sample.py
├── version                         ← "1781825334 cachyos-11.0-20260602-slr"
├── compatibilitytool.vdf           ← Manifesto Steam
├── toolmanifest.vdf
├── protonfixes/                    ← Fixes específicos por jogo
├── files/
│   ├── bin/
│   │   ├── wine                   ← Wine loader
│   │   └── wineserver             ← Wine server
│   ├── share/
│   │   └── default_pfx/
│   │       └── drive_c/windows/system32/
│   │           ├── steam.exe      ← Steam stub (modo Steam)
│   │           ├── umu.exe        ← UMU stub (modo non-Steam)
│   │           └── lsteamclient.dll
│   └── lib/
│       └── wine/
│           ├── x86_64-unix/
│           │   ├── wine-preloader    ← 64-bit preloader (usado com WINELOADERNOEXEC=1)
│           │   └── wine64-preloader
│           ├── i386-unix/
│           │   └── wine-preloader    ← 32-bit preloader
│           ├── dxvk/                 ← DXVK (d3d9, d3d10, d3d11, dxgi)
│           ├── vkd3d-proton/         ← VKD3D (d3d12)
│           ├── nvidia-libs/          ← NVAPI, NVENC, NVML, NVCUDA, NVOPTIX
│           └── discord-rpc-bridge/   ← Discord RPC
```

### Atributos detectáveis dinamicamente

| Atributo | Como detectar | Proton CachyOS |
|----------|---------------|----------------|
| **umu_bootstrap** | `default_pfx/drive_c/windows/system32/umu.exe` | ✅ |
| **steam_stub** | `default_pfx/drive_c/windows/system32/steam.exe` | ✅ |
| **wine_preloader** | `files/lib/wine/x86_64-unix/wine-preloader` | ✅ |
| **wine64_preloader** | `files/lib/wine/x86_64-unix/wine64-preloader` | ✅ |
| **wine32_preloader** | `files/lib/wine/i386-unix/wine-preloader` | ✅ |
| **nvidia_dlls** | `files/lib/wine/nvidia-libs/` | ✅ (bundled) |
| **dxvk** | `files/lib/wine/dxvk/` | ✅ |
| **vkd3d** | `files/lib/wine/vkd3d-proton/` | ✅ |
| **ntsync** | `version` contém `cachyos-11` → Proton 11+ | ✅ |
| **protonfixes** | `protonfixes/` dir | ✅ |
| **x64_lib_dir** | `files/lib/wine/x86_64-unix/` | ✅ |
| **x32_lib_dir** | `files/lib/wine/i386-unix/` | ✅ |

## 11. REFERÊNCIAS

- UMU-Launcher: `/home/cas/.local/share/umu/steamrt4/` (runtime baixado)
- UMU-Run zipapp: `/home/cas/Documentos/Makai-forge/tools/prefix/umu-run`
- Proton CachyOS: `/home/cas/.config/makai-forger/compat-tools/compatibilitytools.d/Proton-CachyOS-11.0-20260602-slr/`
- Makai Time: `/home/cas/Documentos/Makai-forge/tools/prefix/makai_time/makrun/`
- Gap analysis: `/home/cas/Documentos/Makai-forge/tools/prefix/RELATORIO_GAP_ANALYSIS_MAKAI_VS_UMU.md`
- AGENTS.md (contexto do projeto): `/home/cas/AGENTS.md`
