"""Per-game profile management.

Cada perfil contém:
- Configurações DXVK específicas do jogo
- Env vars específicas
- Runtime recomendado (scout/soldier/sniper/steamrt4)
- Proton recomendado
- Notas de compatibilidade

Detecção automática por nome do executável + engine.
Merge com default e overrides de hardware.
"""

import json
import os
from makai_time.profiles import registry, engine


def _slug(name: str) -> str:
    return name.lower().replace(" ", "-").replace(":", "").replace("'", "")


def _profiles_dir(base_path: str) -> str:
    return os.path.join(base_path, "profiles", "data")


def list_profiles(base_path: str) -> list[dict]:
    """Lista perfis disponíveis em disco."""
    pdir = _profiles_dir(base_path)
    if not os.path.isdir(pdir):
        return []
    profiles = []
    for fname in sorted(os.listdir(pdir)):
        if not fname.endswith(".json"):
            continue
        try:
            with open(os.path.join(pdir, fname)) as f:
                data = json.load(f)
            profiles.append(data)
        except (json.JSONDecodeError, OSError):
            continue
    return profiles


def load_profile(base_path: str, name: str) -> dict | None:
    """Carrega perfil por nome ou slug."""
    pdir = _profiles_dir(base_path)
    if not os.path.isdir(pdir):
        return None

    slug = _slug(name)

    fpath = os.path.join(pdir, f"{slug}.json")
    if os.path.isfile(fpath):
        try:
            with open(fpath) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return None

    for fname in os.listdir(pdir):
        if not fname.endswith(".json"):
            continue
        try:
            with open(os.path.join(pdir, fname)) as f:
                data = json.load(f)
            if data.get("name", "").lower() == name.lower():
                return data
        except (json.JSONDecodeError, OSError):
            continue

    return None


def save_profile(base_path: str, profile: dict) -> str:
    """Salva um perfil em disco."""
    pdir = _profiles_dir(base_path)
    os.makedirs(pdir, exist_ok=True)

    name = profile.get("name", "unknown")
    slug = _slug(name)
    fpath = os.path.join(pdir, f"{slug}.json")

    with open(fpath, "w") as f:
        json.dump(profile, f, indent=2)

    return fpath


def detect_game(game_exe_path: str) -> dict | None:
    """Detecta o jogo pelo caminho do executável.
    
    1. Extrai nome do exe do path
    2. Busca no registry (curated DB)
    3. Tenta detectar engine pelo nome
    4. Se não achar, retorna None (usa default)
    
    Returns: profile dict ou None.
    """
    if not game_exe_path:
        return None
    exe_name = os.path.basename(game_exe_path)
    if not exe_name:
        return None

    # 1. Registry match (com full path para pattern matching)
    profile = registry.get_profile_safe(exe_name, full_path=game_exe_path)
    if profile:
        return profile

    # 2. Engine detection
    eng = engine.detect_engine(exe_name)
    if eng:
        return {
            "name": os.path.splitext(exe_name)[0],
            "exe": exe_name,
            "engine": eng,
            "env": {},
            "notes": f"Engine detectada: {eng}",
        }

    return None


def merge_profile(
    game_profile: dict | None,
    gpu_vendor: str,
    sync_method: str,
    prefix_path: str = "",
) -> dict:
    """Faz merge do perfil do jogo com configurações de hardware.
    
    Regras de merge:
    - Perfil do jogo sempre tem prioridade sobre defaults
    - Engine config faz merge com perfil do jogo
    - Config de hardware (GPU, sync) são base, override pelo perfil
    
    Returns: dict com env vars + configs mesclados.
    """
    result = {
        "env": {},
        "dxvk": {},
        "vkd3d": {},
        "sync": sync_method,
        "runtime": "steamrt4",
    }

    # 1. Aplica engine config primeiro (base)
    if game_profile and game_profile.get("engine"):
        engine.apply_engine_config(
            game_profile["engine"],
            prefix_path,
            result["env"],
        )

    # 2. Aplica perfil do jogo (override engine)
    if game_profile:
        if game_profile.get("env"):
            result["env"].update(game_profile["env"])

        if game_profile.get("dxvk"):
            result["dxvk"].update(game_profile["dxvk"])

        if game_profile.get("vkd3d"):
            result["vkd3d"].update(game_profile["vkd3d"])

        if game_profile.get("runtime"):
            result["runtime"] = game_profile["runtime"]

        if game_profile.get("sync"):
            result["sync"] = game_profile["sync"]

        # no_fsync override
        if game_profile.get("no_fsync") and sync_method == "fsync":
            result["env"]["WINEFSYNC"] = "0"
            result["env"]["WINEESYNC"] = "1"
            result["sync"] = "esync"

        # use_wined3d override
        if game_profile.get("use_wined3d"):
            result["env"]["PROTON_USE_WINED3D"] = "1"

    return result


def default_profile() -> dict:
    """Perfil padrão."""
    return {
        "name": "default",
        "runtime": "steamrt4",
        "dxvk_config": {},
        "vkd3d_config": {},
        "env": {},
        "notes": "",
    }
