# Makai Forge Runtime Architecture

## O que é

Substituto completo para o Steam Runtime (pressure-vessel + _v2-entry-point + steamrt4).
Isola qualquer Proton/Wine em container Bubblewrap com GPU/áudio/display do host.

## Arquitetura

```
┌──────────────────────────────────────────────────────┐
│                   bwrap container                     │
│  ┌──────────────────────────────────────────────────┐│
│  │               Steam Runtime (steamrt4)            ││
│  │  /lib → libc, libstdc++, libgcc, ld-linux        ││
│  │  (consistente entre distros)                     ││
│  ├──────────────────────────────────────────────────┤│
│  │               Host overlays                       ││
│  │  /usr/lib64 → libnvidia-*, libvulkan, libGL      ││
│  │  /dev/dri, /dev/nvidia* → GPU devices            ││
│  │  /tmp/.X11-unix, /run/user/... → Display/Audio   ││
│  ├──────────────────────────────────────────────────┤│
│  │               Proton/Wine (qualquer fork)         ││
│  │  /home/cas/.config/.../Proton-CachyOS-...        ││
│  │  /home/cas/Games/.../prefixo/                     ││
│  │  /home/cas/Downloads/.../Game.exe                ││
│  └──────────────────────────────────────────────────┘│
│   --unshare-all (mount, PID, net, IPC, user, cgroup) │
│   --dev /dev (devtmpfs próprio sem caps)              │
│   --tmpfs /tmp (/tmp isolado)                         │
└──────────────────────────────────────────────────────┘
```

## Como substitui o Steam Pipeline

| Componente Steam | Makai Forge | Arquivo |
|---|---|---|
| `pressure-vessel` (bwrap wrapper) | `bwrap` direto + `--dev /dev` + `--unshare-all` | `container.py:build_bwrap_cmd()` |
| `_v2-entry-point` (runtime setup) | `_find_runtime_root()` + `--ro-bind /rt/lib /lib` | `container.py:193-227` |
| `steamrt4` (runtime libs) | Mesmo steamrt4, baixado por `core.py` | `STEAM_RUNTIME_DIR` |
| GPU injection (NVIDIA/AMD/Intel) | `gpu_bind_mounts()` + `--dev-bind /dev/nvidia*` | `container.py:118-134, 211-217` |
| Audio (PipeWire/Pulse) | `display_mounts()` → bind `$XDG_RUNTIME_DIR` | `container.py:139-170` |
| Display (X11/Wayland) | `display_mounts()` → bind sockets | `container.py:139-170` |
| D-Bus | `--ro-bind /run/dbus` | `container.py:167-168` |
| Proton selection | `proton-tools` catalog (20+ forks) | `tools/proton-tools/main/services/tools.ts` |
| Per-game config | `core/Games/` handlers + games_registry.py | — |

## Teste realizado

**Jogo**: How to Raise a Happy NEET (NW.js/Chromium)
**Proton**: CachyOS-11.0-100 (instalado por `proton-tools`)
**Prefix**: `/home/cas/Games/Makai-forger/how-to-raise-a-happy-neet/`
**Runtime**: `steamrt4_platform_4.0.20260714.251823`

### Resultados

| Subsistema | Status | Evidência |
|---|---|---|
| **GPU** | ✅ Renderizando | 18% utilização sustentada, 51°C (nvidia-smi) |
| **OpenGL** | ✅ Carregado | `opengl32.dll` builtin, `libGLX_nvidia.so` no maps |
| **D3D** | ✅ Via WineD3D | `d3d9.dll`, `d3d11.dll`, `dxgi.dll` builtin |
| **VKD3D** | ✅ Carregado | `libvkd3d-1.dll`, `libvkd3d-shader-1.dll` |
| **Áudio** | ✅ Conectado | Nó `alsa_playback.wine-preloader` no PipeWire |
| **Display** | ✅ Conectado | DISPLAY=:1, WAYLAND_DISPLAY=wayland-0 |
| **Namespace** | ✅ Isolado | PID/mount/net/user separados |
| **Processo** | ✅ Vivo | 5+ seg sem crash |

