# Relatório: Análise Completa do Makai Runtime — Caso NTE (Neverness to Everness)

**Data:** 17/07/2026 (atualizado com revisão)  
**Jogo:** Neverness to Everness (NTE) — UE5.6.1, engine HT  
**Proton:** DW-Proton-11.0-5  
**Runtime:** steamrt4_platform_4.0.20260714.251823 (Debian 13 Trixie rebrand)  
**Host:** Arch Linux, NVIDIA RTX 3060 (driver 610.43.03), kernel recente  

---

## 1. Resumo Executivo

O NTE **abre, cria janela (1600x900), mas crasha após ~28 segundos** com `DXGI_ERROR_INVALID_CALL`. Existem **dois problemas que provavelmente estão conectados**:

1. **O launcher força SoftwareOpenGL** — a UI Qt/CEF do launcher não consegue usar OpenGL hardware, cai em software
2. **O jogo crasha** — `DXGI_ERROR_INVALID_CALL` pode ser sintoma de um estado gráfico incorreto herdado do launcher

**Hipótese principal:** O problema NÃO é necessariamente bug do DXVK. O `DXGI_ERROR_INVALID_CALL` é genérico e pode ocorrer por vários motivos (recurso inválido, device removido, driver respondeu diferente, feature não disponível). A **falha de OpenGL/EGL do launcher** (que força SoftwareOpenGL) é o indicativo mais forte de que a pilha gráfica do container tem lacunas — provavelmente na camada GLVND.

### Cadeia de suspeita:
```
GLVND JSON não montado
  → libGLdispatch não encontra vendor correto
    → libGLX_nvidia não inicializa
      → libEGL_nvidia não inicializa
        → OpenGL/EGL falha
          → Launcher cai em SoftwareOpenGL
            → Estado gráfico pode afetar o jogo
              → DXGI_ERROR_INVALID_CALL (sintoma, não causa)
```

---

## 2. O que acontece quando o NTE é lançado

```
Timeline do NTEGlobalGame.log:
  00:30:50  Launcher inicia (pid 356)
  00:30:55  GPU detectada: NVIDIA GeForce RTX 3060 (Low Hash Rate) ✓
  00:30:55  UseSoftwareOpenGL: 0 (hardware OK) ✓
  00:30:56  RenderType(0) is ok ✓
  00:31:06  force SoftwareOpenGL=1 ← OpenGL/EGL FALHA para a UI
  00:31:06  Launcher REINICIA com /softwareOpenGL (pid 1400)
  00:31:10  UseSoftwareOpenGL: 1, RenderType(1) is ok
  00:31:15  launchGame: start game
  00:31:16  HTGame.exe criado com flag -d3d11
  00:31:29  Game window found (1600x900)
  00:31:45  Game quit — 28 segundos
```

### Análise do fluxo:

```
NTEGlobalGame.exe (launcher Qt/CEF)
  ├─ PCI detecta GPU OK (RTX 3060) ✓
  ├─ Vulkan detecta OK (provavelmente) ✓
  ├─ Mas OpenGL/EGL FALHA para a UI do launcher (CEF/Qt) ✗
  │   ↑↑↑ AQUI ESTÁ O BUG RAIZ
  ├─ Reinicia com /softwareOpenGL (usa opengl32sw.dll)
  └─ Lança HTGame.exe com -d3d11
       └─ UE5 usa D3D11 RHI → DXVK traduz pra Vulkan
            └─ Crash: DXGI_ERROR_INVALID_CALL (pode ser efeito colateral)
```

### Por que PCI/Vulkan funcionam mas OpenGL/EGL falham?

| Camada | Status | Por quê |
|---|---|---|
| PCI | ✅ Funciona | Não depende de libs no container |
| Vulkan | ✅ Funciona | nvidia_icd.json montado corretamente |
| OpenGL/EGL | ❌ Falha | GLVND EGL JSONs NÃO montados no container |
| D3D11 (DXVK) | ❓ Incerto | Pode funcionar, pode ter issues secundárias |

O Vulkan funciona porque o `nvidia_icd.json` é montado via bind individual em `/usr/share/vulkan/icd.d/`. Mas os GLVND JSONs (`10_nvidia.json`, `50_mesa.json`) NÃO são montados — e esses são necessários para o loader EGL descobrir qual vendor library usar.

---

## 3. Crash do Jogo — DXGI_ERROR_INVALID_CALL

### Assinatura (4 crash dumps idênticos):
```
Fatal error: [File:D3D11Util.cpp] [Line: 213]
Result failed with error DXGI_ERROR_INVALID_CALL
at D3D11Query.cpp:366

RHI Name: D3D11
Feature Level: SM5
Engine: UE5 5.6.1-0+UE5
PlatformIsRunningWine: true
GPU: NVIDIA GeForce RTX 3060 (Low Hash Rate)
```

### ⚠️ IMPORTANTE: DXGI_ERROR_INVALID_CALL é genérico

