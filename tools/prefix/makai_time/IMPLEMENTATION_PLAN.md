# Plano de Implementação — Makai Time

**Status**: 15/07/2026 — Fase 6 concluída. **Fase 7 em andamento**.

---

## Fase 0 — Fundação ✅

### Legado (`tools/prefix/python/prefix/container.py`)
- [x] `build_bwrap_cmd()` — monta o comando bwrap com `--unshare-all`, `--dev /dev`, `--tmpfs /tmp`
- [x] `run_in_container()` — executa qualquer comando dentro do container
- [x] Montagem steamrt4 em `/lib` (quando formato flatpak-style)
- [x] GPU bind: `/dev/dri`, `/dev/nvidia*`
- [x] Display: X11 + Wayland sockets
- [x] Áudio: PipeWire + PulseAudio via `$XDG_RUNTIME_DIR`
- [x] D-Bus: `/run/dbus`
- [x] HOME/PREFIX/PROTON writable via `--bind`
- [x] `ensure_steam_runtime()` em `core.py` — download + extração steamrt4

### Makai Time (`tools/prefix/makai_time/`)
- [x] `makai_time.py` — entry point único, pipeline de 9 etapas
- [x] `core/runtime.py` — busca em paths conhecidos, fallback download, suporte casync + flatpak
- [x] `core/gpu.py` — detecção NVIDIA/AMD/Intel via `nvidia-smi`, `glxinfo`, `/sys/class/drm`
- [x] `core/sync.py` — ntsync (kernel ≥ 6.14) > fsync (futex2) > esync
- [x] `core/display.py` — X11, Wayland, PipeWire, PulseAudio, D-Bus mounts
- [x] `utils/sysinfo.py` — kernel version, CPU topology (híbrido P/E-cores)
- [x] `core/ldso.py` — `build_ld_library_path()` + `regenerate_ld_so_cache()`

---

## Fase 1 — GPU Overrides ✅

**Referência**: pressure-vessel `runtime.c` → `pv_runtime_use_provider_graphics_stack()`

Arquivos: `overrides/detect.py`, `overrides/capture.py`, `overrides/mount.py`

- [x] **detect.py**: Vulkan ICDs, EGL/GLX, DRI, VA-API, VDPAU, libdrm, libgbm, NVIDIA, OpenXR
- [x] **capture.py**: Symlinks para libs GPU do host, ICDs JSON com `library_path` ajustado
- [x] **mount.py**: `override_bwrap_args()` + `gpu_device_args()`

---

## Fase 2 — Sync Detection + Config ✅

- [x] **`core/sync.py`**: ntsync > fsync > esync com detecção automática
- [x] **`proton/config.py`**: `dxvk_config()`, `vkd3d_config()` vendor-aware, escrita no prefixo
- [x] **Container-aware env vars**: GPU, sync, display (SDL_VIDEO_DRIVER, etc.)
- [x] **`utils/sysinfo.py`**: CPU híbrida via `cpu_capacity`

---

## Fase 3 — Per-game Profiles ✅

Arquivos: `profiles/registry.py`, `profiles/engine.py`, `profiles/manager.py`

- [x] **registry.py**: 24 perfis de jogo em `_BUILTIN_PROFILES`
- [x] **engine.py**: 7 engine handlers (Bethesda, Unity, Unreal, NW.js, RenPy, GameMaker, RPGMaker)
- [x] **manager.py**: `detect_game()`, `load_profile()`, `merge_profile()`
- [x] `prefix_path` passado para `merge_profile()` — engine handlers usam prefixo real

---

## Fase 4 — Proton Intelligence ✅

Arquivos: `proton/intel.py`, `proton/definitions/*.py` (30 arquivos)

- [x] **30 forks no catálogo** (28 DB + dxvk-gplasync + vkd3d-proton)
- [x] **identify_proton()** — detecta fork por caminho/arquivos com 31 casos mock (100% OK)
- [x] **get_proton_info()** — retorna features, patches, env_defaults, container_overrides
- [x] **apply_proton_config()** — aplica env vars específicas do fork
- [x] `container_overrides`: `ntsync`, `nvidia_libs_bundled`, `wayland` por fork

---

## Fase 5 — Container-aware Env Vars + Pipeline Completo ✅