### DLLs carregadas (Wine debug + /proc/maps)

```
ntdll.dll, kernel32.dll, kernelbase.dll, msvcrt.dll, ucrtbase.dll
opengl32.dll          → GL rendering (Chromium/ANGLE)
libvkd3d-1.dll        → D3D12 → Vulkan translation
libvkd3d-shader-1.dll → Shader compilation
wined3d.dll           → D3D11→OpenGL fallback
dxgi.dll              → DXGI (format negotiation)
d3d11.dll, d3d10.dll, d3d9.dll → DirectX layers
dxva2.dll             → Video acceleration
nw_elf.dll            → NW.js executable loader
nw.dll                → NW.js runtime (84MB, Chromium + node.js)
node.dll              → Node.js engine
ffmpeg.dll            → Audio/video decoding
libEGL.dll, libGLESv2.dll → ANGLE (GLES → GL translation)
icudtl.dat            → Unicode/ICU data
```

## Funciona com qualquer Proton

O container não depende de um Proton específico. Testado com:

- **UMU-Proton-10.0-4**: `wine notepad.exe`, `proton run cmd.exe`
- **Proton-CachyOS-11.0**: `wine Game.exe` (How to Raise a Happy NEET)

Basta passar o caminho do Proton desejado:

```python
container.run_in_container(
    [proton_path + "/files/bin/wine", "Game.exe"],
    proton_path=proton_path,   # qualquer Proton do catálogo
    prefix_path=prefix_path,
    game_path=game_path,
)
```

## Fluxo completo (visão)

```
games_registry.py              → detecta jogo, lê config
     ↓
ProtonRecommendationService    → recomenda Proton (tools.ts)
     ↓
core.py (ensure_steam_runtime) → baixa steamrt4 se necessário
     ↓
container.run_in_container()   → bwrap + steamrt4 + GPU/audio/display
     ↓
Proton/Wine executado dentro   → jogo renderiza, áudio toca
```

## Por que não criar Proton próprio

O projeto gerencia **20+ forks** de Proton/Wine (tools.ts), cada um otimizado para jogos específicos:

- **Valve Proton**: oficial, ampla compatibilidade
- **Proton-GE**: patches extras, FSR, GameMode
- **Proton-CachyOS**: otimizações de compilador
- **UMU-Proton**: foco em jogos não-Steam
- **DW-Proton**: anti-cheat, EAC
- **Wine-Staging-Tkg**: experimental, patches avançados
- **DXVK / VKD3D-Proton**: tradução D3D separada

O container aceita qualquer um — não precisa (nem deve) criar o próprio.

## Próximos passos

1. Conectar `container.run_in_container()` no `play.py`
2. Resolver `steam_api.dll` para jogos com DRM (steamclient.fake)
3. Testar com jogos maiores (Skyrim, etc.)
4. Testar com AMD/Intel GPUs
5. Testar com todos os Protons do catálogo

---

# Anotações do Estudo: pressure-vessel (steam-runtime-tools)

> Estudo feito em 15/07/2026 lendo `runtime.c`, `bwrap.c`, `wrap.c` do pressure-vessel.

## O que é o Steam Runtime 4 (steamrt4)

Extraído de `files/lib/os-release` no runtime baixado:

| Campo | Valor |
|---|---|
| `PRETTY_NAME` | Steam Runtime 4 |
| `VERSION_ID` | 4 |
| `DEBIAN_VERSION_FULL` | 13.6 (Debian 13 "Trixie") |
| `ID` | steamrt |
| `ID_LIKE` | debian |
| `BUILD_ID` | 4.0.20260714.251823 |
| `VARIANT` | Platform |
| `VARIANT_ID` | com.valvesoftware.steamruntime.platform-amd64_i386-steamrt4 |
| `HOME_URL` | https://store.steampowered.com/ |

