# Protons Base Engineering — Documentação de Arquitetura

## 1. Anatomia do script `proton` (Python)

Todo Proton é um script Python de ~2200–2400 linhas. A estrutura é IDENTICA entre forks — herdam do mesmo `Proton` base class da Valve. As diferenças são patches incrementais.

### Entry Point (linhas finais do script)

```python
g_proton = Proton()                    # ← classe principal (2300+ linhas)
g_session = Session()                  # ← sessão de execução

if __name__ == "__main__":
    g_session.main()
```

### Fluxo de inicialização (`Session.main()` → `init_session()`)

```
main()
  ├── parse_args()          → lê sys.argv[1] (waitforexitandrun, run, runinprefix, etc.)
  ├── init_steam_paths()    → setup.py da steam runtime, STEAM_COMPAT_*, STEAM_RUNTIME_*
  ├── setup_logging()       → PROTON_LOG, pipe stderr para ~/steam-{id}.log
  ├── tooltip_proton_version()
  └── init_session()
        ├── steam.exe check           → encontra steam.exe no prefixo
        ├── wine_bin / wine64_bin     → detecta binário Wine (lib/wine/...)
        ├── wineserver / wineboot     → detecta tools
        ├── host_pe_arch              → x86_64-windows / i686-windows
        ├── compat_config.parse()     → lê PROTON_ADD_CONFIG + SteamGameId + user_settings.py
        ├── check_environment()       → traduz PROTON_* env vars em compat_config
        │     Ex: PROTON_NO_ESYNC → "noesync"
        │         PROTON_USE_WINED3D → "wined3d"
        │         PROTON_ENABLE_WAYLAND → "wayland"
        ├── env vars setup            → WINEDEBUG, DXVK_LOG_LEVEL, VKD3D_DEBUG
        ├── nvidia NVML detection     → ativa nvml compat_config em GPUs NVIDIA
        └── game-specific workarounds → lista de SteamGameId → configs especiais
```

### Fluxo de execução (`main()` → `run()`)

```
main()
  ├── verb: waitforexitandrun
  │     ├── g_session.run_proc([wineserver, "-w"])  → espera servidor anterior
  │     └── g_session.run()                          → lança jogo
  ├── verb: run
  │     └── g_session.run()
  ├── verb: runinprefix
  │     └── g_session.run_in_prefix()
  └── verb: getcompatpath
        └── print prefix path
```

### Método `run()` — o lançamento

```python
def run(self):
    # 1. steam-runtime-launcher-interface-0 (se existir no $PATH)
    adverb = ['steam-runtime-launcher-interface-0', 'proton']
    #    └─ Ferramenta da Valve que integra pressure-vessel (sandbox Steam)
    #    └─ Se não existir (non-Steam/Wayland), roda direto sem sandbox

    # 2. Decide argv baseado em:
    #    - SteamGameId == "311210"  → Black Ops 3: usa steam.exe
    #    - UMU_ID presente          → usa umu.exe (non-Steam)
    #    - Caso contrário           → usa steam.exe

    # 3. Monta comando final:
    #    adverb + argv + sys.argv[2:] + self.cmdlineappend
    #    sys.argv[2:] = caminho do executável + args extras

    # 4. run_proc() executa com subprocess
    rc = self.run_proc(adverb + argv + sys.argv[2:] + self.cmdlineappend)
```

---

## 2. Árvore de Decisão do `run()`

```
                           ┌──────────────────────┐
                           │   sys.argv[2] existe? │
                           └───────┬──────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                              ▼
              Sim (game)                     Não (prefix)
                    │                              │
         ┌──────────┴──────────┐                   ▼
         ▼                     ▼               wineserver -k
  steam-runtime-exists    no steam-runtime       + steam.exe
         │                     │
         ▼                     ▼
  adverb=[s-r-l-i-0]    adverb=[]
         │                     │
         └──────────┬──────────┘
                    ▼
          ┌─────────────────┐
          │  UMU_ID set?    │
          └────┬────────┬───┘
               │        │
              Sim      Não
               │        │
          ┌────┴─┐   ┌──┴──────────────┐
          │umu   │   │SteamGameId      │
          │.exe  │   │workarounds?     │
          └──────┘   └──┬──────────┬──┘
                        │          │
                       Sim        Não
                        │          │
                   ┌────┴──┐  ┌───┴────────┐
                   │steam  │  │   GE-style │
                   │.exe   │  │  ou UMU    │
                   │BO3    │  │  style?    │
                   └───────┘  └───┬────────┘
                                  │
                     ┌────────────┴────────────┐
                     ▼                          ▼
               GE-style (wine-preloader)   UMU-style (wine64)
               WINELOADERNOEXEC=1           sem preloader
               argv = [wine-preloader,      argv = [wine64, steam.exe]
                       wine, steam.exe]
```