- [x] `container_env()` em `proton/recommender.py` — gera MAKAI_GPU_*, MAKAI_SYNC, etc.
- [x] `proton_recommendation()` — recomenda Proton fork por jogo + GPU + engine
- [x] Pipeline de 9 etapas (0 → 8) em `makai_time.py`
- [x] `vram_mb` tornado opcional
- [x] `prefix_path` integrado no `merge_profile()`

---

## Fase 6 — Múltiplos Runtimes ✅

Arquivo: `core/runtime.py`

### 6.1 Correção de URLs de download
- [x] Descoberta da estrutura real dos repositórios Steam
- [x] **scout**: `https://repo.steampowered.com/steamrt-images-scout/snapshots/<version>/com.valvesoftware.SteamRuntime.Platform-amd64,i386-scout-runtime.tar.gz`
- [x] **soldier**: `https://repo.steampowered.com/steamrt-images-soldier/snapshots/<version>/com.valvesoftware.SteamRuntime.Platform-amd64,i386-soldier-runtime.tar.gz`
- [x] **sniper**: `https://repo.steampowered.com/steamrt-images-sniper/snapshots/<version>/com.valvesoftware.SteamRuntime.Platform-amd64,i386-sniper-runtime.tar.gz`
- [x] **steamrt4**: `https://repo.steampowered.com/steamrt4/images/<version>/com.valvesoftware.SteamRuntime.Platform-amd64,i386-steamrt4-runtime.tar.gz`

### 6.2 Resolução dinâmica de versão
- [x] `_resolve_latest_version()` — fetch de `latest-public-stable.txt` de cada repositório
- [x] Fallback para versão hardcoded se resolução falhar
- [x] Suporte a `.tar.gz` (runtime tarballs são gzip, não xz)

### 6.3 Extração unificada
- [x] `_extract_tarball()` — detecta `.tar.xz` vs `.tar.gz` vs `.tar` automaticamente
- [x] Merge de `files/` → raiz (formato Flatpak-style)

---

## Fase 7 — LD_LIBRARY_PATH + Overlay Inteligente (EM ANDAMENTO)

**Objetivo**: Orquestrar a ordem de carregamento de bibliotecas baseada no fork de Proton detectado, garantindo que libs GPU do host ou bundled do Proton tenham prioridade correta sobre as libs do runtime.

### 7.1 Análise do prefixo para detecção do Proton 🔷
- [ ] Ler `config_info` do prefixo — contém caminho do Proton que gerou o prefixo
- [ ] Ler `version` do prefixo — nome do fork (ex: `CachyOS-11.0-100`)
- [ ] Se `config_info` ou `version` existirem, usar `identify_proton()` no caminho encontrado
- [ ] Se não existirem, usar `identify_proton()` no `proton_path` passado pelo usuário
- [ ] Integrar no pipeline como Step 0.2 (entre detecção do jogo e identificação do Proton)

### 7.2 Decisão de overrides por fork 🔷
- [ ] Consultar `container_overrides` do fork detectado
- [ ] Se `nvidia_libs_bundled: True` (CachyOS, DW-Proton, GE-Proton, etc.):
  - Pular captura de libs NVIDIA (deixar as bundled do Proton)
  - Capturar only AMD/Intel/VAAPI/VDPAU
- [ ] Se `nvidia_libs_bundled: False` (Valve Proton, etc.):
  - Capturar tudo (NVIDIA + AMD + VAAPI + VDPAU)
- [ ] Se `wayland: True` no fork:
  - Priorizar Wayland sobre X11 nas env vars
- [ ] Se `ntsync: True` no fork:
  - Garantir que `/dev/ntsync` seja bindado (já existe no sync_info)

### 7.3 Montagem sobre /lib (não /overrides/lib) 🔷
- [ ] Alterar `overrides/mount.py`: `override_bwrap_args()` monta direto em `/lib` (não `/overrides/lib`)
- [ ] Estrutura: `--ro-bind <overrides>/x86_64-linux-gnu/lib /lib/x86_64-linux-gnu`
- [ ] ICDs Vulkan montados em `/usr/share/vulkan/icd.d/` (não `/overrides/share/`)
- [ ] Garantir que runtime libs fiquem como fallback (overrides têm prioridade)