É Debian 13 (Trixie) congelado, multiarch amd64 + i386.

## Como a Steam monta o runtime (pressure-vessel)

### Estrutura do tarball baixado (`SteamLinuxRuntime_4.tar.xz`)

```
steamrt4_platform_4.0.YYYYMMDD.NNNNNN/
├── files/              # Conteúdo do runtime (Flatpak-style merged /usr)
│   ├── lib/
│   │   └── os-release  # ← identificação do runtime
│   ├── bin/
│   ├── sbin/
│   ├── lib/            # libc, libstdc++, ld-linux, etc.
│   ├── lib32/          # i386 libs
│   ├── lib64/          # amd64 libs
│   ├── usr/ → .        # merged /usr (usr é o root)
│   └── .ref            # lock file
├── metadata            # Flatpak metadata
├── usr-mtree.txt.gz    # Manifesto do conteúdo
```

### Pipeline de inicialização (`pv_runtime_bind()`)

```
pv_runtime_bind()
├── bind_runtime_base()          ← monta runtime como root
│   ├── pv_bwrap_bind_usr()     ← --ro-bind <runtime>/usr /usr, /lib, /bin, etc.
│   ├── bind_gfx_provider()     ← --ro-bind <provider>/ /run/host
│   ├── bind_mutable[]          ← etc/, var/cache/, var/lib/ (arquivo por arquivo)
│   │   ├── ignora dont_bind[]  ← /etc/asound.conf, /etc/ld.so.cache, /etc/machine-id
│   │   ├── from_host[]         ← /etc/hosts, /etc/resolv.conf, /etc/host.conf
│   │   └── from_provider[]     ← /etc/amd, /etc/drirc, /etc/nvidia (vem do provider GPU)
│   ├── --dir /tmp, /var, /var/tmp
│   ├── --symlink ../run /var/run
│   ├── /etc/machine-id (do host ou /var/lib/dbus/machine-id)
│   ├── /etc/passwd + /etc/group sintéticos (gerados)
│   └── CA certificates do host
│
├── bind_runtime_ld_so()        ← regenera ld.so.cache
│   └── executa pv-adverb --regenerate-ld.so-cache
│       com runtime libs + overrides GPU
│
├── pv_runtime_use_provider_graphics_stack()  ← ★ coração
│   ├── pv_runtime_provide_container_access() ← bwrap auxiliar
│   │   para rodar capsule-capture-libs dentro
│   │   do runtime (antes do container final)
│   └── Para cada arquitetura (x86_64 + i386):
│       ├── icd_stack_enumerate() ← descobre drivers GPU do host
│       │   ├── DRI drivers: /usr/lib/dri/*_dri.so
│       │   ├── GBM backends: /usr/lib/gbm/*.so
│       │   ├── Vulkan ICDs: lê JSONs, extrai libvulkan.so
│       │   ├── EGL drivers: lê JSONs glvnd, extrai libEGL_*.so
│       │   ├── GLX: libGLX_mesa.so.0, libGLX_nvidia.so.0
│       │   ├── VA-API: /usr/lib/dri/*_drv_video.so
│       │   ├── VDPAU: /usr/lib/vdpau/*.so
│       │   ├── OpenXR: runtime + layers JSONs
│       │   └── Vulkan layers: explícitas + implícitas
│       ├── collect_*_libraries_patterns() ← monta lista de
│       │   padrões glob pra capsule-capture-libs
│       ├── pv_runtime_capture_libraries() ← executa
│       │   capsule-capture-libs DENTRO do runtime pra
│       │   COPIAR só as libs necessárias para overrides/
│       └── resultados em <overrides>/<arch>/lib/<libs>
│
├── bind_runtime_finish()       ← remates
│   ├── pv_bwrap_copy_tree()   ← overrides (--dir + --symlink)
│   ├── /etc/localtime          ← symlink ou bind do host
│   └── /etc/timezone           ← gerado
│
└── Vulkan/OpenXR layer masking ← esconde layers do host
    └── pv_exports_mask_or_log() ← monta diretórios vazios
        sobre ~/.local/share/vulkan, etc.
```