Este erro NÃO significa automaticamente bug do DXVK. Pode ocorrer quando:
- Recurso inválido passado ao driver
- Query com estado inconsistente (Begin sem End, ou vice-versa)
- Device foi removido ou perdido
- Driver respondeu de forma inesperada
- Feature não disponível no hardware/driver atual

### Possíveis causas reais:

| # | Causa provável | Evidência |
|---|---|---|
| 1 | **Estado gráfico herdado do launcher** | Launcher caiu em SoftwareOpenGL antes de criar o jogo. Se o launcher cria context GL compartilhado, o jogo pode herdar estado ruim. |
| 2 | **GLVND/EGL inconsistente no container** | Launcher não consegue usar OpenGL → SoftwareOpenGL. O mesmo problema pode afetar init do jogo. |
| 3 | **DXVK bug com D3D11 query do UE5.6** | Possível, mas é a hipótese MENOS provável dado que Vulkan funciona. |
| 4 | **d3d11.maxFrameLatency = 1 + query timing** | Configuração agressiva pode causar race condition. |

### Configuração relevante:
```ini
# UserData/Config/Config.ini
Dx11=0                    # Mas launcher ainda passa -d3d11!
autoSwitchRenderType=0    # Sem auto-switch D3D11↔D3D12
```

### DXVK config (dxvk.conf):
```ini
d3d9.maxAvailableMemory = 32768
d3d9.numBuffers = 4
d3d11.maxFrameLatency = 1    # ← Agressivo
dxvk.numCompilerThreads = 2
dxvk.enableGraphicsPipelineLibrary = True
dxvk.enableAsync = False
```

### Versões:
| Componente | Versão | Local |
|---|---|---|
| DXVK | v2.7.1-788-g30f6f83 | DW-Proton-11.0-5/files/lib/wine/dxvk/ |
| VKD3D-Proton | v1.1-5382-gee737e3 | DW-Proton-11.0-5/files/lib/wine/vkd3d-proton/ |
| DXVK-llasync | low-latency-framepacing-2.7.1-3-521 | Variante disponível no DW-Proton |
| DXVK-sarek | v1.10.x-290 | Variante mais antiga no DW-Proton |

### Por que -d3d11?
O launcher (NTEGlobalGame.exe) detecta Wine e força D3D11 como "caminho mais seguro". VKD3D-Proton (D3D12→Vulkan) está deployado mas **não é usado** porque o jogo é forçado pra D3D11.

---

## 4. A cadeia OpenGL/EGL no container

### Como o OpenGL/EGL deveria funcionar:
```
Aplicação (launcher CEF/Qt)
  ↓ chama eglGetProcAddress / eglChooseConfig
libEGL.so.1 (GLVND loader, vem do runtime)
  ↓ lê /usr/share/glvnd/egl_vendor.d/*.json
  ↓ encontra 10_nvidia.json → libEGL_nvidia.so.0
  ↓ encontra 50_mesa.json → libEGL_mesa.so.0
libEGL_nvidia.so.0 (host, via overrides)
  ↓ usa libnvidia-eglcore.so → /dev/nvidia0
OpenGL context criado com sucesso ✓
```

### Como funciona NO container Makai (atual):
```
Aplicação (launcher CEF/Qt)
  ↓ chama eglGetProcAddress / eglChooseConfig
libEGL.so.1 (GLVND loader, vem do runtime) ✓
  ↓ lê /usr/share/glvnd/egl_vendor.d/*.json
  ↓❌ DIRETÓRIO NÃO EXISTE NO CONTAINER (tmpfs ou não montado)
  ↓ Não encontra nenhum vendor JSON
  ↓ Fallback genérico ou falha
libEGL.so.1 não consegue criar context hardware
  ↓
Launcher cai em SoftwareOpenGL (opengl32sw.dll) ✗
```

### O que压力-vessel faz diferente:
pressure-vessel monta explicitamente os GLVND JSONs em `pv_runtime_use_provider_graphics_stack()`:
```
--ro-bind /usr/share/glvnd/egl_vendor.d/10_nvidia.json /usr/share/glvnd/egl_vendor.d/10_nvidia.json
--ro-bind /usr/share/glvnd/egl_vendor.d/50_mesa.json /usr/share/glvnd/egl_vendor.d/50_mesa.json
```

---

## 5. Arquitetura do Container (Makai Time)

