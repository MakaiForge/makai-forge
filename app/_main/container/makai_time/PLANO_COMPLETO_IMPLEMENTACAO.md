# Plano Completo de Implementação — Makai Time Runtime v2

> Mescla: `PLANO_DESVINCULACAO_STEAM.md` + `container/_v2-entry-point.md` + gaps descobertos

---

## Fase 0: Foundation — Criar o que está faltando

### 0.1 `core/seccomp.py` — Filtro BPF

**Status:** ❌ Ausente (import quebrado em `isolation.py`)
**Prioridade:** 🔴 ALTA
**O que faz:** Bloqueia syscalls perigosos (reboot, kexec, module init) dentro do container
**Implementação:** 
- Copiar/adaptar do `steam-runtime-tools` (GPL) ou criar do zero
- Usar `ctypes` para `prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, ...)`
- Ou usar `bwrap --add-seccomp-fd` com um BPF program
- Arquivo: `makrun/core/seccomp.py` — função `get_seccomp_fd()`

### 0.2 `container/gamescope.py` — Integração Gamescope

**Status:** ❌ Ausente (só em docs)
**Prioridade:** 🟡 MÉDIA
**O que faz:** Monitora janelas do jogo, injeta atom `STEAM_GAME` para Gamescope detectar
**Implementação:**
- Thread que monitora X11/Wayland windows
- Quando janela do jogo aparece, seta `GAMESCOPECTRL_BASELAYER_APPID`
- Arquivo: `makrun/container/gamescope.py`

### 0.3 `core/gpu_cache.py` — Cache de GPU

**Status:** ❌ Ausente (só em docs)
**Prioridade:** 🟡 MÉDIA
**O que faz:** Cacheia vendor/driver GPU + sync method entre execuções
**Implementação:**
- Salva em `makai_manifest.json` (já existe em `manifest.py`)
- Arquivo: `makrun/core/gpu_cache.py` — ou integrar em `manifest.py`

### 0.4 `intel/makaitricks.py` — Makaitricks

**Status:** ❌ Ausente (só em docs)
**Prioridade:** 🟢 BAIXA
**O que faz:** Winetricks inteligente por jogo
**Implementação:** Kanji existente no `tools/Mods_manager/`

---

## Fase 1: Camada de Tradução (MAKAI_* → STEAM_COMPAT_*)

### 1.1 Criar `core/translator.py`

**Status:** 🔴 NOVO
**Arquivo:** `makrun/core/translator.py`

```python
MAKAI_TO_STEAM = {
    "MAKAI_GAME_INSTALL_DIR": "STEAM_COMPAT_INSTALL_PATH",
    "MAKAI_COMPAT_DATA_PATH": "STEAM_COMPAT_DATA_PATH",
    "MAKAI_CLIENT_INSTALL_PATH": "STEAM_COMPAT_CLIENT_INSTALL_PATH",
    "MAKAI_TOOL_PATHS": "STEAM_COMPAT_TOOL_PATHS",
    "MAKAI_LIBRARY_PATHS": "STEAM_COMPAT_LIBRARY_PATHS",
    "MAKAI_MOUNTS": "STEAM_COMPAT_MOUNTS",
    "MAKAI_SHADER_PATH": "STEAM_COMPAT_SHADER_PATH",
    "MAKAI_APP_ID": "STEAM_COMPAT_APP_ID",
}
```

Funções:
- `translate_to_steam(env: dict) → dict` — adiciona STEAM_COMPAT_* que faltam
- `inject_steam_vars(env: dict) → dict` — força presença de todas as vars que o Proton exige

### 1.2 Substituir STEAM_COMPAT_* → MAKAI_* nos steps