### pv_bwrap_bind_usr() — montagem do runtime

```
pv_bwrap_bind_usr(runtime_path, container_root="/")
├── --ro-bind <runtime>/usr     /usr        # se /usr existe no runtime
│   (ou --ro-bind <runtime> /usr se merged /usr)
└── Para cada entry em runtime_root/
    ├── lib, lib32, lib64, bin, sbin:
    │   ├── --ro-bind <runtime>/<entry> /<entry>   (se diretório)
    │   └── --symlink <target> /<entry>            (se symlink)
    └── .ref: --ro-bind <runtime>/.ref /.ref
```

## GPU driver detection (o que falta no Makai Time)

### O que fazemos hoje (errado)
```
--ro-bind /usr/lib64 /usr/lib64    # TUDO do host — muito agressivo
--ro-bind /usr/lib   /usr/lib      # traz libs desnecessárias
```

### O que a Steam faz (certo)
```
1. Monta runtime como base (libc, libstdc++, ld-linux do steamrt4)
2. Sobe container auxiliar com runtime + host /
3. Dentro dele, roda capsule-capture-libs com patterns tipo:
   - libGLX*.so*, libEGL*.so*, libGL*.so*
   - libvulkan*.so*, libVkLayer_*.so*
   - libdrm*.so*, libgbm*.so*
   - libnvidia-*.so*, libcuda*.so*
   - libva*.so*, libvdpau*.so*
   - JSONs: nvidia_icd.json, mesa_icd.json, glvnd/egl_*.json
   - DRI drivers: *dri.so
   - GBM backends: *gbm.so, etc.
4. Copia SÓ essas libs + JSONs para <overrides>/<arch>/lib/
5. Monta overrides sobre runtime: --ro-bind <overrides>/lib /<arch>/lib
6. Regenera ld.so.cache com runtime como base + overrides GPU
```

### O que precisamos implementar
- Detecção NVIDIA vs AMD vs Intel (já temos em `gpu_bind_mounts()`)
- Em vez de montar `/usr/lib64` inteiro, montar só as libs GPU necessárias
- Criar diretório de overrides, copiar libs detectadas
- Montar overrides com prioridade sobre runtime libs
- Regenerar ld.so.cache (ou usar LD_LIBRARY_PATH)

## LD_LIBRARY_PATH construction

A Steam constrói:
```
LD_LIBRARY_PATH=<runtime>/lib:<runtime>/lib/<arch>:\
                <overrides>/lib:<overrides>/lib/<arch>
```

E então executa `ldconfig -f /etc/ld.so.conf -C /etc/ld.so.cache` com as
libs do runtime + overrides.

## Outras descobertas importantes

### Mutable sysroot (para FEX-Emu / emuladores)
- Se `PV_RUNTIME_FLAGS_COPY_RUNTIME`, copia runtime para `/var/pressure-vessel/<hash>/`
- Usa `--bind` (não `--ro-bind`) pra permitir modificações
- Necessário para FEX-Emu (emulação x86 em ARM) e Steam Snap

### GC de runtimes
- `pv_runtime_garbage_collect()` limpa runtimes antigos em `/var/pressure-vessel/`
- Usa file locks (`.ref`) pra detectar se ainda está em uso
- Roda no início de `pv_runtime_initable_init()`

### Proteção de home directories
- `pv_exports_mask_or_log(exports, "/home")` — esconde /home de outros usuários
- Só expõe o home do usuário atual (modo shared) ou um diretório privado

### pv-adverb (executável auxiliar)
- Executável C em `pressure-vessel/pv-adverb/`
- Roda dentro do container auxiliar para:
  - Regenerar ld.so.cache
  - Rodar capsule-capture-libs
  - Copiar configs GPU do host
- Localizado em `<pv_prefix>/pv-adverb`