### Hierarquia de montagem (ordem importa no bwrap):
```
1. --unshare-all (ou individual sem PID se AC relaxation)
2. --share-net, --die-with-parent, --new-session
3. GPU overrides: --ro-bind <overrides>/ /overrides
4. Vulkan ICD JSONs: --ro-bind <json> /usr/share/vulkan/icd.d/<json>
5. Root filesystem: --ro-bind / / (host inteiro, read-only)
6. --tmpfs /tmp, --dev /dev (limpa o que veio do root)
7. ld.so.cache regenerado: --ro-bind <cache> /etc/ld.so.cache
8. /etc/passwd + /etc/group sintéticos
9. GPU devices: --dev-bind /dev/dri, /dev/nvidia0, etc.
10. /dev/ntsync (se disponível)
11. Display: X11, Wayland, PipeWire, PulseAudio, D-Bus
12. Home isolation: --tmpfs /home --bind $HOME $HOME
13. Discord IPC sockets
14. Vulkan/OpenXR layer masking (tmpfs sobre layers do host)
15. Steam client stubs
16. Proton: --ro-bind <proton_path>
17. Game: --ro-bind <game_path>
18. Prefix: --bind <prefix> (WRITABLE, último = sobrescreve tudo)

❌ FALTANDO: GLVND EGL vendor JSONs
```

### Variáveis de ambiente críticas:
```
STEAM_RUNTIME_LIBRARY_PATH = prefix/system32:overrides/x86_64:overrides/i386:runtime/x86_64:runtime/i386:host_libs
LD_LIBRARY_PATH = NÃO SETADO (Proton gerencia o próprio)
__GLX_VENDOR_LIBRARY_NAME = nvidia
__GL_SHADER_DISK_CACHE = 1
__GL_THREADED_OPTIMIZATIONS = 1
WINENTSYNC = 1 (ou fsync/esync)
```

### ld.so.cache:
- Regenerado no startup com: runtime libs + GPU overrides
- **NÃO inclui** libs do host (só via STEAM_RUNTIME_LIBRARY_PATH)
- Montado em `/etc/ld.so.cache` dentro do container

---

## 6. Inventário do Runtime (steamrt4)

### Tamanho e estrutura:
| Métrica | Valor |
|---|---|
| Tamanho total | 634 MB |
| Total de arquivos | 6.709 |
| Arquivos .so | 1.269 |
| x86_64 .so | 696 |
| i386 .so | 504 |

### O que TEM no runtime:

| Categoria | x86_64 | i386 |
|---|---|---|
| glibc (libc.so.6) | ✅ | ✅ |
| libstdc++ | ✅ | ✅ |
| libgcc_s | ✅ | ✅ |
| ld-linux-x86-64.so.2 | ✅ | — |
| ld-linux.so.2 (32-bit) | — | ✅ |
| libvulkan.so.1 | ✅ | ✅ |
| libGL.so.1 | ✅ | ✅ |
| libGLX.so.0 | ✅ | ✅ |
| libGLX_mesa.so.0 | ✅ | ✅ |
| libEGL.so.1 | ✅ | ✅ |
| libEGL_mesa.so.0 | ✅ | ✅ |
| libGLdispatch.so.0 | ✅ | ✅ |
| libdrm.so.2 | ✅ | ✅ |
| libdrm_amdgpu.so | ✅ | ✅ |
| libdrm_intel.so | ✅ | ❌ |
| libdrm_nouveau.so | ✅ | ❌ |
| libdrm_radeon.so | ✅ | ❌ |
| libgbm.so.1 | ✅ | ✅ |
| libpulse.so.0 | ✅ | ✅ |
| libasound.so.2 | ✅ | ✅ |
| libX11.so.6 | ✅ | ✅ |
| libX11-xcb.so.1 | ✅ | ✅ |
| Suite XCB completa | ✅ | ✅ |
| libwayland-*.so | ✅ | ✅ |
| libSDL2-2.0.so | ✅ | ✅ |
| libSDL3.so | ✅ | ✅ |
| libva.so.2 | ✅ | ✅ |
| libva-drm.so | ✅ | ✅ |
| libvdpau.so.1 | ✅ | ✅ |
| libpipewire-0.3.so | ✅ | ✅ |
| DXVK (d3d8/9/10/11/dxgi) | ✅ | ❌ |
| VKD3D | ✅ | ❌ |

### O que NÃO TEM no runtime (esperado — vem do host):

| Categoria | Status | De onde vem |
|---|---|---|
| libnvidia-* | ❌ No runtime | Host via overrides |
| libGLX_nvidia.so | ❌ No runtime | Host via overrides |
| libEGL_nvidia.so | ❌ No runtime | Host via overrides |
| libcuda.so | ❌ No runtime | Host via overrides |
| DRI drivers (*_dri.so) | ❌ No runtime | Host via overrides |
| Vulkan ICD JSONs | ❌ No runtime | Host via overrides |
| GLVND EGL JSONs | ❌ No runtime | Host via overrides |

---

## 7. O que o Host tem vs O que é capturado para o container

### Host (Arch Linux):

