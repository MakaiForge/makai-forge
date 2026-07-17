"""Proton Intelligence — Base de conhecimento dos forks de Proton.

Cada fork está em um arquivo separado em definitions/.
O runtime consulta esta base para identificar, configurar e recomendar Protons.
"""

import os
import importlib
import pkgutil


# ── Carrega definições de todos os forks ────────────────────────────────────

PROTON_KNOWLEDGE: dict[str, dict] = {}

_defs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "definitions")
_defs_pkg = __package__ + ".definitions" if __package__ else "definitions"

for _loader, _module_name, _is_pkg in pkgutil.iter_modules([_defs_dir]):
    _mod = importlib.import_module(f"{_defs_pkg}.{_module_name}")
    if hasattr(_mod, "FORK_ID") and hasattr(_mod, "DEFINITION"):
        PROTON_KNOWLEDGE[_mod.FORK_ID] = _mod.DEFINITION


# ── Identificação ────────────────────────────────────────────────────────────

def identify_proton(proton_path: str) -> str | None:
    """Identifica qual fork de Proton está em um caminho.
    
    Analisa o diretório do Proton para detectar o fork:
    1. Lê toolmanifest.vdf ou compatibilitytool.vdf
    2. Verifica nome do diretório
    3. Verifica arquivos característicos (protonfixes, umu_helper, etc.)
    
    Returns: id do Proton (ex: "proton-cachyos") ou None.
    """
    if not proton_path or not os.path.isdir(proton_path):
        return None

    dirname = os.path.basename(proton_path)

    has_protonfixes = os.path.isdir(os.path.join(proton_path, "protonfixes"))
    has_umu_helper = os.path.isdir(os.path.join(proton_path, "umu_helper"))

    system32 = os.path.join(proton_path, "dist", "lib", "wine", "x86_64-windows")
    has_dxvk_sarek = False
    has_low_latency = False
    if os.path.isdir(system32):
        for f in os.listdir(system32):
            if "sarek" in f.lower():
                has_dxvk_sarek = True
            if "low_latency" in f.lower():
                has_low_latency = True

    patches_dir = os.path.join(proton_path, "patches")
    has_bolsa = False
    if os.path.isdir(patches_dir):
        if any("bolsa" in f.lower() for f in os.listdir(patches_dir)):
            has_bolsa = True

    is_wine_dir = os.path.isfile(os.path.join(proton_path, "wine")) or \
                  os.path.isfile(os.path.join(proton_path, "bin", "wine"))

    dl = dirname.lower()

    if "cachyos" in dl:
        return "proton-cachyos"
    if "miniloader" in dl and "proton" in dl:
        return "proton-ge-miniloader"
    if "ge-proton" in dl or dl.startswith("ge-proton"):
        return "proton-ge"
    if "umu-proton" in dl:
        return "umu-proton"
    if "dw-proton" in dl or "dwproton" in dl:
        return "dw-proton"
    if "proton-em" in dl or dl.startswith("em-"):
        return "proton-em"
    if "proton-rtsp" in dl:
        return "proton-ge-rtsp"
    if "proton-tkg" in dl:
        return "proton-tkg"
    if "proton-sarek" in dl:
        return "proton-sarek"
    if "proton-plop" in dl:
        return "proton-plop"
    if "proton-lina" in dl:
        return "proton-lina"
    if "proton-lfx2" in dl:
        return "proton-lfx2"
    if "speedhack" in dl:
        return "proton-speedhack"
    if "luxtorpeda" in dl:
        return "luxtorpeda"
    if "boxtron" in dl:
        return "boxtron"
    if "roberta" in dl:
        return "roberta"
    if "proton-ove" in dl or "ove-mc" in dl or "protonbuilds" in dl:
        return "proton-ove-mc"
    if "steam-tinker-launch" in dl or "steamtinkerlaunch" in dl:
        return "steam-tinker-launch"
    if "gwine" in dl:
        return "gwine"
    if "wine-miniloader" in dl:
        return "wine-miniloader"
    if "wine-proton" in dl or "kron4ek" in dl:
        if "staging" in dl and "tkg" in dl:
            return "wine-staging-tkg"
        if "staging" in dl:
            return "wine-staging"
        if "proton" in dl:
            return "wine-proton-kron4ek"
        return "wine-vanilla"
    if "proton-wine" in dl or "gamenative" in dl or "andrevto" in dl:
        if has_protonfixes:
            return "proton-ge"
        if "andrevto" in dl:
            return "proton-wine-andrevto"
        return "proton-wine-gamenative"
    if dl.startswith("proton-") and os.path.isfile(os.path.join(proton_path, "README.esync")):
        return "proton-wine-gamenative"
    if dl.startswith("wine-"):
        if "staging" in dl and "tkg" in dl:
            return "wine-staging-tkg"
        if "staging" in dl:
            return "wine-staging"
        if "proton" in dl:
            return "wine-proton-kron4ek"
        if "miniloader" in dl:
            return "wine-miniloader"
        return "wine-vanilla"

    if "proton" in dl and has_umu_helper:
        return "umu-proton"
    if "proton" in dl and has_protonfixes:
        return "proton-ge"

    for manifest_name in ("toolmanifest.vdf", "compatibilitytool.vdf"):
        manifest_path = os.path.join(proton_path, manifest_name)
        if os.path.isfile(manifest_path):
            try:
                with open(manifest_path) as f:
                    content = f.read().lower()
                if "cachyos" in content:
                    return "proton-cachyos"
                if "gloriouseggroll" in content:
                    return "proton-ge"
                if "dawn" in content or "winery" in content:
                    if "dwproton" in content or "dw-proton" in content:
                        return "dw-proton"
                    return "proton-ge-miniloader"
                if "steamtinkerlaunch" in content:
                    return "steam-tinker-launch"
            except OSError:
                pass

    if "proton" in dl:
        return "valve"

    if is_wine_dir:
        if "staging" in dl and "tkg" in dl:
            return "wine-staging-tkg"
        if "staging" in dl:
            return "wine-staging"
        if "proton" in dl:
            return "wine-proton-kron4ek"
        return "wine-vanilla"

    return None