### steamrt4 é Flatpak-style
- Usa `usr-mtree.txt.gz` para descrever o conteúdo exato de /usr
- `files/` é um merged /usr (o conteúdo de /usr está na raiz de files/)
- `metadata` é um arquivo GKeyFile estilo Flatpak
- `files/.ref` é o lock file

---

# Perguntas e Respostas (estudo conceitual, 15/07/2026)

## 1. O runtime tem um kernel próprio?

**Não.** O Steam Runtime é 100% userspace. Zero linhas de código de kernel.

O bwrap cria namespaces Linux (mount, PID, net, IPC, user, cgroup) que ISOLAM a
visão do processo, mas TODAS as chamadas de sistema (syscalls) vão diretamente
para o KERNEL DO HOST. Não existe "kernel do runtime". O kernel que o Proton vê
é o mesmo kernel do sistema.

```
Processo dentro do container
    ↓
syscall (open, read, write, ioctl, mmap, clone, etc.)
    ↓
KERNEL DO HOST (Arch, Ubuntu, etc.)
    ↓
Hardware (GPU, CPU, RAM, disco)
```

O container NÃO adiciona overhead nas syscalls. É idêntico a rodar nativo.
Benchmarks independentes mostram que containers Linux têm < 2% de overhead
de performance comparado a nativo (para GPU compute, o overhead é
frequentemente 0-1%).

## 2. Vale a pena usar libs do Arch se o host for Arch?

Resposta curta: **não para libc/libstdc++, mas sim para GPU.**

O propósito FUNDAMENTAL do runtime é fornecer **ABI consistente**. Um jogo
compilado contra steamrt4 (libc 2.40, libstdc++ 6.0.33) roda IGUAL em Arch
(libc 2.41), Ubuntu (libc 2.35) e Fedora (libc 2.39). Se o runtime usasse
as libc do host, o jogo compilado contra Debian quebraria no Arch porque a
libc do Arch pode ter comportamento diferente ou símbolos removidos.

ONDE FAZ SENTIDO usar libs do host:
- **GPU drivers** (Vulkan, OpenGL, EGL, VA-API) — precisam casar com o kernel
  module carregado. Já fazemos isso.
- **Kernel-specific libs** — se existir algo que só o kernel do host suporta

ONDE NÃO FAZ SENTIDO:
- **libc, libstdc++, libgcc_s** — bibliotecas de sistema que definem a ABI
- **libpthread, librt, libm** — parte da libc
- **ld-linux** — o linker, precisa ser compatível com as libs do runtime

### Middle ground (o que podemos fazer)
Uma otimização que o pressure-vessel NÃO faz mas poderíamos considerar:
detectar se a libc do host é COMPATÍVEL com a do runtime (mesma versão major,
mesmo SONAME) e pular a montagem da libc do runtime. Mas na prática a libc
do runtime é SEMPRE usada porque é a garantia de compatibilidade.

## 3. E se runtime e Proton se comunicassem? Daria pra reduzir input lag?

### Como funciona hoje

```
[Game.exe] → chamada Windows (ex: WaitForMultipleObjects)
    ↓
[Proton/Wine] → traduz para chamada Linux
    ↓    (esync: usa eventfd, fsync: usa futex, ntsync: usa /dev/ntsync)
[Runtime] → fornece as libs (libc.so.6, libpthread.so.0)
    ↓
[Kernel] → executa a syscall
    ↓
[Hardware]
```

O runtime e o Proton NÃO se comunicam. O runtime só fornece o filesystem
(as libs). O Proton executa dentro do filesystem do runtime como se fosse
nativo.

### O que já existe (comunicação indireta)

O pressure-vessel define variáveis de ambiente que o Proton pode ler:
- `STEAM_RUNTIME=1` — Proton sabe que está num runtime containerizado
- `PRESSURE_VESSEL_FILESYSTEMS` — lista de filesystems montados
- `LD_LIBRARY_PATH` — Proton pode inspecionar