| Biblioteca | Caminho no Host | Capturado? | No overrides? |
|---|---|---|---|
| libGLX_nvidia.so.0 | /usr/lib64/ | ✅ | ✅ symlink |
| libEGL_nvidia.so.0 | /usr/lib64/ | ✅ | ✅ symlink |
| libnvidia-glcore.so | /usr/lib64/ | ✅ | ✅ symlink |
| libnvidia-eglcore.so | /usr/lib64/ | ✅ | ✅ symlink |
| libcuda.so | /usr/lib64/ | ✅ | ✅ symlink |
| libnvidia-ml.so | /usr/lib64/ | ✅ | ✅ symlink |
| libdrm.so.2 | /usr/lib64/ | ✅ | ✅ symlink |
| libgbm.so.1 | /usr/lib64/ | ✅ | ✅ symlink |
| nvidia_icd.json | /usr/share/vulkan/icd.d/ | ✅ | ✅ JSON reescrito |
| **10_nvidia.json** (GLVND) | /usr/share/glvnd/egl_vendor.d/ | ⚠️ Detectado mas NÃO montado | ❌ |
| **50_mesa.json** (GLVND) | /usr/share/glvnd/egl_vendor.d/ | ⚠️ Detectado mas NÃO montado | ❌ |
| libva.so.2 (x86_64) | /usr/lib/ | ❌ NÃO detectado | ❌ |
| libva-drm.so.2 | /usr/lib/ | ❌ NÃO detectado | ❌ |
| DRI drivers (x86_64) | /usr/lib/dri/ (60+ arquivos) | ❌ NÃO detectados | ❌ |
| nvidia_drv_video.so | /usr/lib/dri/ | ❌ NÃO detectado | ❌ |

### i386 (32-bit) no Host:

| Biblioteca | Caminho no Host | Capturado? |
|---|---|---|
| libGLX_nvidia.so.0 | /usr/lib32/ | ❌ NÃO |
| libEGL_nvidia.so.0 | /usr/lib32/ | ❌ NÃO |
| libnvidia-glcore.so | /usr/lib32/ | ❌ NÃO |
| libvulkan.so.1 | /usr/lib32/ | ❌ NÃO |
| DRI drivers (i386) | /usr/lib32/dri/ (60+ arquivos) | ❌ NÃO |
| libva.so.2 | /usr/lib32/ | ❌ NÃO |

### Overrides efetivamente criados para NTE:
```
overrides/
  share/vulkan/icd.d/nvidia_icd.json  (reescrito: library_path → /overrides/x86_64-linux-gnu/lib/libGLX_nvidia.so.0)
  x86_64-linux-gnu/lib/               (112 symlinks para libs do host)
```

**⚠️ Não existe diretório i386-linux-gnu/ no overrides!**

---

## 8. BUGS E GAPS IDENTIFICADOS

### 🔴 CRÍTICO 1: GLVND EGL vendor JSONs NÃO são montados

**Problema:** `detect.py` encontra `10_nvidia.json` e `50_mesa.json`, mas `mount.py` só monta Vulkan ICD JSONs. Os GLVND JSONs são ignorados.

**Consequência:** O loader EGL dentro do container não sabe qual vendor library usar. Resultado:
- Launcher CEF/Qt não consegue criar OpenGL context → **Força SoftwareOpenGL**
- Pode afetar o init do jogo (estado gráfico herdado)

**Evidência:** O log mostra `force SoftwareOpenGL=1` mesmo com RTX 3060 detectada. PCI e Vulkan funcionam. O problema é especificamente OpenGL/EGL.

**压力-vessel faz isso:** Sim, pressure-vessel monta explicitamente os GLVND JSONs em `pv_runtime_use_provider_graphics_stack()`.

**Esta é provavelmente a causa raiz do problema do NTE e de outros jogos que forçam SoftwareOpenGL.**

### 🔴 CRÍTICO 2: i386 (32-bit) COMPLETAMENTE AUSENTE nos overrides + caminhos hardcoded

**Problema:** `capture_all_graphics()` só gera overrides para `x86_64-linux-gnu`. Não existe chamada com `arch="i386-linux-gnu"` em lugar nenhum do fluxo.

**Pior:** `HOST_LIB_PATHS` assume layout Debian (`/usr/lib/i386-linux-gnu`). Isso falha em:
- **Arch:** `/usr/lib32/` (não está na lista)
- **Gentoo:** `/usr/lib32/` ou `/usr/lib/` (depende do perfil)
- **NixOS:** `/nix/store/xxxxxxxx` (não existe `/usr/lib` nenhum)
- **Void:** `/usr/lib32/`
- **Alpine:** musl, layout completamente diferente
- **Clear Linux:** outro layout

**Solução:** Não detectar distro — detectar o loader via `ldconfig -p` e resolver dinamicamente. Ver seção 11.

### 🟡 MODERADO 3: DRI drivers não são capturados

**Problema:** Os `*_dri.so` não são detectados nem capturados. Nem sempre são necessários para NVIDIA (usa driver proprietário direto), mas vários launchers e CEF usam Mesa internamente para OpenGL.

**Consequência:** Se o launcher tenta usar Mesa GLX em vez de NVIDIA GLX, não encontra DRI drivers → fallback para software.