| Arquivo | Mudança |
|---------|---------|
| `steps/env.py` | `STEAM_VARS` → `MAKAI_VARS`. No final, chamar `inject_steam_vars()` |
| `runner.py` | Env dict inicial usar `MAKAI_*` |
| `environment.py` | Usar `MAKAI_*` em vez de `STEAM_COMPAT_*` |
| `steps/mounts.py` | Extra dict com `MAKAI_GAME_INSTALL_DIR` |
| `shim.py` | Adicionar `translate_to_steam()` no sanitize |

### 1.3 Ponto de tradução (antes do exec)

Em `steps/exec.py`, antes de montar o comando Proton:

```python
# Traduz MAKAI_* → STEAM_COMPAT_* para o Proton
from makrun.core.translator import inject_steam_vars
env = inject_steam_vars(env)
```

---

## Fase 2: Makai Runtime sem pressure-vessel

### 2.1 Modificar `makai-time-entry` (runtime)

**Arquivo:** `makai-time-platform-1.0/makai-time-entry`

**Mudança:** Em vez de chamar `./run` (→ PV), chamar `makrun` diretamente:

```python
# ANTES:
os.execvp(str(HERE / "run"), run_args)

# DEPOIS:
import sys
sys.path.insert(0, str(HERE / "files" / "lib" / "python3.13" / "site-packages"))
from makrun.shim import main as makai_run
sys.exit(makai_run())
```

Ou via subprocess:
```python
subprocess.run(["/usr/bin/python3", "-m", "makrun.shim"] + rest)
```

### 2.2 Adicionar `--die-with-parent`

**Arquivo:** `steps/isolation.py`

```python
# Adicionar após cap_drop_all:
if container_cfg.get("die_with_parent", True):
    args.extend(["--die-with-parent"])
```

**Prioridade:** 🔴 ALTA (3 linhas, container zumbi se Python crashar)

### 2.3 Remover arquivos Steam do runtime

Após validar:

| Arquivo | Ação |
|---------|------|
| `_v2-entry-point` | Remover |
| `pressure-vessel/` | Remover |
| `pressure-vessel-arm64/` | Remover |
| `var/` | Remover |
| `run` | Remover |
| `toolmanifest.vdf` | Remover |
| `usr-mtree.txt.gz` | Remover |
| `metadata/` | Opcional |

### 2.4 Criar `makai-manifest.json` no runtime

```json
{
  "version": 1,
  "name": "Makai Time Runtime",
  "entry": "makai-time-entry",
  "requires": ["bwrap"],
  "python": "3.13"
}
```

---

## Fase 3: Adaptação dos Steps

### 3.1 `steps/env.py` — Usar MAKAI_VARS + tradução

- `STEAM_VARS` → `MAKAI_VARS` (lista de 9 vars)
- No final do `configure()`: `env_vars.update(inject_steam_vars(env_vars))`
- Remover `STEAM_COMPAT_*` do código, deixar só nos valores traduzidos

### 3.2 `steps/mounts.py` — Extra com MAKAI_*

Extra dict passar:
```python
extra={
    "MAKAI_PROTON_PATH": proton_container,
    "MAKAI_PREFIX_PATH": prefix_container,
    "MAKAI_GAME_INSTALL_DIR": game_container,  # install root (2 níveis)
    "MAKAI_HOME": home,
    "exe_resolved": exe_resolved,
}
```

### 3.3 `steps/exec.py` — Watchdog + tradução

- Adicionar `inject_steam_vars()` antes do comando Proton
- Watchdog wrapper: já existe, verificar se mantém container vivo para launchers

### 3.4 `devices.py` — NTSYNC e VA-API

- `NTSYNC`: já existe mas desabilitado (`bind_ntsync=False`). Ativar por padrão no container config.
- VA-API: adicionar detecção de `/usr/lib/dri/*_drv_video.so` e bind

---

## Fase 4: Pequenos Gaps

### 4.1 Locale generation (fallback)

Se `LANG` do host não existir no runtime:
- Tentar `localedef -i <locale> -f UTF-8 <path>` (binário existe no runtime)
- Fallback: usar `C.UTF-8`

