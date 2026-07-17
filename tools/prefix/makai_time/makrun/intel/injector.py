"""Feature injection: aplica features do fork como env vars + compat_config.

Pipeline:
  1. identify_proton() → fork_id
  2. Carrega DEFINITION do fork (features, patches, env_defaults)
  3. Aplica como env vars PROTON_* que o Proton script entende
  4. Aplica container_overrides (ntsync, nvidia_libs_bundled, etc.)
  5. Aplica per-game profile (se existir)
  6. Aplica anti-cheat relaxations (se detectado)
  7. Retorna dict com todas as env vars + launch method
"""

from __future__ import annotations

import os
import logging
from pathlib import Path
from typing import Any

from makrun.intel import identify_proton, PROTON_KNOWLEDGE
from makrun.intel.anticheat import (
    detect_anticheat,
    get_ac_env_vars,
    get_ac_container_bwrap_flags,
    get_ac_container_relaxations,
)

log = logging.getLogger("makrun.intel.injector")


# ── Launch strategy map ──────────────────────────────────────────────────────

LAUNCH_STRATEGY: dict[str, dict[str, Any]] = {
    "valve": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
    },
    "proton-ge": {
        "method": "wine_preloader",
        "wineloadernoexec": True,
        "use_preloader": True,
    },
    "umu-proton": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
        "use_umu_exe": True,
    },
    "proton-cachyos": {
        "method": "wine_preloader",
        "wineloadernoexec": True,
        "use_preloader": True,
    },
    "dw-proton": {
        "method": "wine_preloader",
        "wineloadernoexec": True,
        "use_preloader": True,
    },
    "proton-em": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_start_unix": True,
    },
    "proton-ge-miniloader": {
        "method": "wine_preloader",
        "wineloadernoexec": True,
        "use_preloader": True,
    },
    "proton-ge-rtsp": {
        "method": "wine_preloader",
        "wineloadernoexec": True,
        "use_preloader": True,
    },
    "proton-sarek": {
        "method": "wine_preloader",
        "wineloadernoexec": True,
        "use_preloader": True,
    },
    "proton-tkg": {
        "method": "wine_preloader",
        "wineloadernoexec": True,
        "use_preloader": True,
    },
    "proton-plop": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
    },
    "proton-lina": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
    },
    "proton-lfx2": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
    },
    "proton-speedhack": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
    },
    "proton-ove-mc": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
    },
    "luxtorpeda": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
    },
    "boxtron": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
    },
    "roberta": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
    },
    "steam-tinker-launch": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
    },
    "wine_staging_tkg": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
    },
    "wine_vanilla": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
    },
    "wine_staging": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
    },
    "wine_proton_kron4ek": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
    },
    "gwine": {
        "method": "wine64",
        "wineloadernoexec": False,
        "use_preloader": False,
    },
}


# ── Feature→env var map ──────────────────────────────────────────────────────

_FEATURE_ENV_MAP: dict[str, dict[str, str]] = {
    "ntsync": {
        "WINE_NTSYNC": "1",
        "WINENTSYNC": "1",
    },
    "wayland": {
        "PROTON_ENABLE_WAYLAND": "1",
    },
    "fsr": {
        "WINE_FULLSCREEN_FSR": "1",
    },
    "fsr4": {
        "WINE_FULLSCREEN_FSR": "1",
        "PROTON_FSR4_INDICATOR": "1",
    },
    "dlss_upgrader": {
        "PROTON_DLSS_INDICATOR": "1",
    },
    "xess_upgrader": {
        "PROTON_XESS_INDICATOR": "1",
    },
    "raytracing": {
        "PROTON_ENABLE_RAYTRACING": "1",
        "DXVK_ENABLE_RAYTRACING": "1",
    },
    "gamemode": {
        "GAMEMODE": "1",
    },
    "hdr": {
        "PROTON_HDR": "1",
        "WINE_HDR": "1",
    },
    "local_shader_cache": {
        "PROTON_LOCAL_SHADER_CACHE": "1",
    },
    "per_game_shader_cache": {
        "PROTON_PER_GAME_SHADER_CACHE": "1",
    },
}


# ── Patch→env var map ────────────────────────────────────────────────────────