### Diferenças Críticas entre Estilos

| Aspecto | GE-style (GE, CachyOS, DW) | UMU-style (UMU, EM) |
|---------|---------------------------|---------------------|
| **Preloader** | Usa `wine-preloader` diretamente com `WINELOADERNOEXEC=1` | Usa `wine64` (ou `wine`) sem bypass |
| **umu.exe** | Chama `umu.exe` para non-Steam | Chama `umu.exe` para non-Steam |
| **start.exe** | Não usa | EM fork usa `start.exe /unix` em vez de `umu.exe` |
| **CoD BO3** | Mesma workaround | Mesma workaround |
| **remote_debug_cmd** | Suportado | Suportado |
| **cmdlineappend** | Suportado | Suportado |

---

## 3. Compat Config: o sistema de configuração

Cada Proton tem um `compat_config` (instância de `CompatConfig`) que armazena flags booleanas de configuração. Essas flags controlam TUDO:

### Fontes de configuração

```
compat_config = CompatConfig()
  │
  ├── PROTON_ADD_CONFIG (env var)
  │     Ex: PROTON_ADD_CONFIG="wined3d,noesync" → compat_config.add("wined3d"), .add("noesync")
  │     └── Suportado por: UMU, EM
  │     └── NÃO suportado por: GE, CachyOS, DW (usam user_settings.py)
  │
  ├── SteamGameId (workarounds hardcoded)
  │     Ex: SteamGameId=661920 → compat_config.add("oldglstr")
  │     └── Listas de ~30+ jogos específicos com workarounds
  │     └── Presente em TODOS os forks
  │
  ├── user_settings.py (arquivo no diretório do Proton)
  │     └── Suportado por: DW-Proton (único)
  │     └── função: import user_settings; for k,v in user_settings.items(): env[k] = v
  │
  ├── PROTON_USE_WINED3D (env vars → compat_config)
  │     └── Suportado por: TODOS (check_environment)
  │     └── check_environment("PROTON_USE_WINED3D", "wined3d")
  │
  ├── PROTON_* env vars → compat_config (check_environment)
  │     └── ~30+ env vars mapeadas para flags
  ```

### Flags de compat_config e seus efeitos