O Proton usa essas variáveis para:
- Desligar detecção de certos drivers
- Configurar caminhos de VA-API, VDPAU
- Escolher entre esync/fsync/ntsync

### Dá pra ir além? (hipótese)

Sim, o Makai Time poderia inovar aqui. Idéias:

**A. Container-aware Proton config**
Se o runtime souber exatamente qual GPU está sendo usada (através da detecção
que já fazemos), poderia EXPOR isso ao Proton via variável de ambiente:
`MAKAI_GPU_VENDOR=NVIDIA`, `MAKAI_GPU_ARCH=RTX4090`,
`MAKAI_VULKAN_DRIVER_VERSION=570.86.03`.

O Proton poderia usar isso para:
- Escolher a melhor configuração de DXVK/VKD3D (ex: dxvk.conf otimizado)
- Ativar/desativar features específicas da GPU
- Pular detecção de hardware que o runtime já fez

**B. Input lag — o que realmente importa**

Input lag em Proton vem de 3 fontes, em ordem de impacto:

1. **Sincronização de threads (MAIOR FONTE)** — jogos Windows multi-thread
   fazem milhares de chamadas de sincronização (mutex, semaphore, event) por
   segundo. O Proton precisa traduzir cada uma.

   Usando `esync` (eventfd) → 5-15% overhead
   Usando `fsync` (futex) → 1-5% overhead
   Usando **NTSYNC** (`/dev/ntsync`, kernel 6.14+) → < 1% overhead, além de
   ser semanticamente correto (comportamento idêntico ao Windows).

   O NTSYNC é o GRAAL da redução de input lag no Proton. Foi desenvolvido
   por Elizabeth Figura (CodeWeavers) por 2+ anos, merged no kernel 6.14
   (janeiro 2026), e está no Proton 11+ / Wine 11+.

   Benchmarks oficiais:
   - Dirt 3: 110 → 860 FPS (+678%)
   - Resident Evil 2: 26 → 77 FPS (+196%)
   - Call of Juarez: 99 → 224 FPS (+125%)
   (Nota: esses números comparam NTSYNC vs vanilla Wine SEM esync/fsync.
   Para usuários de Proton (que já têm fsync), o ganho é menor mas ainda
   significativo em jogos CPU-bound.)

2. **Tradução de eventos de entrada (médio impacto)** — O servidor X11 ou
   Wayland envia eventos de mouse/teclado para o Proton, que traduz para
   eventos Windows. Wayland é inerentemente mais rápido que X11 porque
   tem menos latência na cadeia de eventos. O runtime poderia forçar
   Wayland se disponível (o pressure-vessel já faz isso parcialmente).

3. **Wine server contention (impacto menor com ntsync)** — O wineserver
   é um processo separado que gerencia sincronização. Com ntsync, as
   synccalls vão direto pro kernel, eliminando o round-trip pro wineserver.

**C. Nossa oportunidade**

O Makai Time poderia ser o PRIMEIRO runtime a fazer detecção de
ntsync/fsync/esync e EXPOR isso de forma inteligente:

```python
# Detectar se o kernel suporta ntsync
if os.path.exists("/dev/ntsync"):
    env["MAKAI_SYNC"] = "ntsync"
    # Proton 11+ usa ntsync automaticamente
elif os.path.exists("/proc/self/fsync"):
    env["WINEFSYNC"] = "1"
    env["MAKAI_SYNC"] = "fsync"
else:
    env["WINEESYNC"] = "1"
    env["MAKAI_SYNC"] = "esync"
```

Nenhum launcher (nem Lutris, nem Heroic) faz isso de forma integrada
com o runtime. Eles dependem do Proton detectar sozinho.

## 4. Alguém está pesquisando isso?

### NTSYNC — a maior inovação recente (2024-2026)

Elizabeth Figura (CodeWeavers) desenvolveu o NTSYNC driver para o kernel
Linux como uma alternativa semanticamente correta ao esync/fsync.