**Arquivo:** `steps/etc.py` ou novo `steps/locale.py`

### 4.2 XDG portal detection

Detectar se o Flatpak portal `org.freedesktop.portal.*` está rodando no host:
- Bind do socket `$XDG_RUNTIME_DIR/bus` já existe
- Adicionar env var `XDG_CURRENT_DESKTOP` se detectado

### 4.3 ELF inspection (opcional)

Para detecção avançada de dependências de libs GPU:
- Usar `subprocess.run(["readelf", "-d", lib_path])`
- Ou `ctypes` para `dlopen` + `dlinfo`

---

## Fase 5: Testes

### 5.1 Teste com jogo real

**Jogo:** Grand Fantasia Violet (GF)
**Pipeline:**
```bash
./runner_makrun.sh           # GF via makrun (container builder)
```

**O que verificar:**
- [ ] Container cria sem erro
- [ ] Jogo abre (janela visível)
- [ ] GPU funciona (NVIDIA)
- [ ] Áudio funciona (BGM, SFX, vozes)
- [ ] Internet funciona
- [ ] Fechamento limpo (exit code 0)
- [ ] Sem zumbis após fechar

### 5.2 Teste com múltiplos Protons

| Proton | Jogo | Status esperado |
|--------|------|----------------|
| CachyOS-11.0 | GF | ✅ |
| UMU-Proton-10.0 | GF | ✅ |
| GE-Proton | GF | ✅ |
| DW-Proton | NTE | ✅ |

### 5.3 Teste de desvinculação

- [ ] Nenhum `STEAM_COMPAT_*` no nosso código (só na tradução)
- [ ] Runtime não tem `_v2-entry-point` nem `pressure-vessel/`
- [ ] `makai-time-entry` chama `makrun` direto

---

## Cronograma

| Fase | O que | Depois de | Esforço |
|------|-------|-----------|---------|
| **0.1** | Criar `seccomp.py` | — | 1-2h |
| **0.2** | Adicionar `--die-with-parent` | — | 5min |
| **1** | Criar `translator.py` + adaptar steps | — | 2-3h |
| **2.1** | Modificar `makai-time-entry` | Fase 1 | 1h |
| **2.3** | Remover PV do runtime | Fase 2.1 | 30min |
| **3** | Adaptar steps restantes | Fase 1 | 2h |
| **4** | Gaps menores (locale, VA-API) | Fase 3 | 2h |
| **5** | Testes | Tudo acima | Contínuo |

---

## Arquivos a criar/modificar (resumo)

| Ação | Arquivo | Fase |
|------|---------|------|
| **CRIAR** | `makrun/core/seccomp.py` | 0.1 |
| **CRIAR** | `makrun/core/translator.py` | 1.1 |
| **CRIAR** | `makrun/core/gpu_cache.py` | 0.3 |
| **CRIAR** | `makrun/container/gamescope.py` | 0.2 |
| **CRIAR** | `makrun/intel/makaitricks.py` | 0.4 |
| **MODIFICAR** | `steps/isolation.py` (+ die-with-parent) | 2.2 |
| **MODIFICAR** | `steps/env.py` (MAKAI_VARS) | 1.2 |
| **MODIFICAR** | `steps/mounts.py` (extra MAKAI_*) | 1.2 |
| **MODIFICAR** | `steps/exec.py` (+ tradução) | 1.3 |
| **MODIFICAR** | `runner.py` (env dict MAKAI_*) | 1.2 |
| **MODIFICAR** | `environment.py` (MAKAI_*) | 1.2 |
| **MODIFICAR** | `shim.py` (+ tradução) | 1.2 |
| **MODIFICAR** | `makai-time-entry` (runtime) | 2.1 |
| **REMOVER** | `_v2-entry-point`, `pressure-vessel/`, `var/`, `run` | 2.3 |