| Flag | Env Var | Efeito | Presente em |
|------|---------|--------|-------------|
| `wined3d` | `PROTON_USE_WINED3D` | Força WineD3D (sem DXVK) | TODOS |
| `wined3d11` | `PROTON_USE_WINED3D11` | D3D11 via WineD3D | TODOS |
| `noesync` | `PROTON_NO_ESYNC` | Desativa ESync | TODOS |
| `nofsync` | `PROTON_NO_FSYNC` | Desativa FSync | TODOS |
| `nod3d11` | `PROTON_NO_D3D11` | Bloqueia D3D11 | TODOS |
| `nod3d10` | `PROTON_NO_D3D10` | Bloqueia D3D10 | TODOS |
| `oldglstr` | `PROTON_OLD_GL_STRING` | Mesa/NVIDIA GL string antiga | TODOS |
| `wayland` | `PROTON_ENABLE_WAYLAND` | Ativa driver Wayland Wine | TODOS (exceto...) |
| `sdlinput` | `PROTON_PREFER_SDL` | Prefere SDL para input | GE, CachyOS, DW |
| `dxvkllasync` | `PROTON_DXVK_LLASYNC` | DXVK async compile (low latency) | GE, CachyOS, DW |
| `dxvkgplasync` | `PROTON_DXVK_GPLASYNC` | DXVK GPL async | DW (único) |
| `dxvklowlatency` | `PROTON_DXVK_LOWLATENCY` | DXVK low latency mode | GE, CachyOS, DW |
| `nvml` | `PROTON_NVIDIA_NVML` | Ativa NVML no Wine | GE, CachyOS, DW (auto NVIDIA) |
| `nvcuda` | `PROTON_NVIDIA_NVCUDA` | Monta libcuda do host | GE, CachyOS, DW |
| `nvoptix` | `PROTON_NVIDIA_NVOPTIX` | Monta OptiX do host | GE, CachyOS, DW |
| `vkreflex` | `DXVK_NVAPI_VKREFLEX` | NVIDIA Reflex via VK | GE, CachyOS, DW |
| `vkbasalt` | `ENABLE_VKBASALT` | VkBasalt layer | GE, CachyOS, DW |
| `mediaconv` | `PROTON_ENABLE_MEDIACONV` | Media conversion support | GE, CachyOS, DW |
| `gamedrive` | `PROTON_SET_GAME_DRIVE` | Cria drive de jogo | DW (único) |
| `nvidialibs` | `PROTON_NVIDIA_LIBS` | Monta TODAS libs NVIDIA | DW, CachyOS |
| `wow64` | `PROTON_USE_WOW64` | Modo WoW64 | TODOS |
| `nativeags` | `PROTON_NATIVE_AGS` | AMD GPU Services nativo | GE, CachyOS, DW |
| `fsr4hud` | `PROTON_FSR4_INDICATOR` | Indicador FSR4 HUD | GE, CachyOS, DW |
| `dlsshud` | `PROTON_DLSS_INDICATOR` | Indicador DLSS HUD | GE, CachyOS, DW |

### Flags exclusivas por fork

| Fork | Flags exclusivas | Fonte |
|------|-----------------|-------|
| **UMU-Proton** | `PROTON_ADD_CONFIG` auto, lista ~50 jogos em init_session | Fork mais "configurável pelo usuário" |
| **EM-Proton** | `start.exe /unix` em vez de `umu.exe`, `PROTON_ADD_CONFIG` | Foco HDR |
| **DW-Proton** | `user_settings.py`, `dxvkgplasync`, `gamedrive`, `steamdrive`, `nvidialibsno32`, `heapdelayfree`, `heapzeromemory`, `disablenvapi`, `forcenvapi` | Mais env vars que qualquer outro |
| **GE/CachyOS** | `FEX*` config, `xrandr` monitor detection, `wine-preloader` bypass, `vkreflex`, `vkbasalt`, `lowlatencylayer` | Performance-focused |
| **CachyOS** | Derivado direto do GE (idêntico run(), init_session) com patches de otimização CachyOS | Compilação otimizada |

---

## 4. Sandbox: steam-runtime-launcher-interface-0

### A interface crítica

```python
if shutil.which('steam-runtime-launcher-interface-0') is not None:
    adverb = ['steam-runtime-launcher-interface-0', 'proton']
else:
    adverb = []
```

**O que é**: Um executável fornecido pela Steam Runtime (`s-r-l-i-0`) que age como "adverb" (prefixo) do comando. Quando presente, o Proton é lançado DENTRO do pressure-vessel (sandbox da Steam).

**Como funciona**:
1. `steam-runtime-launcher-interface-0 proton run /path/to/game.exe` 
2. O s-r-l-i-0 inicia o pressure-vessel com o runtime Steam
3. Dentro do container, chama o Proton novamente
4. Proton detecta `STEAM_RUNTIME=1` e ajusta paths

**Implicações para Makai Time**:
- Nosso bwrap SUBSTITUI o pressure-vessel
- `s-r-l-i-0` NÃO existe no nosso ambiente (não rodamos dentro da Steam)
- Portanto `adverb = []` SEMPRE no Makai Time
- O Proton roda "fora da sandbox da Steam" → nossa sandbox (bwrap) é o container

### Ambiente sem Steam

Quando rodamos Proton FORA da Steam (nosso caso), as seguintes diferenças se aplicam:

| Aspecto | Com Steam Runtime | Makai Time (bwrap) |
|---------|-----------------|--------------------|
| Sandbox provider | pressure-vessel + s-r-l-i-0 | bwrap + makai_time |
| Runtime libs | Steam Runtime do host | makai-runtime (baixado) |
| GPU drivers | Do host (via pressure-vessel) | Do host (via overrides/) |
| STEAM_COMPAT_* | Setados pelo Steam | Setados pelo play.py |
| steam.exe | Presente no prefixo | Precisa ser injectado |
| steamclient | Presente no sistema | Wine built-in + bind ~/.steam |

---

## 5. Identificação do Proton (fork detection)

### CURRENT_PREFIX_VERSION

Cada fork se identifica com um marcador no prefixo:

| Fork | CURRENT_PREFIX_VERSION | Tamanho do script | Detecção |
|------|----------------------|------------------|----------|
| UMU-Proton-10.0-4 | `UMU-Proton-10.0-4` | ~2315 linhas | Marca d'água + proton_version |
| GE-Proton11-1 | `GE-Proton11-1` | ~2180 linhas | wine --version → "wine-11.0 (GE-Proton..." |
| CachyOS-11.0 | `CachyOS-11.0-100` | ~2230 linhas | wine --version → "wine-11.0 (CachyOS-11.0..." |
| EM-10.0-37 | `EM-10.1000-202` | ~2320 linhas | wine --version → "wine-10.0 (EM-10.1000..." |
| DW-11.0-5 | `dwproton-11.0-5` | ~2220 linhas | wine --version → "wine-11.0 (DW-Proton..." |

### Version file

Todo Proton tem `version` no diretório raiz. Ex:
```
UMU-Proton-10.0-4/version  → "UMU-Proton-10.0-4"
GE-Proton11-1/version      → "GE-Proton11-1"
```

### Wine version string

```
wine-11.0 (UMU-Proton-10.0-4)
wine-11.0 (GE-Proton11-1)
wine-11.0 (CachyOS-11.0-100)
wine-10.0 (EM-10.1000-202)
wine-11.0 (DW-Proton-11.0-5)
```

---

## 6. Mecanismos Específicos por Fork

### UMU-Proton (fork base do GE)

**Diferenciador**: Foco em non-Steam (UMU = "Umu Multi-User"). 
- `PROTON_ADD_CONFIG` permite configurar compat_config via env var
- Lista extensa de ~45 SteamGameId com workarounds (Claybook, SMITE, Farming Simulator, etc.)
- `nofsync` desativa WINEESYNC (diferente dos outros que desativam WINEFSYNC)
- Tratamento especial para `3347400` (Girls Frontline: Exilium 2) — não usa steam.exe

### GE-Proton (GloriousEggroll)

**Diferenciador**: Performance + bleeding edge.
- `wine-preloader` bypass com `WINELOADERNOEXEC=1` — elimina restart via start.exe
- FEX emulator config (`STEAM_FEX_TSOENABLED`, `STEAM_FEX_MULTIBLOCK`)
- `xrandr` detection para monitor primário
- VkBasalt, NVIDIA Reflex (vkreflex), Low Latency Layer
- `PROTON_MEDIA_FORCE_GST` pra Darksiders Warmastered (462780)
- Compiler threads = `cpu_count() - 2` (se > 4 cores)

### Proton-CachyOS

**Diferenciador**: Derivado direto do GE com patches de compilação CachyOS.
- Mesmo `run()` e `init_session()` do GE (idênticos)
- Otimizações de compilação (CachyOS scheduler, patches kernel)
- Único fork que não tem `remote_debug_proc` kill/terminate no final do `run()`
- DXVK GPL async NÃO presente (diferente de DW)

### Proton-EM (HDR fork)

**Diferenciador**: Foco em HDR + compatibilidade.
- Usa `start.exe /unix` em vez de `umu.exe` para executáveis Unix
- Mantém `PROTON_ADD_CONFIG` (como UMU)
- Não usa `wine-preloader` bypass
- Usa `wine64_bin` consistently
- `CURRENT_PREFIX_VERSION`= `EM-10.1000-202` (versão própria)

### DW-Proton (DXVK-Wine)