- **2023**: primeiros patches, discussão na LKML
- **2024**: testes públicos, benchmarks de até 678% de ganho
- **Janeiro 2026**: merged no kernel 6.14
- **Março 2026**: Wine 11.0 lançado com suporte nativo a NTSYNC
- **Abril 2026**: Proton 11 beta baseado no Wine 11 com NTSYNC
- **SteamOS 3.7.20 beta**: módulo ntsync carregado por padrão

### VKD3D-Proton 3.0 (Novembro 2025)
- Shader backend reescrito (compartilhado com DXVK)
- AMD FSR 4 + Anti-Lag em jogos DX12
- Correções para Red Dead Redemption 2, Spider-Man, etc.

### Proton ARM64 (Abril 2026)
- Valve lançou Proton 11.0 ARM64 para Steam Frame VR
- Permite rodar jogos x86 em hardware ARM via emulação + tradução

### O que NINGUÉM está pesquisando (nossa oportunidade)

- **Container-aware runtime config**: nenhum runtime atual EXPÕE informações
  de GPU/drivers/kernel para o Proton de forma estruturada
- **Runtime optimization suggestions**: o runtime sabe o hardware, sabe o
  Proton, sabe o jogo → poderia recomendar/configurar otimizações
  automaticamente
- **Multi-Proton recommendation engine**: Proton diferente para cada
  jogo baseado em engine, anti-cheat, D3D version — nenhum runtime faz isso
- **Proton-agnostic config injection**: configurar DXVK, VKD3D, Wine
  registry pelo runtime sem modificar o Proton

---

# O que o Makai Time PODE fazer que ninguém faz

Baseado no estudo completo do pressure-vessel + NTSYNC + Proton/DXVK/VKD3D.

## 1. Detecção inteligente de sync (runtime → Proton)

Hoje o Proton detecta sozinho: testa `/dev/ntsync`, testa `fsync`, cai pra
`esync`. Mas o RUNTIME sabe mais que o Proton — o runtime sabe se está num
container, sabe qual kernel, sabe da GPU.

Makai Time pode fazer:
```python
sync_method = "esync"  # fallback padrão

if os.path.exists("/dev/ntsync"):
    # NTSYNC disponível — Proton 11+ usa automático
    # Só garantir que não tem nada desabilitando
    sync_method = "ntsync"
    env_proton_override = {}

elif has_futex2():   # testa /proc/self/fsync ou kernel >= 5.16
    sync_method = "fsync"
    env_proton_override = {"WINEFSYNC": "1", "WINEESYNC": "0"}

else:
    sync_method = "esync"
    env_proton_override = {"WINEESYNC": "1", "WINEFSYNC": "0"}

# Exporta pro Proton
container_env.update(env_proton_override)
```

NENHUM runtime faz isso. Lutris deixa o usuário marcar um checkbox "Esync"
ou "Fsync". A gente detecta AUTOMATICAMENTE.

## 2. GPU-aware DXVK/VKD3D config injection

O runtime detecta a GPU (NVIDIA, AMD, Intel). Agora, em vez de ignorar essa
informação, podemos INJETAR `dxvk.conf` e `vkd3d-proton.conf` otimizados.

```python
# Criado pelo Makai Time dentro do prefixo do jogo
dxvk_conf = {
    "dxgi.maxFrameLatency": 1,           # reduz input lag
    "dxvk.enableStateCache": True,       # shader cache
    "dxvk.numCompilerThreads": 0,        # usa todos os threads
}

if gpu_vendor == "NVIDIA":
    dxvk_conf["dxgi.hideNvidiaGpu"] = False
    dxvk_conf["dxvk.enableNVAPI"] = True     # DLSS, Reflex
elif gpu_vendor == "AMD":
    dxvk_conf["dxgi.hideNvidiaGpu"] = True
    # AMD specific tweaks
```

Para VKD3D (D3D12):
```python
vkd3d_config = []
if ntsync_available:
    vkd3d_config.append("force_static_cbv")  # NVIDIA safe
if gpu_vram >= 8 * 1024:
    vkd3d_config.append("dxr")  # ray tracing
```