### 7.4 Regenerar ld.so.cache com prioridade correta 🔷
- [ ] No Step 7 (geração de env vars), chamar `ldso.regenerate_ld_so_cache()`
- [ ] Prioridade: `overrides > runtime > host`
- [ ] Usar `LD_LIBRARY_PATH=<overrides>/lib:<runtime>/lib` + `ldconfig`
- [ ] Multiarch: x86_64 + i386 separados

### 7.5 Integração no pipeline 🔷
- [ ] Step 0.2: `detect_proton_from_prefix(prefix_path)` → retorna fork_id ou None
- [ ] Step 5 modificado: `create_overrides(gpu_info, proton_info)` — decide o que capturar
- [ ] Step 7 modificado: `regenerate_ld_so_cache(runtime_path, overrides_base)`

### 7.6 Teste com prefixo real 🔷
- [ ] `how-to-raise-a-happy-neet`: CachyOS-11.0 → `nvidia_libs_bundled=True`
- [ ] Verificar que overrides NVIDIA NÃO são capturados
- [ ] Verificar que AMD/VAAPI/VDPAU continuam sendo capturados
- [ ] Verificar que `identify_proton()` retorna `proton-cachyos`

---

## Fase 8 — steam_api.dll / steamclient.fake (PENDENTE)

- [ ] Implementar fake steamclient.so para jogos com DRM Steam
- [ ] Compatível com Heroic/UMU approach
- [ ] Detectado por perfil de jogo (Bethesda, etc.)

---

## Fase 9 — Gamescope Integration (PENDENTE)

- [ ] Detectar Gamescope (atom STEAM_GAME)
- [ ] Passar variáveis corretas para Proton
- [ ] GAMESCOPECTRL_BASELAYER_APPID

---

## Fase 10 — Discord / Outros IPC (PENDENTE)

- [ ] Discord RPC socket binding
- [ ] Overlays de terceiros

---

## Prioridade de Implementação (atualizado 15/07/2026)

| # | O quê | Status | Esforço | Impacto |
|---|---|---|---|---|
| 0 | Fundação (container, runtime, GPU, sync, display) | ✅ | Concluído | **Crítico** |
| 1 | GPU overrides (detect + capture + mount) | ✅ | Concluído | **Alto** |
| 2 | Sync detection + DXVK/VKD3D config | ✅ | Concluído | **Alto** |
| 3 | Per-game profiles (24 perfis, 7 engines) | ✅ | Concluído | **Alto** |
| 4 | Proton Intelligence (30 forks, identify, features) | ✅ | Concluído | **Alto** |
| 5 | Container-aware env vars + pipeline 9 etapas | ✅ | Concluído | **Médio** |
| 6 | Múltiplos runtimes (URLs corretas + resolução dinâmica) | ✅ | Concluído | **Médio** |
| **7** | **LD_LIBRARY_PATH + Overlay Inteligente** | 🔷 **Em andamento** | **2 dias** | **Alto** |
| 7.1 | Análise de prefixo para detecção do Proton | 🔷 | | **Alto** |
| 7.2 | Decisão de overrides por fork | ⬜ | | **Alto** |
| 7.3 | Montagem sobre /lib | ⬜ | | **Médio** |
| 7.4 | Regenerar ld.so.cache | ⬜ | | **Médio** |
| 7.5 | Integração no pipeline | ⬜ | | **Alto** |
| 7.6 | Teste com prefixo real | ⬜ | | **Crítico** |
| 8 | steam_api.dll / steamclient.fake | ⬜ | 2 dias | **Médio** |
| 9 | Gamescope integration | ⬜ | 1 dia | **Baixo** |
| 10 | Discord / outros IPC | ⬜ | 1 dia | **Baixo** |

---

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| GPU detection falha em distro não testada | Fallback para montagem completa de `/usr/lib64` (comportamento original) |
| Sync detection errada (falso positivo ntsync) | Proton já tem fallback interno; no máximo performance subótima |
| Per-game profile desatualizado | Perfil default seguro; profiles são override, não restrição |
| bwrap não disponível | Erro claro com instrução de instalação |
| Fork Proton não identificado | Fallback para config genérica (Valve Proton defaults) |
| libs bundled do Proton conflitam com overrides do host | `container_overrides.nvidia_libs_bundled` detectado → pula override NVIDIA |