### 🟡 MODERADO 4: /dev/nvidia-caps/ NÃO é montado

**Problema:** `gpu_device_args()` monta nvidia0, nvidiactl, nvidia-modeset, nvidia-uvm, mas NÃO monta `/dev/nvidia-caps/nvidia-cap1` e `nvidia-cap2`.

**Consequência:** Algumas features NVIDIA (compute, GPU capabilities) podem falhar no driver 535+.

### 🟡 MODERADO 5: libva (VA-API) não é detectada/capturada

**Problema:** `detect.py` captura drivers VA-API (`*_drv_video.so`) mas NÃO as libs cliente (`libva.so`, `libva-drm.so`, etc).

**Consequência:** Se Wine/Proton usar VA-API para hardware video decode (DXVA2/EVA), vai falhar. Cutscenes e vídeos podem não funcionar.

### 🟡 MODERADO 6: Vulkan layers não são montados como JSON

**Problema:** `detect.py` encontra os .so dos layers, mas os arquivos JSON manifest não são copiados/montados. O Vulkan loader precisa dos JSONs para descobrir layers.

**Consequência:** Layers como nvidia_layers.json (debug, profiling) ficam invisíveis no container.

### 🟡 MODERADO 7: D3D11 RHI forçado — D3D12 disponível mas não usado

**Problema:** O launcher força `-d3d11` mesmo tendo VKD3D-Proton (D3D12→Vulkan) disponível.

**Consequência:** Se o problema for DXVK, forçar D3D12 seria um workaround. Mas primeiro resolver o GLVND.

### 🟢 MENOR 8: d3d11.maxFrameLatency = 1 é agressivo

**Problema:** `dxvk.conf` força latência máxima de 1 frame.

**Consequência:** Pode contribuir para issues de timing em D3D11 queries.

### 🟢 MENOR 9: OpenCL não é capturado

**Problema:** Muitos jogos detectam OpenCL. As libs (`libOpenCL.so`, ICD JSONs) não são capturadas.

**Consequência:** Jogos que tentam usar OpenCL para compute (upscaling, etc.) podem falhar.

### 🟢 MENOR 10: CUDA não é capturada explicitamente

**Problema:** `libcuda.so` é capturado via `nvidia_libs()`, mas `libnvoptix.so` e outros componentes CUDA não são.

**Consequência:** RT/DLSS que dependem de OptiX podem falhar.

---

## 9. Comparação com pressure-vessel (Valve)

| Feature | pressure-vessel | Makai Time | Status |
|---|---|---|---|
| Runtime base (steamrt4) | ✅ | ✅ | OK |
| Multiarch (x86_64 + i386) | ✅ | ⚠️ Runtime tem, overrides não | GAP |
| GPU driver detection | ✅ capsule-capture-libs | ✅ detect.py + capture.py | OK (falta i386) |
| GPU library capture | ✅ Cópia recursiva | ✅ Symlinks | OK |
| Vulkan ICD JSON mounting | ✅ | ✅ | OK |
| GLVND EGL JSON mounting | ✅ | ❌ | **BUG RAIZ** |
| /dev/dri mounting | ✅ | ✅ | OK |
| /dev/nvidia* mounting | ✅ Completo | ⚠️ Falta nvidia-caps | GAP |
| DRI driver capture | ✅ (via capsule) | ❌ | GAP |
| ld.so.cache regeneration | ✅ | ✅ | OK |
| LD_LIBRARY_PATH management | ✅ | ✅ (STEAM_RUNTIME_LIBRARY_PATH) | OK |
| Home isolation | ✅ | ✅ | OK |
| Display stack (X11+Wayland) | ✅ | ✅ | OK |
| Audio (PipeWire+Pulse) | ✅ | ✅ | OK |
| Layer masking | ✅ | ✅ | OK |
| libva capture | ✅ | ❌ | GAP |
| OpenCL capture | ✅ | ❌ | GAP |
| Recursive ELF dependency resolution | ✅ (capsule-capture-libs) | ❌ (listas fixas) | GAP |
| Interactive mode | ✅ | ❌ | Ausente |
| XDG portals | ✅ | ❌ | Ausente |

---

## 10. Soluções — Ordem de prioridade

### FASE 1: Resolver raiz do problema NTE (e outros jogos com SoftwareOpenGL)

| # | Solução | Impacto | Esforço |
|---|---|---|---|
| 1 | **Montar GLVND EGL vendor JSONs** — Adicionar bind de `10_nvidia.json` e `50_mesa.json` em `mount.py` para `/usr/share/glvnd/egl_vendor.d/` | Corrige SoftwareOpenGL no launcher e possivelmente o crash do NTE | Baixo |
| 2 | **Detectar DRI drivers** — Adicionar `*_dri.so` ao pipeline de captura em `detect.py` | CEF/Mesa conseguem usar hardware | Baixo |
| 3 | **Capturar libva** — Adicionar `libva.so`, `libva-drm.so`, `libva-x11.so`, `libva-wayland.so` ao pipeline | VA-API funciona | Baixo |