# ── Consulta ─────────────────────────────────────────────────────────────────

def get_proton_info(proton_path: str) -> dict | None:
    proton_id = identify_proton(proton_path)
    if not proton_id:
        return None
    info = PROTON_KNOWLEDGE.get(proton_id)
    if not info:
        return None
    return {**info, "id": proton_id}


def get_definition(proton_id: str) -> dict | None:
    """Retorna definição crua pelo ID do fork."""
    return PROTON_KNOWLEDGE.get(proton_id)


def has_patch(proton_id: str, patch_name: str) -> bool:
    """Verifica se um Proton fork tem um patch específico."""
    info = PROTON_KNOWLEDGE.get(proton_id)
    if not info:
        return False
    return patch_name in info.get("patches", [])


def has_feature(proton_id: str, feature_name: str) -> bool:
    """Verifica se um Proton fork tem uma feature específica."""
    info = PROTON_KNOWLEDGE.get(proton_id)
    if not info:
        return False
    return info.get("features", {}).get(feature_name, False)


# ── Mapa feature → env vars ─────────────────────────────────────────────────

FEATURE_ENV_MAP: dict[str, dict[str, str]] = {
    "raytracing": {"VKD3D_CONFIG": "dxr", "DXVK_ENABLE_DXR": "1"},
    "hdr": {"DXVK_HDR": "1", "ENABLE_HDR_WSI": "1", "WINE_HDR_ENABLE": "1"},
    "dlss_upgrader": {"PROTON_ENABLE_DLSS_UPGRADER": "1"},
    "xess_upgrader": {"PROTON_ENABLE_XESS_UPGRADER": "1"},
    "async": {"DXVK_ASYNC": "1"},
    "async_shaders": {"DXVK_ASYNC": "1"},
    "fsr": {"WINE_FULLSCREEN_FSR": "1", "WINE_FULLSCREEN_FSR_STRENGTH": "2"},
    "fsr4": {"WINE_FULLSCREEN_FSR": "1", "WINE_FULLSCREEN_FSR_STRENGTH": "5", "PROTON_FSR4": "1"},
    "ntsync": {"PROTON_USE_NTSYNC": "1"},
    "local_shader_cache": {"PROTON_LOCAL_SHADER_CACHE": "1"},
    "per_game_shader_cache": {"PROTON_PER_GAME_SHADER_CACHE": "1"},
    "gamemode": {"GAMEMODE_ENABLED": "1"},
    "wayland": {"SDL_VIDEO_DRIVER": "wayland", "GDK_BACKEND": "wayland", "QT_QPA_PLATFORM": "wayland;xcb"},
    "anticheat_optimizations": {
        "PROTON_DISABLE_EAC_WINEHACK": "1",
        "PROTON_DISABLE_BATTLEYE_WINEHACK": "1",
        "PROTON_ENABLE_EAC_WINEHACK": "0",
        "PROTON_ENABLE_BATTLEYE_WINEHACK": "0",
    },
    "eac_improvements": {
        "PROTON_EAC_ENABLE": "1",
        "PROTON_BATTLEYE_ENABLE": "1",
        "PROTON_DISABLE_EAC_WINEHACK": "1",
        "PROTON_ENABLE_EAC_WINEHACK": "0",
    },
}