**Diferenciador**: Mais features de todas.
- `user_settings.py` — arquivo Python importado para configs customizadas
- `dxvkgplasync` — DXVK GPL async (único fork)
- `nvidialibsno32` — só libs NVIDIA 64-bit
- `heapdelayfree`, `heapzeromemory` — tweaks de memória Wine
- `disablenvapi`, `forcenvapi` — controle sobre NVAPI
- `gamedrive`, `steamdrive` — drives virtuais
- Também usa `wine-preloader` bypass (GE-style)

---

## 7. Proton Intelligence (para Makai Time)

### Como detectar um Proton

| Método | Código | Exemplo |
|--------|--------|---------|
| `version` file | `open(f"{proton_dir}/version").read().strip()` | `"UMU-Proton-10.0-4"` |
| wine --version | `subprocess.run([wine, "--version"], capture_output=True)` | `"wine-11.0 (GE-Proton11-1)"` |
| CURRENT_PREFIX_VERSION | `grep "CURRENT_PREFIX_VERSION" proton` | `'CURRENT_PREFIX_VERSION="GE-Proton11-1"'` |
| Diretório dist/ | `os.path.isdir(f"{proton_dir}/dist")` | Contém DLLs, VKD3D, DXVK |
| Proton script | `os.path.isfile(f"{proton_dir}/proton")` | Sempre presente |

### O que Makai Time precisa saber sobre cada Proton

```python
# Estrutura de fork definition (para intel.py)
{
    "fork": "dw-proton",
    "detect_pattern": "DW-Proton",
    "skip_nvidia": False,       # Proton já monta libs NVIDIA?
    "container_relaxations": [], # Precisa de permissões extras?
    "env_overrides": {
        "WINEDEBUG": "-all",
        "DXVK_LOG_LEVEL": "none",
    },
    "features": {
        "wine_preloader_bypass": True,  # GE-style (WINELOADERNOEXEC)
        "umu_support": True,            # UMU_ID detection
        "user_settings": True,          # DW-style user_settings.py
        "proton_add_config": False,     # UMU/EM style PROTON_ADD_CONFIG
        "fex_config": False,            # GE-style FEX emulator
        "nvidia_reflex": True,          # vkreflex layer
        "vkbasalt": True,               # VkBasalt layer
        "dxvk_gpl_async": True,         # DW-style GPL async
        "hdr": False,                   # EM-style HDR
        "start_unix": False,            # EM-style start.exe /unix
    }
}
```

### Como "ignorar" o Proton engine (complementar com nosso container)

O Proton script assume que:
1. **Não há sandbox externa** — ele mesmo configura env vars e espera rodar direto
2. **STEAM_COMPAT_* estão setados** — quem chamou (Steam ou launcher) já preparou
3. **O working directory é o jogo** — ele executa de onde foi chamado
4. **LD_LIBRARY_PATH é gerenciado pelo pressure-vessel** — se existir s-r-l-i-0

Nosso bwrap SUBSTITUI o pressure-vessel. Portanto:
- Ignoramos o `adverb` (s-r-l-i-0) — nunca disponível
- Fornecemos nosso próprio `LD_LIBRARY_PATH` (overrides → runtime → host)
- Fornecemos nosso próprio sandbox (bwrap → makai-runtime)
- O Proton script roda DENTRO do container e configura env vars adicionais
- Nosso container fornece o `STEAM_COMPAT_*` que o Proton espera

### Pipeline de env vars (ordem de aplicação)

```
1. Makai Time (bwrap --clearenv + nossas env vars)
     ├── MAKAI_RUNTIME=1
     ├── container=makai
     ├── STEAM_COMPAT_DATA_PATH={prefixo}
     ├── STEAM_COMPAT_CLIENT_INSTALL_PATH=~/.steam/steam
     └── LD_LIBRARY_PATH = overrides:runtime:host

2. Makai Time (env vars de display/GPU)
     ├── DISPLAY=:1 / WAYLAND_DISPLAY=wayland-0
     ├── DXVK_CONFIG=...
     └── VK_ICD_FILENAMES=...

3. Proton script init_session()
     ├── WINEDEBUG=-all
     ├── WINEESYNC=1 / WINEFSYNC=1
     └── STEAM_COMPAT_* re-setados

4. Proton script run()
     └── WINELOADERNOEXEC=1 (GE-style)

5. wine64 / wine-preloader (executado via subprocess.Popen)
```

---

## 8. Referências Técnicas

