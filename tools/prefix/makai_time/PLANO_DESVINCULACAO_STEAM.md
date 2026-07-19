# Plano de Desvinculação Completa da Steam

## Filosofia

Criar o **Makai Runtime** como um sistema auto-contido, onde:
- Tudo que é `STEAM_COMPAT_*` vira `MAKAI_*` no nosso código
- Uma **camada de tradução** fina mapeia `MAKAI_*` → `STEAM_COMPAT_*` só na hora de chamar o Proton
- O `pressure-vessel/` é removido do runtime — nosso `builder.py` faz o container
- O `_v2-entry-point` é substituído pelo `makai-time-entry` (Python)

---

## Fase 1: Camada de Tradução (MAKAI_* → STEAM_COMPAT_*)

### 1.1 Criar módulo de tradução

**Arquivo:** `makrun/core/translator.py`

```python
# Mapa de tradução MAKAI → STEAM (e vice-versa)
MAKAI_TO_STEAM = {
    "MAKAI_GAME_INSTALL_DIR": "STEAM_COMPAT_INSTALL_PATH",
    "MAKAI_COMPAT_DATA_PATH": "STEAM_COMPAT_DATA_PATH",
    "MAKAI_CLIENT_INSTALL_PATH": "STEAM_COMPAT_CLIENT_INSTALL_PATH",
    "MAKAI_TOOL_PATHS": "STEAM_COMPAT_TOOL_PATHS",
    "MAKAI_LIBRARY_PATHS": "STEAM_COMPAT_LIBRARY_PATHS",
    "MAKAI_MOUNTS": "STEAM_COMPAT_MOUNTS",
    "MAKAI_SHADER_PATH": "STEAM_COMPAT_SHADER_PATH",
    "MAKAI_APP_ID": "STEAM_COMPAT_APP_ID",
    "MAKAI_RUNTIME_PATH": "STEAM_RUNTIME",
}

# Função translate_env(env_dict) → traduz MAKAI_* para STEAM_COMPAT_*
# Função inject_steam_vars(env_dict) → adiciona STEAM_COMPAT_* que faltam
```

### 1.2 Substituir STEAM_COMPAT_* por MAKAI_* no codebase

| Arquivo | Onde | Mudança |
|---------|------|---------|
| `steps/env.py` | STEAM_VARS + blocos if/elif | Usar `MAKAI_*` como primary, traduzir no final |
| `runner.py` | env dict inicial | `MAKAI_*` em vez de `STEAM_COMPAT_*` |
| `shim.py` | sanitize_env() | Adicionar tradução |
| `steps/mounts.py` | extra dict | `MAKAI_GAME_INSTALL_DIR` em vez de game_container |

### 1.3 Ponto de tradução (antes do exec)

**Onde:** `steps/exec.py` — antes de montar o comando final do Proton

```python
def inject_steam_compat(env: dict) -> dict:
    """Traduz MAKAI_* → STEAM_COMPAT_* para o Proton."""
    result = dict(env)
    for makai_key, steam_key in MAKAI_TO_STEAM.items():
        if makai_key in result:
            result[steam_key] = result[makai_key]
    return result
```

---

## Fase 2: Makai Runtime sem pressure-vessel

### 2.1 Makai-time-entry como entry point único

**Arquivo:** `makai-time-platform-1.0/makai-time-entry` (já existe)

**Mudança:** Em vez de chamar `./run` (que chama PV), chamar diretamente:

```python
# Em vez de:
os.execvp(str(HERE / "run"), run_args)

# Fazer:
os.environ["MAKAI_SHIM_ACTIVE"] = "1"
# Chamar makrun.runner.run() diretamente via venv ou PYTHONPATH
```

Quando o runtime for standalone (packaged), o `makai-time-entry` pode:
1. Importar `makrun` do PYTHONPATH embutido
2. Chamar `runner.run()` diretamente
3. Ou chamar `python3 -m makrun.shim` como fallback

### 2.2 Remover arquivos Steam do runtime

Após validar que nada mais usa:

| Arquivo/Dir | Status |
|-------------|--------|
| `_v2-entry-point` | Remover |
| `pressure-vessel/` | Remover (binários C) |
| `pressure-vessel-arm64/` | Remover |
| `var/` | Remover (logs PV) |
| `run` | Remover (script shell PV) |
| `toolmanifest.vdf` | Remover (Steam manifest) |
| `usr-mtree.txt.gz` | Remover (Steam manifest) |
| `metadata/` | Opcional (info de versão) |

### 2.3 Makai Runtime manifest

**Arquivo:** `makai-time-platform-1.0/makai-manifest.json`

```json
{
  "version": 1,
  "name": "Makai Time Runtime",
  "base": "Debian 13 Trixie (GLIBC 2.41)",
  "entry": "makai-time-entry",
  "requires": ["bwrap"],
  "features": ["container", "proton-intel", "per-game-profiles"]
}
```

---

## Fase 3: Adaptação dos Steps

### 3.1 `steps/env.py` — usar MAKAI_*

**Antes:**
```python
STEAM_VARS = [
    "STEAM_COMPAT_APP_ID", "SteamAppId", "SteamGameId",
    "STEAM_COMPAT_DATA_PATH", "STEAM_COMPAT_INSTALL_PATH",
    ...
]
```

**Depois:**
```python
MAKAI_VARS = [
    "MAKAI_APP_ID", "SteamAppId", "SteamGameId",
    "MAKAI_COMPAT_DATA_PATH", "MAKAI_GAME_INSTALL_DIR",
    ...
]
```

E no final do `configure()`, chamar `inject_steam_compat()` para gerar as `STEAM_COMPAT_*` que o Proton precisa.

### 3.2 `steps/mounts.py` — extra com MAKAI_*

**Extra dict:**
```python
extra={
    "MAKAI_PROTON_PATH": proton_container,
    "MAKAI_PREFIX_PATH": prefix_container,
    "MAKAI_GAME_INSTALL_DIR": game_container,  # install root (2 níveis)
    "MAKAI_HOME": home,
    "exe_resolved": exe_resolved,
}
```

### 3.3 `steps/exec.py` — tradução + watchdog

Adicionar `inject_steam_compat(env)` antes de montar o comando Proton.

---

## Fase 4: Atualização do Test Runner

### 4.1 `runner.sh` → `runner_makrun.sh`

Migrar totalmente para `runner_makrun.sh` (já usa nosso pipeline). Remover `runner.sh` (PV legado).

### 4.2 Testar com todos os Protons

| Proton | Teste |
|--------|-------|
| CachyOS-11.0 | GF Launcher |
| GE-Proton | GF Launcher |
| UMU-Proton | GF Launcher |
| DW-Proton | NTE Launcher |

---

## Cronograma sugerido

| Fase | O que | Prioridade |
|------|-------|------------|
| **1** | Criar `translator.py` (MAKAI_* → STEAM_COMPAT_*) | Imediato |
| **1** | Adaptar `steps/env.py` para usar MAKAI_VARS | Imediato |
| **1** | Adaptar `runner.py` env dict | Imediato |
| **1** | Adaptar `steps/mounts.py` extra dict | Imediato |
| **2** | Modificar `makai-time-entry` para chamar makrun direto | Após Fase 1 |
| **2** | Remover `pressure-vessel/`, `_v2-entry-point`, `var/` | Após testar |
| **3** | Adaptar `steps/exec.py` com tradução automática | Junto com Fase 1 |
| **4** | Testar com múltiplos Protons | Contínuo |