NENHUM launcher faz config injection automático baseado em GPU detectada.

## 3. CPU topology pinning para CPUs híbridas

CPUs Intel 12ª geração+ têm P-cores (performance) e E-cores (eficiência).
Jogos sofrem quando escalonados para E-cores. Solução atual: usuário faz
`taskset` manualmente.

Makai Time pode detectar e configurar automaticamente:

```python
cpu_topology = detect_cpu_topology()
# Exemplo: Intel i7-13700K → 8 P-cores (0-7) + 8 E-cores (8-15)
if cpu_topology.has_hybrid_architecture:
    # Pinning game threads to P-cores only
    p_cores = cpu_topology.p_cores  # [0,1,2,3,4,5,6,7]
    container_env["WINE_CPU_TOPOLOGY"] = (
        f"{len(p_cores)}:{','.join(map(str, p_cores))}"
    )
    # WINE_CPU_TOPOLOGY=8:0,1,2,3,4,5,6,7
```

NENHUM runtime faz isso. O usuário tem que configurar manualmente com
`taskset` ou `WINE_CPU_TOPOLOGY`.

## 4. Wayland-first display

X11 adiciona latência extra na cadeia de eventos de entrada vs Wayland.
O pressure-vessel até tenta Wayland, mas deixa o Proton decidir.

Makai Time pode FORÇAR Wayland se disponível:
```python
if "wayland-0" in os.listdir(xdg_runtime_dir):
    container_env["SDL_VIDEODRIVER"] = "wayland"
    container_env["GDK_BACKEND"] = "wayland"
    container_env["XDG_SESSION_TYPE"] = "wayland"
```

## 5. Per-game optimization database

O runtime conhece:
- A engine do jogo (Bethesda, Unity, Unreal, NW.js, etc.)
- O Proton sendo usado
- A GPU + drivers
- O sync method disponível

Podemos manter um banco de dados de CONFIGURAÇÕES CONHECIDAS por jogo:

```python
game_profiles = {
    "SkyrimSE.exe": {
        "d3d9": "dxvk",                    # D3D9 → Vulkan
        "d3d11": "dxvk",                   # D3D11 → Vulkan
        "nofsync": True,                   # Skyrim quebra com fsync
        "maxFrameLatency": 2,
        "audio": "pulseaudio",
        "notes": "Desabilitar antialiasing no jogo",
    },
    "RDR2.exe": {
        "d3d12": "vkd3d",
        "vulkan_driver": "amd",            # forçar AMD path
        "nvapi_disabled": True,
    },
}
```

NENHUM runtime faz isso integrado. O usuário tem que buscar no ProtonDB.
A gente já sabe a engine (via games_registry.py) — podemos aplicar a config
automaticamente.

## 6. Impacto real no input lag

Resumo do que RedUZ input lag, em ordem de impacto:

| Técnica | Redução | Implementação |
|---|---|---|
| **NTSYNC** (kernel 6.14+) | Até 678% em CPU-bound | Só detectar e garantir que Proton usa |
| **FSYNC** (fallback) | 5-15% sobre esync | Ensinar runtime a detectar |
| **maxFrameLatency=1** | Reduz fila de frames | DXVK config injection (fácil) |
| **Wayland > X11** | 1-3ms input latency | Forçar na env var |
| **CPU pinning** | Evita micro-stutters em híbridos | WINE_CPU_TOPOLOGY |
| **Shader cache** | Elimina stutter de compilação | DXVK state cache + pré-compilação |

**O que o Makai Time faz de ÚNICO**: TUDO isso configurado AUTOMATICAMENTE
pelo runtime, sem o usuário precisar saber que existe NTSYNC, FSYNC, DXVK,
VKD3D, CPU topology, etc. O runtime detecta o hardware, detecta o sync,
injeta as configs, e o jogo funciona com o mínimo de latência possível
naquele hardware específico.
