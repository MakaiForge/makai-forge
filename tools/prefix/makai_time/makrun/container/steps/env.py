"""
# =============================================================================
# !!! ATENÇÃO: NÃO MODIFICAR SEM AUTORIZAÇÃO EXPLÍCITA !!!
# =============================================================================
# Configura TODAS as variáveis de ambiente dentro do container bwrap.
# Cada env var aqui é passada via --setenv e é a ÚNICA coisa que o
# processo do Proton/jogo vê (por causa do --clearenv).
#
# Se uma env var importante faltar, o Proton trava:
#   - STEAM_COMPAT_CLIENT_INSTALL_PATH → Proton exige path válido
#   - WINEPREFIX → Wine não sabe onde está o prefixo
#   - LD_LIBRARY_PATH → linker não encontra as libs
#
# NÃO ADICIONAR:
#   - Env vars específicas de jogo (vai em profiles.py ou protonfixes)
#   - Env vars de features (vai em injector.py → passo 5 aqui)
#   - Configs de GPU/áudio/display que já estão em definitions/
#
# Se PRECISAR adicionar uma env var, PRIMEIRO verifica se ela já não
# está sendo injetada pelo injector (passo 5) ou pela definition.
# =============================================================================
"""

import os
from pathlib import Path
from makrun.container.steps import StepResult


CONTAINER_VAR = "makai"

# Env vars Steam que o Proton espera
STEAM_VARS = [
    "STEAM_COMPAT_APP_ID", "SteamAppId", "SteamGameId",
    "STEAM_COMPAT_DATA_PATH", "STEAM_COMPAT_INSTALL_PATH",
    "STEAM_COMPAT_CLIENT_INSTALL_PATH", "STEAM_COMPAT_TOOL_PATHS",
    "STEAM_COMPAT_MOUNTS", "STEAM_COMPAT_LIBRARY_PATHS",
    "STEAM_COMPAT_SHADER_PATH",
]

LOCALE_VARS = (
    "LANG", "LANGUAGE", "LC_ALL", "LC_CTYPE", "LC_NUMERIC",
    "LC_TIME", "LC_COLLATE", "LC_MONETARY", "LC_MESSAGES",
    "LC_PAPER", "LC_NAME", "LC_ADDRESS", "LC_TELEPHONE",
    "LC_MEASUREMENT", "LC_IDENTIFICATION",
)


def _add_env(args: list[str], key: str, val: str) -> None:
    args.extend(["--setenv", key, val])