### Caminhos dentro do Proton

```
proton/
├── proton              ← Script Python principal (~2300 linhas)
├── version             ← Identificador do fork
├── dist/               ← DLLs Windows (VKD3D, DXVK, wine-mono, wine-gecko)
│   ├── lib/
│   │   └── wine/       ← Wine libs (.so)
│   └── share/          ← Vulkan layers, icd files
├── filelock.py         ← Lock file boilerplate
├── fonts/              ← Fontes Wine Tahoma
├── gtu.py              ← Game Troubleshooting Utils
├── lgi.py              ← Linux Game Interaction
├── lsteamclient/       ← Steam client stub source
├── makepkg/            ← Script de build
├── setup.py            ← Steam runtime setup (lutris, flatpak, sandbox)
├── toolkit_*           ← Proton Toolkit (winecfg wrapper)
└── user_settings.py    ← (DW-Proton only) usuário edita esse arquivo
```

### binários do Wine

```
proton/dist/lib/wine/
├── x86_64-unix/
│   ├── wine-preloader  ← ELF loader (usado por GE-style)
│   ├── wine            ← Wine Unix lib (linked pelo preloader)
│   └── *.so            ← Wine DLLs Unix-side
├── x86_64-windows/
│   └── *.dll           ← Wine DLLs Windows-side
├── i386-unix/          ← (se WoW64)
└── i386-windows/       ← (se WoW64)
```

### Env vars que Proton espera

| Env Var | Setado por | Uso |
|---------|-----------|-----|
| `STEAM_COMPAT_DATA_PATH` | Steam/Launcher | Caminho do prefixo |
| `STEAM_COMPAT_CLIENT_INSTALL_PATH` | Steam/Launcher | ~/.steam/steam |
| `SteamGameId` | Steam | Game ID para workarounds |
| `SteamAppId` | Steam | App ID |
| `UMU_ID` | UMU-Launcher | Non-Steam game ID |
| `PROTON_LOG` | Usuário | Habilita logging |
| `PROTON_ADD_CONFIG` | Usuário | Config extra (UMU/EM) |
| `WINEPREFIX` | Proton | Prefixo (opcional, deriva de STEAM_COMPAT_DATA_PATH) |

---

## 9. Resumo: O que cada fork adiciona ao Proton base

```
Proton Base (Valve/Wine)
│
├── + UMU-Proton (GloriousEggroll)
│   ├── Non-Steam game support (umu.exe)
│   ├── PROTON_ADD_CONFIG
│   └── Workaround lista massiva (~50 jogos)
│
├── + GE-Proton (GloriousEggroll)
│   ├── wine-preloader bypass (performance)
│   ├── FEX emulator config
│   ├── VkBasalt + Reflex + Low Latency layers
│   └── DXVK async compiler tuning
│
├── + CachyOS (derivado GE)
│   └── Compilação otimizada + patches kernel
│
├── + EM-Proton (fork HDR)
│   ├── start.exe /unix
│   ├── PROTON_ADD_CONFIG
│   └── HDR patches no Wine
│
└── + DW-Proton (fork features)
    ├── user_settings.py
    ├── DXVK GPL async
    ├── NVIDIA libs control
    ├── Memória heap tweaks
    ├── NVAPI toggle
    └── Game drive virtualization
```

---

## 10. Conclusão para Makai Time

1. **Todos os Protons são 99% iguais** — herdam a mesma base class Valve. As diferenças são patches incrementais de ~50-200 linhas.

2. **O Proton não sabe que está em container** — ele configura env vars para o Wine como se fosse rodar direto. Nosso bwrap é invisível para ele.

3. **Nosso trabalho** é fornecer o ambiente que o Proton espera:
   - `STEAM_COMPAT_*` paths
   - Wine funcional + DLLs
   - GPU drivers + Vulkan
   - Runtime libs (makai-runtime)
   - Filesystem isolado (bwrap)

4. **A `intel.py`** deve mapear cada fork → suas flags específicas (skip_nvidia, env_overrides, container_relaxations) com base nos padrões de detecção documentados na seção 7.

5. **O `proton` script é o entry point** — sempre `proton run` ou `proton waitforexitandrun`. Nosso launcher chama isso dentro do bwrap.