_PATCH_ENV_MAP: dict[str, dict[str, str]] = {
    "dxvk_sarek": {
        "PROTON_DXVK_SAREK": "1",
    },
    "dxvk_low_latency": {
        "PROTON_DXVK_LOWLATENCY": "1",
    },
    "dxvk_llasync": {
        "PROTON_DXVK_LLASYNC": "1",
    },
    "nvidia_libs_bundled": {
        "PROTON_NVIDIA_LIBS": "1",
        "PROTON_NVIDIA_NVML": "1",
        "PROTON_NVIDIA_NVENC": "1",
    },
    "cuda_physx": {
        "PROTON_NVIDIA_NVCUDA": "1",
        "PROTON_NVIDIA_NVOPTIX": "1",
    },
    "vkreflex": {
        "DXVK_NVAPI_VKREFLEX": "1",
    },
    "vkbasalt": {
        "ENABLE_VKBASALT": "1",
    },
    "mediaconv": {
        "PROTON_ENABLE_MEDIACONV": "1",
    },
    "gplasync": {
        "PROTON_DXVK_GPLASYNC": "1",
    },
    "wayland": {
        "PROTON_ENABLE_WAYLAND": "1",
    },
    "winewayland": {
        "PROTON_ENABLE_WAYLAND": "1",
    },
    "media_playback": {
        "PROTON_MEDIA_PLAYBACK": "1",
    },
    "eac_bypass": {
        "PROTON_EAC_ENABLE": "1",
        "PROTON_DISABLE_EAC_WINEHACK": "1",
    },
    "anticheat": {
        "PROTON_BATTLEYE_ENABLE": "1",
        "PROTON_EAC_ENABLE": "1",
    },
}


def inject_features(
    proton_path: str,
    game_id: str | None = None,
    game_exe: str | None = None,
    steam_app_id: str | None = None,
) -> dict[str, Any]:
    """Identifica o fork do Proton e retorna env vars + launch config.

    Returns:
        {
            "fork_id": "proton-cachyos",
            "env": { "WINEDEBUG": "-all", ... },
            "launch": { "method": "wine_preloader", "wineloadernoexec": True },
            "container_flags": [ "--no-unshare-pid", ... ],
            "container_relaxations": ["no_unshare_pid"],
        }
    """
    result: dict[str, Any] = {
        "fork_id": None,
        "env": {},
        "launch": {},
        "container_flags": [],
    }

    if not proton_path or not os.path.isdir(proton_path):
        log.warning("Invalid proton path: %s", proton_path)
        return result

    fork_id = identify_proton(proton_path)
    if not fork_id:
        log.warning("Could not identify fork for: %s", proton_path)
        return result

    result["fork_id"] = fork_id
    log.info("Proton identificado: %s → %s", os.path.basename(proton_path), fork_id)

    definition = PROTON_KNOWLEDGE.get(fork_id, {})

    # 1. Env defaults da definição
    env_defaults = definition.get("env_defaults", {})
    result["env"].update(env_defaults)

    # 2. Features → env vars
    features = definition.get("features", {})
    for feature_name, enabled in features.items():
        if enabled and feature_name in _FEATURE_ENV_MAP:
            result["env"].update(_FEATURE_ENV_MAP[feature_name])

    # 3. Patches → env vars
    patches = definition.get("patches", [])
    for patch_name in patches:
        if patch_name in _PATCH_ENV_MAP:
            result["env"].update(_PATCH_ENV_MAP[patch_name])

    # 4. Launch strategy
    launch = LAUNCH_STRATEGY.get(fork_id, LAUNCH_STRATEGY["valve"])
    result["launch"] = dict(launch)

    # 5. Anti-cheat (se tiver game_exe ou steam_app_id)
    if game_exe or steam_app_id:
        _apply_anticheat(result, game_exe, steam_app_id)

    # 6. Per-game profile (do profiles.py)
    if game_id:
        _apply_profile(result, game_id, game_exe)

    return result


def _apply_anticheat(
    result: dict[str, Any],
    game_exe: str | None,
    steam_app_id: str | None,
) -> None:
    """Detecta anti-cheat e adiciona env vars + container flags."""
    try:
        ac_env = get_ac_env_vars(game_exe or "", steam_app_id)
        result["env"].update(ac_env)

        relaxations = get_ac_container_relaxations(game_exe or "", steam_app_id)
        if relaxations:
            result["container_relaxations"] = relaxations

        bwrap_flags = get_ac_container_bwrap_flags(game_exe or "", steam_app_id)
        if bwrap_flags:
            result["container_flags"].extend(bwrap_flags)

        ac_data = detect_anticheat(game_exe or "", steam_app_id)
        if ac_data:
            log.info("Anti-cheat detectado: %s", ac_data.get("ac_types", []))

    except Exception as e:
        log.debug("Anti-cheat detection error: %s", e)


def _apply_profile(result: dict[str, Any], game_id: str | None, game_exe: str | None = None) -> None:
    """Aplica perfil do jogo se existir (engine, sync, env vars)."""
    try:
        from makrun.intel.profiles import get_profile, find_by_exe

        profile = None
        if game_id:
            profile = get_profile(game_id)

        if not profile and game_exe:
            matches = find_by_exe(os.path.basename(game_exe), game_exe)
            if matches:
                profile = matches[0]

        if profile:
            log.info("Perfil encontrado: %s", profile.get("name"))
            profile_env = profile.get("env", {})
            result["env"].update(profile_env)

            if profile.get("no_fsync"):
                result["env"]["PROTON_NO_FSYNC"] = "1"
            if profile.get("use_wined3d"):
                result["env"]["PROTON_USE_WINED3D"] = "1"

    except Exception as e:
        log.debug("Profile load error: %s", e)
