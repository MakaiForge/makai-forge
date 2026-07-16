# AGENTS.md — Memória do Agente Makai Time

## Objetivo do Projeto
Criar o **Makai Time** — um runtime container (bwrap + steamrt4 + GPU/audio/display do host) para executar jogos Windows via Proton/Wine, substituindo o pressure-vessel da Steam.

## Como o Makai Time Funciona

```
makai_time.py (entry point)
 ├─ detecta jogo (profile manager)
 ├─ identifica Proton (intel.py → definitions/*.py)
 ├─ baixa runtime steamrt4 se necessário
 ├─ detecta GPU, sync, CPU
 ├─ captura GPU overrides (symlinks de libs do host)
 ├─ aplica configs DXVK/VKD3D
 ├─ monta env vars (genéricas + definição do fork + MAKAI_*)
 └─ build_bwrap_cmd() → executa bwrap com Proton dentro
```

## Estrutura de Definitions

`tools/prefix/makai_time/proton/definitions/*.py` — Um arquivo por fork.

Cada definition tem:
- `FORK_ID`: identificador único
- `DEFINITION`: dict com metadados, features, patches, env_defaults, container_overrides

### `container_overrides` (CAMPO CRÍTICO)
Diz ao container o que este Proton precisa:
```python
"container_overrides": {
    "ntsync": True,              # Se True, bind /dev/ntsync
    "nvidia_libs_bundled": True,  # Se True, não copia libs NVIDIA para overrides
}
```

### Fluxo de Integração Definition → Container
1. `run()` chama `proton_intel.identify_proton(proton_path)` → retorna fork_id
2. `proton_intel.get_proton_info()` → retorna DEFINITION + id
3. `container_overrides` lido para:
   - `prefix_skip_nvidia = container_overrides.get("nvidia_libs_bundled", False)` → usado no step 5 (capture)
   - `needs_ntsync = container_overrides.get("ntsync", False)` → passado para `build_bwrap_cmd()`
4. `env_defaults` aplicado via `apply_proton_config()`
5. `features` usado para recomendações

## O que Já Foi Corrigido (15/07/2026)

### Bug 1: `arch` NameError em `capture.py`
- `symlink_vulkan_icd()` usava variável `arch` indefinida
- Fix: adicionar `arch` como parâmetro

### Bug 2: Ordem de binds no bwrap
- `--tmpfs /overrides` e `--ro-bind /overrides` vinham DEPOIS de `--ro-bind / /`
- Causa: `Can't mkdir /overrides: Read-only file system`
- Fix: mover overrides binds para ANTES de `--ro-bind / /`

### Bug 3: `--ro-bind /lib /lib` (ROOT CAUSE do exit code 1)
- Substituía `/lib` do host pelo do runtime, quebrando TODOS os executáveis
- Sintoma: `bwrap: execvp /path/to/proton: No such file or directory`
- Fix: REMOVER este bind — runtime libs são providas via LD_LIBRARY_PATH

### Bug 4: `--tmpfs /tmp` antes de `--ro-bind / /`
- `--ro-bind / /` (recursivo) sobrescrevia o tmpfs, deixando /tmp readonly
- Fix: mover `--tmpfs /tmp` e `--dev /dev` para DEPOIS de `--ro-bind / /`

### Bug 5: `STEAM_COMPAT_DATA_PATH` faltando
- Proton-CachyOS exige esta variável
- Fix: adicionar `--setenv STEAM_COMPAT_DATA_PATH <prefix-path>`

### Bug 6: `UMU_ID` / `GAMEID` faltando
- protonfixes do Proton-CachyOS crashava sem `UMU_ID`
- Fix: gerar `UMU_ID` do nome do jogo, `GAMEID` = `UMU_ID`

### Bug 7: `STEAM_COMPAT_CLIENT_INSTALL_PATH` faltando
- Proton-CachyOS exige (mesmo que vazio)
- Fix: `--setenv STEAM_COMPAT_CLIENT_INSTALL_PATH ""`

### Bug 8: GStreamer Warnings
- Proton-CachyOS bundled plugins tentam carregar libs de arch errado
- Fix: `GST_PLUGIN_SYSTEM_PATH=""` e `GST_REGISTRY_FORK=no`

## O Que Falta Fazer

### Prioridade Alta — Arquitetura
- [ ] Refatorar `build_bwrap_cmd()` para receber `proton_info` e ler `container_overrides`
- [ ] Ntsync: usar `container_overrides.ntsync` em vez de detecção de kernel genérica
- [ ] Nvidia bundled: usar `container_overrides.nvidia_libs_bundled` corretamente
- [ ] Garantir que TODOS os forks têm `container_overrides` (mesmo que vazio)

### Prioridade Média — Testes com Outros Forks
- [ ] Testar com Valve Proton (official)
- [ ] Testar com GE-Proton
- [ ] Testar com UMU-Proton
- [ ] Testar com Wine (non-Proton)
- [ ] Testar jogo pesado (D3D12, Cyberpunk, etc.)