def configure(env: dict, features: dict, config: dict,
              mounts_extra: dict | None = None,
              gpu_info: dict | None = None) -> StepResult:
    """Configura todas as env vars do container."""
    args = []
    env_cfg = config.get("env", {})

    # Paths dos mounts (vindos do step mounts.py)
    proton_container = (mounts_extra or {}).get("proton_container", "/proton")
    prefix_container = (mounts_extra or {}).get("prefix_container", "")
    game_container = (mounts_extra or {}).get("game_container", "")
    home = (mounts_extra or {}).get("home", str(Path.home()))
    exe_resolved = (mounts_extra or {}).get("exe_resolved")

    # 1. Env vars base
    _add_env(args, "PATH", "/usr/bin:/usr/sbin:/bin:/sbin")
    _add_env(args, "container", CONTAINER_VAR)
    _add_env(args, "WINEPREFIX", prefix_container)
    _add_env(args, "PROTONPATH", proton_container)
    _add_env(args, "HOME", home)

    # 2. Steam env vars
    for var in STEAM_VARS:
        val = env.get(var)
        if var in ("STEAM_COMPAT_DATA_PATH",):
            val = prefix_container
        elif var == "STEAM_COMPAT_INSTALL_PATH":
            val = game_container
        elif var == "STEAM_COMPAT_TOOL_PATHS":
            val = f"{proton_container}:{env.get('RUNTIMEPATH', '')}"
        elif var == "STEAM_COMPAT_MOUNTS":
            val = f"{proton_container}:{env.get('RUNTIMEPATH', '')}"
        elif var == "STEAM_COMPAT_LIBRARY_PATHS":
            val = env.get(var) or str(Path.home() / ".steam" / "steam")
        elif var == "STEAM_COMPAT_CLIENT_INSTALL_PATH":
            val = env.get(var) or "/tmp"  # Proton espera path válido; /tmp sempre existe
        elif var == "STEAM_COMPAT_SHADER_PATH":
            val = env.get(var) or f"{prefix_container}/shadercache"
        if val:
            _add_env(args, var, str(val))

    # 3. GAMEID / PROTON_VERB
    _add_env(args, "GAMEID", env.get("GAMEID", ""))
    _add_env(args, "PROTON_VERB", env.get("PROTON_VERB", "waitforexitandrun"))

    # 4. Configs específicas do Proton (env)
    for k, v in env_cfg.items():
        if v is not None:
            _add_env(args, k, str(v))

    # 5. Features do injector
    if features and features.get("env"):
        for k, v in features["env"].items():
            if v is not None:
                _add_env(args, k, str(v))

    # 6. Paths das libs
    runtime_lib_path = [
        "/overrides/lib",
        "/overrides/lib32",
        "/lib",
        "/lib/x86_64-linux-gnu",
        "/lib/i386-linux-gnu",
        "/lib/x86_64-linux-gnu/pulseaudio",
        "/lib/i386-linux-gnu/pulseaudio",
        "/usr/lib/x86_64-linux-gnu/pulseaudio",
        "/usr/lib/i386-linux-gnu/pulseaudio",
    ]
    ld_extra = config.get("container", {}).get("ld_library_path_extra", [])
    runtime_lib_path.extend(ld_extra)
    runtime_lib_str = ":".join(runtime_lib_path)
    _add_env(args, "LD_LIBRARY_PATH", runtime_lib_str)
    _add_env(args, "STEAM_RUNTIME_LIBRARY_PATH", runtime_lib_str)

    # 7. GPU env vars
    if gpu_info:
        if gpu_info.get("vk_icd"):
            _add_env(args, "VK_ICD_FILENAMES", gpu_info["vk_icd"])
            _add_env(args, "VK_DRIVER_FILES", gpu_info["vk_icd"])
        if gpu_info.get("vk_implicit"):
            _add_env(args, "VK_IMPLICIT_LAYER_PATH", gpu_info["vk_implicit"])
        if gpu_info.get("vk_explicit"):
            _add_env(args, "VK_LAYER_PATH", gpu_info["vk_explicit"])

        gpu_cfg = config.get("gpu", {})
        if gpu_cfg.get("egl_vendor_nvidia_only") and gpu_info.get("egl_vendor"):
            _add_env(args, "__EGL_VENDOR_LIBRARY_FILENAMES",
                     f"{gpu_info['egl_vendor']}/10_nvidia.json")
        _add_env(args, "__GLX_VENDOR_LIBRARY_NAME",
                 gpu_cfg.get("glx_vendor", "nvidia"))

        if gpu_info.get("dri_path"):
            _add_env(args, "LIBGL_DRIVERS_PATH", gpu_info["dri_path"])
        if gpu_info.get("gbm_path"):
            _add_env(args, "GBM_BACKENDS_PATH", gpu_info["gbm_path"])

    # 8. Display env vars
    display_cfg = config.get("display", {})
    _add_env(args, "DISPLAY", display_cfg.get("display_env",
              os.environ.get("DISPLAY", ":0")))
    _add_env(args, "WAYLAND_DISPLAY", display_cfg.get("wayland_display",
              os.environ.get("WAYLAND_DISPLAY", "wayland-0")))
    _add_env(args, "XDG_SESSION_TYPE", display_cfg.get("xdg_session_type",
              os.environ.get("XDG_SESSION_TYPE", "")))

    # Xauthority
    xauth_env = os.environ.get("XAUTHORITY", "")
    xauth = Path(xauth_env) if xauth_env else Path.home() / ".Xauthority"
    if xauth.is_file():
        _add_env(args, "XAUTHORITY", str(xauth))
    else:
        xauth_dir = Path(f"/run/user/{os.getuid()}")
        if xauth_dir.is_dir():
            candidates = sorted(xauth_dir.glob("xauth_*"),
                                key=lambda p: p.stat().st_mtime, reverse=True)
            if candidates:
                _add_env(args, "XAUTHORITY", str(candidates[0]))

    _add_env(args, "XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
    _add_env(args, "DBUS_SESSION_BUS_ADDRESS",
             f"unix:path=/run/user/{os.getuid()}/bus")

    # 9. Audio env vars
    audio_cfg = config.get("audio", {})
    pulse_server = audio_cfg.get("pulse_server",
        f"unix:/run/user/{os.getuid()}/pulse/native")
    _add_env(args, "PULSE_SERVER", pulse_server)
    _add_env(args, "ALSOFT_DRIVERS", audio_cfg.get("alsoft_drivers", "pulse,alsa"))

    pulse_config = audio_cfg.get("pulse_clientconfig", "enable-shm=no")
    if pulse_config:
        pulse_conf_path = Path("/tmp/.makrun-pulse-client.conf")
        if not pulse_conf_path.exists():
            pulse_conf_path.write_text(pulse_config + "\n")
        _add_env(args, "PULSE_CLIENTCONFIG", str(pulse_conf_path))

    pulse_cookie = Path.home() / ".config" / "pulse" / "cookie"
    if pulse_cookie.is_file():
        _add_env(args, "PULSE_COOKIE", str(pulse_cookie))

    # 10. Locale (pass-through do host)
    for _var in LOCALE_VARS:
        _val = os.environ.get(_var) or env.get(_var)
        if _val:
            _add_env(args, _var, _val)

    # 11. UMU env vars
    # SEMPRE passa UMU_ID pro container. O Proton usa UMU_ID pra decidir
    # entre umu.exe (path conversion Unix→Windows, jogos não-Steam) ou
    # steam.exe (Steam). Sem UMU_ID, jogos com launcher (NTE, Genshin)
    # não conseguem rodar porque o Proton tenta iniciar o steam.exe.
    _add_env(args, "UMU_ID", env.get("GAMEID", ""))
    _add_env(args, "UMU_INVOCATION_ID", env.get("UMU_INVOCATION_ID", ""))
    _add_env(args, "STORE", env.get("STORE", "umu"))
    _add_env(args, "EXE", env.get("EXE", ""))
    _add_env(args, "UMU_STEAM_GAME_ID", env.get("SteamGameId", ""))

    # 12. WINEDEBUG (pass-through se veio de fora)
    _winedebug = os.environ.get("WINEDEBUG") or env.get("WINEDEBUG")
    if _winedebug:
        _add_env(args, "WINEDEBUG", _winedebug)

    # 13. WINEDLLOVERRIDES
    _wine_dlls = env.get("WINEDLLOVERRIDES", "")
    if _wine_dlls:
        _add_env(args, "WINEDLLOVERRIDES", _wine_dlls)

    # 14. WINEPREFIX no os.environ (para steps seguintes)
    os.environ["WINEPREFIX"] = prefix_container
    if exe_resolved:
        os.environ["EXE"] = str(exe_resolved)

    return StepResult(
        args=args,
        applied=True,
        summary=f"env: {len(args)//2} vars setadas (features={len((features or {}).get('env', {}))})",
    )