FEATURE_PATCH_ENV: dict[str, dict[str, str]] = {
    "wine_miniloader_name": {"WINE_MINILOADER_NAME": ""},
    "ntsync": {"PROTON_USE_NTSYNC": "1"},
}


# ── Aplicação de configuração ────────────────────────────────────────────────

def apply_proton_config(proton_id: str, env: dict[str, str]) -> dict[str, str]:
    """Aplica configurações específicas do Proton nas env vars.

    Data-driven: lê features + patches + env_defaults + dxvk_nvapi da definição
    e aplica via FEATURE_ENV_MAP. Features desconhecidas são ignoradas.
    Ordem de precedência: env_defaults < features < user overrides (--env)
    """
    info = PROTON_KNOWLEDGE.get(proton_id)
    if not info:
        return env

    features = info.get("features", {})
    patches = info.get("patches", [])

    # 1. env_defaults — base defaults do fork (sobrescrevem nada ainda)
    if info.get("env_defaults"):
        env.update(info["env_defaults"])

    # 2. dxvk_nvapi
    if info.get("dxvk_nvapi"):
        env["DXVK_ENABLE_NVAPI"] = "1"

    # 3. Features — cada feature ativa suas env vars (sobrescreve env_defaults)
    for feat_name, feat_env in FEATURE_ENV_MAP.items():
        if features.get(feat_name):
            env.update(feat_env)

    # 4. Patches → env vars
    for patch_name, patch_env in FEATURE_PATCH_ENV.items():
        if patch_name in patches:
            env.update(patch_env)

    return env


# ── Getters especializados ──────────────────────────────────────────────────

def get_dll_overrides(proton_id: str) -> dict[str, str]:
    """Retorna DLL overrides específicos do Proton fork.
    
    Ex: {"winemenubuilder.exe": "", "mscoree": ""}
    """
    info = PROTON_KNOWLEDGE.get(proton_id)
    if not info:
        return {}
    return dict(info.get("dll_overrides", {}))


def get_container_overrides(proton_id: str) -> dict:
    """Retorna configurações específicas para o container bwrap.
    
    Ex: {"ntsync": True, "nvidia_libs_bundled": True}
    """
    info = PROTON_KNOWLEDGE.get(proton_id)
    if not info:
        return {}
    return dict(info.get("container_overrides", {}))


def get_ld_extra(proton_id: str) -> list[str]:
    info = PROTON_KNOWLEDGE.get(proton_id)
    if info:
        return info.get("ld_library_path_extra", [])
    return []


def get_patches(proton_id: str) -> list[str]:
    """Retorna lista de patches do Proton fork."""
    info = PROTON_KNOWLEDGE.get(proton_id)
    if info:
        return list(info.get("patches", []))
    return []


def skip_nvidia_overrides(proton_id: str) -> bool:
    """Verifica se devemos pular overrides NVIDIA no container.
    
    Verdadeiro se o Proton tem:
    - 'nvidia_libs_bundled' em patches
    - 'nvidia_libs_bundled': True em container_overrides
    """
    if not proton_id:
        return False
    if has_patch(proton_id, "nvidia_libs_bundled"):
        return True
    container_ov = get_container_overrides(proton_id)
    return container_ov.get("nvidia_libs_bundled", False)


# ── Utilitários ──────────────────────────────────────────────────────────────

def list_proton_ids() -> list[str]:
    return list(PROTON_KNOWLEDGE.keys())


def list_proton_names() -> list[dict]:
    return [
        {"id": pid, "name": info["name"], "author": info["author"]}
        for pid, info in PROTON_KNOWLEDGE.items()
    ]


def compare_protons(pid_a: str, pid_b: str) -> dict:
    a = PROTON_KNOWLEDGE.get(pid_a, {})
    b = PROTON_KNOWLEDGE.get(pid_b, {})

    a_features = a.get("features", {})
    b_features = b.get("features", {})

    only_a = {k: v for k, v in a_features.items() if v and not b_features.get(k)}
    only_b = {k: v for k, v in b_features.items() if v and not a_features.get(k)}

    return {
        f"{pid_a}_only": list(only_a.keys()),
        f"{pid_b}_only": list(only_b.keys()),
        "common": [k for k in a_features if a_features.get(k) and b_features.get(k)],
    }