### Prioridade Baixa — Melhorias
- [ ] Detecção inteligente de ntsync/fsync/esync por fork
- [ ] Recomendação de Proton por jogo (engine + anti-cheat + D3D version)
- [ ] Runtime optimization suggestions por hardware
- [ ] Gamescope integration
- [ ] Discord IPC

## Definições de Proton (31 forks)

### Protons ativos (wine + proton script)
- `valve` — Official Valve Proton. Estável, mínimo.
- `proton-ge` — GloriousEggroll. Bleeding edge, melhor compatibilidade.
- `proton-cachyos` — CachyOS Team. Mais features (DLSS, FSR4, NTSync).
- `umu-proton` — Open-Wine-Components. Focado em non-Steam.
- `proton-tkg` — Frogging-Family. Build system customizável.
- `proton-lina` — GE base + game fixes.
- `proton-ge-rtsp` — GE + RTSP codec (VRChat).
- `proton-sarek` — DXVK Sarek fork, async compute.
- `proton-lfx2` — LFX2 patches.
- `dw-proton` — Dawn Winery. CachyOS base + Spritz/anti-cheat.
- `proton-plop` — EM nightly builds.
- `proton-em` — Wayland-first, FSR4 pioneer.
- `proton-ove-mc` — Steam Deck builds.
- `proton-ge-miniloader` — GE + miniloader patches.
- `proton-speedhack` — Speed hack capabilities.
- `proton-wine-gamenative` — Winlator compat (ARM64EC).
- `proton-wine-andrevto` — Winlator compat fork.

### Wines (apenas wine, sem proton script)
- `wine-vanilla`, `wine-staging`, `wine-staging-tkg`
- `wine-miniloader`
- `wine-proton-kron4ek`

### Não-Wine (DOSBox/ScummVM adapters)
- `boxtron`, `luxtorpeda`, `roberta`

### Ferramentas
- `steam-tinker-launch` — Bash wrapper/launcher
- `dxvk`, `dxvk-gplasync`, `vkd3d-proton` — Translation layers
- `gwine` — Wine special build

## Container x Definitions

Cada fork tem necessidades diferentes no container:

| Fork | NTSync | NVIDIA Bundled | Env Específico |
|------|--------|----------------|-----------------|
| proton-cachyos | ✅ | ✅ | PROTON_LOCAL_SHADER_CACHE |
| dw-proton | ✅ | ✅ | PROTON_USE_WINEALSA, etc |
| proton-em | ❌ | ❌ | Wayland color management |
| proton-ge | ❌ | ❌ | PROTON_ENABLE_NVAPI |
| umu-proton | ❌ | ❌ | UMU_ID (já setado globalmente) |
| valve | ❌ | ❌ | Steam client paths |

## Como Ler as Definitions no Container

```python
# No run() em makai_time.py:
proton_id = proton_intel.identify_proton(proton_path)
proton_info = proton_intel.get_proton_info(proton_path) if proton_id else None

# container_overrides
container_ov = (proton_info or {}).get("container_overrides", {})
skip_nvidia = container_ov.get("nvidia_libs_bundled", False)
needs_ntsync = container_ov.get("ntsync", False)

# Passar para build_bwrap_cmd()
cmd = build_bwrap_cmd(
    command,
    proton_path=proton_path,
    prefix_path=prefix_path,
    # ...outros args...
    skip_nvidia=skip_nvidia,
    ntsync_enabled=needs_ntsync,
)
```

## Comandos Úteis

```bash
cd /home/cas/Documentos/Makai-forge/tools/prefix

# Testar com dry-run
PYTHONPATH=. python3 -m makai_time.makai_time \
  --game-exe "/home/cas/Games/How to Raise a Happy NEET Ver. 2.0.8 EN-DLC-Cheats/Game.exe" \
  --proton-path "/home/cas/.config/makai-forger/compat-tools/compatibilitytools.d/Proton-CachyOS-11.0-20260602-slr" \
  --prefix-path "/home/cas/Games/Makai-forger/how-to-raise-a-happy-neet-" \
  --dry-run --verbose

# Rodar de verdade
PYTHONPATH=. timeout 30 python3 -m makai_time.makai_time \
  --game-exe "/home/cas/Games/How to Raise a Happy NEET Ver. 2.0.8 EN-DLC-Cheats/Game.exe" \
  --proton-path "/home/cas/.config/makai-forger/compat-tools/compatibilitytools.d/Proton-CachyOS-11.0-20260602-slr" \
  --prefix-path "/home/cas/Games/Makai-forger/how-to-raise-a-happy-neet-"
```

## Notas
- NONÃO criar Proton próprio. Usar Proton do catálogo (20+ forks em tools.ts)
- NONÃO usar child_process.spawn/fs.*Sync nos IPC do Electron
- NONÃO referenciar Heroic/Total — concorrentes proibidos
- Electron NÃO sabe caminhos de prefixo — Python é a fonte única
- **Sempre que adicionar suporte a um novo fork, criar definition E container_overrides**