### FASE 2: Detecção dinâmica de libs (multiarch + multi-distro)

| # | Solução | Impacto | Esforço |
|---|---|---|---|
| 4 | **Resolver libs via ldconfig/ldd em vez de caminhos fixos** — Não detectar distro, detectar o loader real | Funciona em Arch, Debian, Fedora, Gentoo, NixOS, Void, Alpine, Clear Linux | Alto |
| 5 | **Captura recursiva de dependências** — Ler NEEDED do ELF + resolver via ldd recursivamente | Qualquer driver futuro funciona sem atualizar código | Alto |

### FASE 3: Completude

| # | Solução | Impacto | Esforço |
|---|---|---|---|
| 6 | **Montar /dev/nvidia-caps/** — Adicionar nvidia-cap1 e nvidia-cap2 | Compute/compatibilidade completa | Baixo |
| 7 | **Capturar OpenCL** — `libOpenCL.so` + ICD JSONs | Jogos com OpenCL funcionam | Médio |
| 8 | **Capturar CUDA completa** — `libnvoptix.so` + libs OptiX | RT/DLSS funcionam | Médio |

### FASE 4: Testar NTE novamente

| # | Teste | Objetivo |
|---|---|---|
| 10 | **Testar NTE após FASE 1** | Verificar se SoftwareOpenGL some e se o crash persiste |
| 11 | **Se crash persistir: testar D3D12** | Forçar `-d3d12` para usar VKD3D-Proton em vez de DXVK |
| 12 | **Se crash persistir: testar DXVK-llasync** | Variante de baixa latência pode tratar queries differently |
| 13 | **Se crash persistir: aumentar maxFrameLatency** | De 1 para 2 ou 3 |

---

## 11.超越 pressure-vessel: Detecção Dinâmica de Bibliotecas

### Por que caminhos fixos não funcionam

O código atual usa:
```python
HOST_LIB_PATHS = [
    "/usr/lib/x86_64-linux-gnu",  # Debian/Ubuntu
    "/usr/lib/i386-linux-gnu",    # Debian/Ubuntu
    "/usr/lib64",                 # Arch, Fedora
    "/usr/lib",                   # Debian, Fedora
    "/lib/x86_64-linux-gnu",      # Debian/Ubuntu
    "/lib/i386-linux-gnu",        # Debian/Ubuntu
    "/lib64",                     # Arch
    "/lib",                       # Todos
]
```

Isso **quebra** em:

| Distro | Layout | Caminho correto | Detectado? |
|---|---|---|---|
| Arch Linux | `/usr/lib32/` | ❌ Não está na lista |
| Gentoo | `/usr/lib64/` + `/usr/lib32/` (ou `/usr/lib/` dependendo do perfil) | ❌ Inconsistente |
| NixOS | `/nix/store/xxxxxxxx` | ❌ Nenhum caminho funciona |
| Void Linux | `/usr/lib32/` + `/usr/lib/` | ❌ Não está na lista |
| Alpine | musl, tudo diferente | ❌ Quebra tudo |
| Clear Linux | Outro layout | ❌ Não detecta |
| openSUSE | `/usr/lib64/` + `/usr/lib/` | ⚠️ Parcial |

### A abordagem correta: perguntar ao loader

Em vez de assumir caminhos, **descobrir onde o sistema realmente procura bibliotecas**:

```python
# 1. Descobrir os diretórios que o ld.so usa
def discover_host_lib_dirs():
    """Usa ldconfig -v para listar TODOS os diretórios registrados no sistema."""
    result = subprocess.run(["ldconfig", "-v"], capture_output=True, text=True)
    dirs = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if line.startswith("/") and not line.startswith(" ") and not "\t" in line:
            dirs.append(line)
    return dirs  # Ex: ["/usr/lib64", "/usr/lib32", "/usr/lib", ...]

# 2. Resolver uma biblioteca específica via ldconfig -p
def resolve_library(name):
    """Pergunta ao ldconfig onde está uma biblioteca específica."""
    result = subprocess.run(["ldconfig", "-p"], capture_output=True, text=True)
    for line in result.stdout.splitlines():
        if name in line:
            # Ex: "libGLX_nvidia.so.0 (libc6,x86-64) => /usr/lib64/libGLX_nvidia.so.0"
            path = line.split("=>")[-1].strip()
            if os.path.exists(path):
                return path
    return None

# 3. Resolver via readlink do loader
def find_loader_path():
    """Descobre o caminho real do ld-linux."""
    result = subprocess.run(
        ["readlink", "-f", "/lib64/ld-linux-x86-64.so.2"],
        capture_output=True, text=True
    )
    return result.stdout.strip()  # Ex: "/usr/lib/ld-linux-x86-64.so.2"

# 4. Resolver via gcc
def find_libstdcpp_path():
    """Descobre onde o gcc instala libstdc++."""
    result = subprocess.run(
        ["gcc", "-print-file-name=libstdc++.so.6"],
        capture_output=True, text=True
    )
    return result.stdout.strip()  # Ex: "/usr/lib/gcc/x86_64-pc-linux-gnu/14.1.1/libstdc++.so.6"
```

### Pipeline completo proposto

```
Biblioteca desejada (ex: libGLX_nvidia.so.0)
        │
        ▼
Resolver via ldconfig -p
        │
        ▼
Encontrou caminho real (ex: /usr/lib64/libGLX_nvidia.so.0)
        │
        ▼
Executar ldd na biblioteca
        │
        ▼
Lista de dependências NEEDED
  libdl.so.2 → /usr/lib64/libdl.so.2
  libpthread.so.0 → /usr/lib64/libpthread.so.0
  libm.so.6 → /usr/lib64/libm.so.6
  libc.so.6 → /usr/lib64/libc.so.6
  ...
        │
        ▼
Para cada dependência NÃO-sistema (glibc, ld-linux):
  │
  ▼
  Executar ldd recursivamente
  │
  ▼
  Adicionar à lista de captura
  │
  ▼
  Parar quando atingir profundidade máxima ou libs do runtime
        │
        ▼
Capturar todas as libs resolvidas
        │
        ▼
Montar overrides (symlink ou cópia)
```

### Captura de libs 32-bit

```python
# Não assumir caminho — perguntar ao ldconfig 32-bit
def resolve_library_32(name):
    """Resolve lib 32-bit usando ldconfig com conf path do i386."""
    # Opção 1: ldconfig -p | grep "libc6,x86" 
    result = subprocess.run(["ldconfig", "-p"], capture_output=True, text=True)
    for line in result.stdout.splitlines():
        if name in line and "x86" in line and ("32" in line or "i386" in line or "i686" in line):
            path = line.split("=>")[-1].strip()
            if os.path.exists(path):
                return path
    return None

# Ou mais direto:
def find_lib32_dirs():
    """Descobre diretórios 32-bit do sistema."""
    result = subprocess.run(["ldconfig", "-v", "-N"], capture_output=True, text=True)
    dirs = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if line.startswith("/") and os.path.isdir(line):
            # Verifica se tem libs i386
            for f in os.listdir(line):
                if ".so" in f and os.path.islink(os.path.join(line, f)):
                    target = os.readlink(os.path.join(line, f))
                    if "i386" in target or "i686" in target or "/lib32/" in line:
                        dirs.append(line)
                        break
    return dirs
```

### Exemplo real: como resolveria no Arch Linux

```
$ ldconfig -v 2>/dev/null | grep -E "^/"
/usr/lib64
/usr/lib32
/usr/lib

$ ldconfig -p | grep libGLX_nvidia
libGLX_nvidia.so.0 (libc6,x86-64) => /usr/lib64/libGLX_nvidia.so.0
libGLX_nvidia.so.0 (libc6) => /usr/lib32/libGLX_nvidia.so.0

$ ldd /usr/lib64/libGLX_nvidia.so.0
    libnvidia-glcore.so.610 => /usr/lib64/libnvidia-glcore.so.610
    libnvidia-tls.so.610 => /usr/lib64/libnvidia-tls.so.610
    libdl.so.2 => /usr/lib64/libdl.so.2
    libpthread.so.0 => /usr/lib64/libpthread.so.0
    libc.so.6 => /usr/lib64/libc.so.6
    libGLdispatch.so.0 => /usr/lib64/libGLdispatch.so.0
```

### Exemplo real: como resolveria no Gentoo

```
$ ldconfig -v 2>/dev/null | grep -E "^/"
/usr/lib64
/usr/lib32
/usr/lib

$ ldconfig -p | grep libGLX_nvidia
libGLX_nvidia.so.0 (libc6,x86-64) => /usr/lib64/libGLX_nvidia.so.0
libGLX_nvidia.so.0 (libc6) => /usr/lib32/libGLX_nvidia.so.0

# Mesmo resultado — o loader resolve independentemente da distro
```

### Exemplo real: como resolveria no NixOS

```
$ ldconfig -v 2>/dev/null | grep -E "^/"
/nix/store/abc123-nvidia-driver/lib
/nix/store/def456-glibc/lib

$ ldconfig -p | grep libGLX_nvidia
libGLX_nvidia.so.0 (libc6,x86-64) => /nix/store/abc123-nvidia-driver/lib/libGLX_nvidia.so.0

# Funciona! O loader sabe onde está.
```

### O que o pressure-vessel faz

A Valve usa `capsule-capture-libs` que:
1. Monta um container auxiliar com o runtime + host /
2. Roda `ldconfig -p` e `ldd` DENTRO dele
3. Resolve as libs corretamente para o ABI do container
4. Copia as libs resolvidas para o overrides directory

O Makai Time pode fazer o **mesmo** mas de forma mais simples (sem container auxiliar), já que o host é acessível diretamente.

### Vantagens sobre listas fixas

| Abordagem | Funciona em Arch? | Funciona em Gentoo? | Funciona em NixOS? | Precisa atualizar código? |
|---|---|---|---|---|
| HOST_LIB_PATHS fixo | ❌ Falta /usr/lib32 | ⚠️ Depende do perfil | ❌ Nix paths | Sim, toda vez |
| ldconfig -p + ldd | ✅ | ✅ | ✅ | Não |
| capsule-capture-libs (Valve) | ✅ | ✅ | ✅ | Não |

### Resumo da arquitetura proposta

```python
class DynamicLibraryResolver:
    """Resolve bibliotecas via loader do sistema, sem caminhos fixos."""
    
    def __init__(self):
        self.host_lib_dirs = self._discover_lib_dirs()
        self._lib_cache = {}
    
    def _discover_lib_dirs(self):
        """ldconfig -v → lista de diretórios do sistema."""
        ...
    
    def resolve(self, lib_name, arch=None):
        """ldconfig -p → caminho real da biblioteca."""
        ...
    
    def resolve_recursive(self, lib_name, arch=None, max_depth=8):
        """ldd → dependências recursivas."""
        ...
    
    def find_all_graphics_libraries(self):
        """Pipeline completo: resolve + captura + recursivo."""
        libs = []
        for name in GRAPHICS_LIBS:  # libGLX_nvidia, libEGL_nvidia, etc.
            path = self.resolve(name)
            if path:
                deps = self.resolve_recursive(path)
                libs.extend(deps)
        return libs
```

Isso torna o Makai Time **mais robusto que o pressure-vessel** em termos de portabilidade, porque:
- Não depende de container auxiliar para resolver libs
- Funciona em qualquer distro glibc sem configuração
- Resolve automaticamente mudanças de layout do sistema
- Captura dependências transitivas que listas fixas perdem

---

## 12. Arquivos Relevantes

| Arquivo | Descrição |
|---|---|
| `tools/prefix/makai_time/makai_time.py` | Entry point: build_bwrap_cmd() + run() |
| `tools/prefix/makai_time/core/gpu.py` | Detecção de GPU (info apenas) |
| `tools/prefix/makai_time/core/ldso.py` | LD_LIBRARY_PATH + ld.so.cache |
| `tools/prefix/makai_time/core/display.py` | Mount de X11, Wayland, PipeWire, PulseAudio |
| `tools/prefix/makai_time/core/layers.py` | Vulkan/OpenXR layer masking |
| `tools/prefix/makai_time/core/runtime.py` | Resolução de runtime (scout→soldier→sniper→steamrt4) |
| `tools/prefix/makai_time/overrides/detect.py` | Detecção de libs GPU no host |
| `tools/prefix/makai_time/overrides/capture.py` | Captura de libs GPU via symlinks |
| `tools/prefix/makai_time/overrides/mount.py` | Geração de args bwrap para overrides + devices |
| `tools/prefix/makai_time/overrides/capsule_capture.py` | Captura alternativa (cópia recursiva com resolução ELF) |
| `tools/prefix/makai_time/proton/config.py` | Env vars do Proton (NVIDIA, AMD, Intel, sync) |
| `tools/prefix/makai_time/proton/intel.py` | Proton intelligence (32 forks) |
| `tools/prefix/makai_time/proton/anticheat/games/neverness_to_everness.py` | Definição NTE (ACE, DW-Proton, container_relax) |

---

## 13. Log de Crash Completo (NTEGlobalGame.log)

```
00:30:50.889 Log Init (pid=356)
00:30:50.949 autoSwitchRenderType:0, UseSoftwareOpenGL: 0
00:30:55.318 NVIDIA GeForce RTX 3060 (Low Hash Rate) size:12256
00:30:56.077 current RenderType(0) is ok
00:31:06.123 force SoftwareOpenGL=1          ← OpenGL/EGL FALHOU
--- Launcher reinicia com /softwareOpenGL ---
00:31:06.427 Log Init (pid=1400)
00:31:06.484 UseSoftwareOpenGL: 1
00:31:10.276 current RenderType(1) is ok
00:31:11.848 browser init failed, kill process
00:31:15.884 launchGame: start game
00:31:16.117 begin start game (HTGame.exe), times:1
00:31:16.130 cmd:/Game/LoginAndCreate/Map/Updater/Updater_P --saveddirsuffix=Global -SAVEWINPOS=1
00:31:16.773 createProcess run game HTGame.exe pid:1264
00:31:29.547 game wnd found (1600x900)
00:31:45.277 game quit — 28 segundos
```

---

*Relatório gerado para análise com GPT/LLM.*  
*Atualizado com revisão técnica e reclassificação de causas.*  
*Autor: opencode (big-pickle model) — Makai Forge project*
